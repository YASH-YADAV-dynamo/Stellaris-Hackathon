/**
 * WebSocket aggregator for MCP server.
 * Connects to all DEX WebSockets and maintains in-memory state.
 */

import WebSocket from 'ws';
import type { Level } from '../types/orderbook';
import { computeImbalance } from '../lib/formulas';
import {
  createNoiseState,
  computeTradingSignal,
  type NoiseReductionState,
} from '../lib/noiseReduction';
import { ADAPTERS, type DexAdapter, type AdapterId } from '../lib/dexAdapters';
import { DEFAULT_FORMULA_PARAMS, type FormulaType, type FormulaParams } from '../types/orderbook';

const EMA_HALFLIFE_MS = 1000;

function mapToLevels(map: Map<string, number>, descending: boolean): Level[] {
  return [...map.entries()]
    .sort(([a], [b]) =>
      descending ? parseFloat(b) - parseFloat(a) : parseFloat(a) - parseFloat(b),
    )
    .slice(0, 50)
    .map(([p, a]) => ({ p, a: a.toString(), n: 0 }));
}

export interface DexState {
  adapterId: AdapterId;
  bids: Level[];
  asks: Level[];
  imbalance: number;
  emaImbalance: number;
  tradingSignal: ReturnType<typeof computeTradingSignal> | null;
  totalBidVol: number;
  totalAskVol: number;
  spread: number;
  connected: boolean;
  lastUpdate: number;
}

export type SignalType = 'noise-reduction' | 'raw';

export class WSAggregator {
  private pairId: string;
  private formula: FormulaType;
  private params: FormulaParams;
  private signalType: SignalType;

  private state = new Map<AdapterId, DexState>();
  private wsMap = new Map<AdapterId, WebSocket>();
  private bidMapMap = new Map<AdapterId, Map<string, number>>();
  private askMapMap = new Map<AdapterId, Map<string, number>>();
  private prevBidsMap = new Map<AdapterId, Level[]>();
  private prevAsksMap = new Map<AdapterId, Level[]>();
  private emaMap = new Map<AdapterId, number>();
  private lastEmaTMap = new Map<AdapterId, number>();
  private noiseStateMap = new Map<AdapterId, NoiseReductionState>();
  private lastNoiseTMap = new Map<AdapterId, number>();

  constructor(
    pairId: string,
    formula: FormulaType = 'distanceWeighted',
    params: FormulaParams = DEFAULT_FORMULA_PARAMS,
    signalType: SignalType = 'noise-reduction',
  ) {
    this.pairId = pairId;
    this.formula = formula;
    this.params = params;
    this.signalType = signalType;
  }

  connect(): void {
    for (const [id, adapter] of Object.entries(ADAPTERS) as [AdapterId, DexAdapter][]) {
      const wsSymbol = adapter.toWsSymbol(this.pairId);
      if (!wsSymbol) continue;

      const bidMap = new Map<string, number>();
      const askMap = new Map<string, number>();
      this.bidMapMap.set(id, bidMap);
      this.askMapMap.set(id, askMap);
      this.prevBidsMap.set(id, []);
      this.prevAsksMap.set(id, []);
      this.emaMap.set(id, 0);
      this.lastEmaTMap.set(id, 0);
      this.noiseStateMap.set(id, createNoiseState());
      this.lastNoiseTMap.set(id, 0);

      this.state.set(id, {
        adapterId: id,
        bids: [],
        asks: [],
        imbalance: 0,
        emaImbalance: 0,
        tradingSignal: null,
        totalBidVol: 0,
        totalAskVol: 0,
        spread: 0,
        connected: false,
        lastUpdate: 0,
      });

      try {
        const url = adapter.getWsUrl(wsSymbol);
        const ws = new WebSocket(url);
        this.wsMap.set(id, ws);

        ws.on('open', () => {
          if (adapter.buildSubscribeMsg) {
            ws.send(JSON.stringify(adapter.buildSubscribeMsg(wsSymbol)));
          }
          this.updateState(id, { connected: true });
        });

        ws.on('message', (data: Buffer | string) => {
          let raw: unknown;
          try {
            raw = JSON.parse(typeof data === 'string' ? data : data.toString());
          } catch {
            return;
          }

          const bidMap = this.bidMapMap.get(id)!;
          const askMap = this.askMapMap.get(id)!;
          const result = adapter.processMessage(raw, bidMap, askMap);
          if (!result) return;

          let bids: Level[];
          let asks: Level[];
          if (result.mode === 'direct') {
            bids = result.bids;
            asks = result.asks;
          } else {
            bids = mapToLevels(bidMap, true);
            asks = mapToLevels(askMap, false);
          }

          const prevBids = this.prevBidsMap.get(id)!;
          const prevAsks = this.prevAsksMap.get(id)!;
          const imbalance = computeImbalance(
            this.formula,
            this.params,
            bids,
            asks,
            prevBids,
            prevAsks,
          );
          this.prevBidsMap.set(id, bids);
          this.prevAsksMap.set(id, asks);

          const totalBidVol = bids.reduce((s, l) => s + parseFloat(l.a), 0);
          const totalAskVol = asks.reduce((s, l) => s + parseFloat(l.a), 0);
          const bestBid = bids[0] ? parseFloat(bids[0].p) : 0;
          const bestAsk = asks[0] ? parseFloat(asks[0].p) : 0;
          const spread = bestBid && bestAsk ? Math.max(0, bestAsk - bestBid) : 0;
          const now = Date.now();

          const lastEmaT = this.lastEmaTMap.get(id) ?? 0;
          const dt = lastEmaT ? now - lastEmaT : EMA_HALFLIFE_MS;
          const alpha = 1 - Math.exp(-dt / EMA_HALFLIFE_MS);
          const prevEma = this.emaMap.get(id) ?? 0;
          const ema = alpha * imbalance + (1 - alpha) * prevEma;
          this.emaMap.set(id, ema);
          this.lastEmaTMap.set(id, now);

          const noiseState = this.noiseStateMap.get(id)!;
          const lastNoiseT = this.lastNoiseTMap.get(id) ?? 0;
          const tradingSignal = computeTradingSignal(
            imbalance,
            noiseState,
            now,
            lastNoiseT,
            { emaHalfLifeMs: EMA_HALFLIFE_MS },
          );
          this.lastNoiseTMap.set(id, now);

          this.updateState(id, {
            bids,
            asks,
            imbalance,
            emaImbalance: ema,
            tradingSignal,
            totalBidVol,
            totalAskVol,
            spread,
            connected: true,
            lastUpdate: now,
          });
        });

        ws.on('close', () => {
          this.updateState(id, { connected: false });
        });

        ws.on('error', () => {
          this.updateState(id, { connected: false });
        });
      } catch {
        this.updateState(id, { connected: false });
      }
    }
  }

  private updateState(id: AdapterId, patch: Partial<DexState>): void {
    const prev = this.state.get(id);
    if (prev) {
      this.state.set(id, { ...prev, ...patch });
    }
  }

  disconnect(): void {
    for (const ws of this.wsMap.values()) {
      ws.close();
    }
    this.wsMap.clear();
  }

  getState(): Map<AdapterId, DexState> {
    return this.state;
  }

  getSignals(): Record<string, { value: number; confidence: number; raw: number }> {
    const out: Record<string, { value: number; confidence: number; raw: number }> = {};
    for (const [id, s] of this.state) {
      if (!s.connected) continue;
      const value =
        this.signalType === 'noise-reduction' && s.tradingSignal
          ? s.tradingSignal.value
          : s.imbalance;
      const confidence = s.tradingSignal?.confidence ?? 1;
      out[id] = { value, confidence, raw: s.imbalance };
    }
    return out;
  }

  getLeaderboard(): Array<{ rank: number; dexId: string; imbalance: number; confidence: number }> {
    const entries = [...this.state.entries()]
      .filter(([, s]) => s.connected)
      .map(([, s]) => ({
        dexId: s.adapterId,
        imbalance:
          this.signalType === 'noise-reduction' && s.tradingSignal
            ? s.tradingSignal.value
            : s.imbalance,
        confidence: s.tradingSignal?.confidence ?? 1,
      }));
    entries.sort((a, b) => Math.abs(b.imbalance) - Math.abs(a.imbalance));
    return entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  getArbitrage(): {
    max: { pair: string; buyDex: string; sellDex: string; score: number } | null;
    opportunities: Array<{ buyDex: string; sellDex: string; score: number }>;
  } {
    const entries = [...this.state.entries()].filter(([, s]) => s.connected);
    const opportunities: Array<{ buyDex: string; sellDex: string; score: number }> = [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, sA] = entries[i];
        const [idB, sB] = entries[j];
        const imbA =
          this.signalType === 'noise-reduction' && sA.tradingSignal
            ? sA.tradingSignal.value
            : sA.imbalance;
        const imbB =
          this.signalType === 'noise-reduction' && sB.tradingSignal
            ? sB.tradingSignal.value
            : sB.imbalance;
        const diff = Math.abs(imbA - imbB);
        const liquidity = Math.min(
          sA.totalBidVol,
          sA.totalAskVol,
          sB.totalBidVol,
          sB.totalAskVol,
        );
        const spreadPenalty = 1 / (1 + (sA.spread + sB.spread) / 2);
        const score = diff * Math.min(liquidity / 1e6, 1) * spreadPenalty;

        const buyDex = imbA > imbB ? idA : idB;
        const sellDex = imbA > imbB ? idB : idA;
        opportunities.push({ buyDex, sellDex, score });
      }
    }

    opportunities.sort((a, b) => b.score - a.score);
    const max = opportunities[0]
      ? {
          pair: this.pairId,
          buyDex: opportunities[0].buyDex,
          sellDex: opportunities[0].sellDex,
          score: opportunities[0].score,
        }
      : null;

    return { max, opportunities };
  }
}
