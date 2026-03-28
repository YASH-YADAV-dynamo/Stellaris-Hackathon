'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AggLevel,
  DEFAULT_FORMULA_PARAMS,
  FormulaParams,
  FormulaType,
  HistoryPoint,
  Level,
  NoiseReductionState,
  OrderbookState,
} from '@/types/orderbook';
import { computeImbalance } from '@/lib/formulas';
import { createNoiseState, computeTradingSignal } from '@/lib/noiseReduction';
import type { DexAdapter } from '@/lib/dexAdapters';

const HISTORY_DURATION_MS  = 60_000;
const RECONNECT_DELAY_MS   = 3_000;
const MAX_RETRIES          = 5;
const HISTORY_SAMPLE_MS    = 200;   // max 5 history points/sec
const EMA_HALFLIFE_MS      = 1000;  // ~1 s smoothing for fair comparison

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function mapToLevels(map: Map<string, number>, descending: boolean): Level[] {
  return [...map.entries()]
    .sort(([a], [b]) =>
      descending ? parseFloat(b) - parseFloat(a) : parseFloat(a) - parseFloat(b),
    )
    .slice(0, 50)
    .map(([p, a]) => ({ p, a: a.toString(), n: 0 }));
}

const defaultState = (symbol: string): OrderbookState => ({
  bids: [], asks: [], symbol,
  timestamp: 0, imbalance: 0, emaImbalance: 0,
  totalBidVol: 0, totalAskVol: 0, spread: 0,
  connected: false, connecting: false, error: null,
});

/**
 * Generic real-time orderbook hook driven by a DexAdapter config.
 * Handles WebSocket lifecycle, reconnect, ping, imbalance computation, and history.
 *
 * @param adapter       — DEX adapter (stable module-level constant)
 * @param displaySymbol — symbol as shown in the UI (e.g. "BTC")
 * @param formula       — imbalance formula (updated via ref; no reconnect)
 * @param params        — formula parameters (updated via ref; no reconnect)
 * @param aggLevel      — aggregation level (Pacifica only; triggers reconnect)
 */
export function useDexOrderbook(
  adapter:       DexAdapter,
  displaySymbol: string,
  formula:       FormulaType,
  params:        FormulaParams,
  aggLevel?:     AggLevel,
  referenceMid?: number,
) {
  const [state,   setState]   = useState<OrderbookState>(() => defaultState(displaySymbol));
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const connectionRef = useRef({ connected: false, connecting: false, error: null as string | null });

  const wsRef         = useRef<WebSocket | null>(null);
  const pingRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef      = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bidMapRef     = useRef(new Map<string, number>());
  const askMapRef     = useRef(new Map<string, number>());
  const prevBidsRef   = useRef<Level[]>([]);
  const prevAsksRef   = useRef<Level[]>([]);

  // RAF coalescing + EMA + noise reduction
  const latestRef       = useRef<OrderbookState | null>(null);
  const rafIdRef        = useRef(0);
  const lastHistoryT    = useRef(0);
  const emaRef          = useRef(0);
  const lastEmaTRef     = useRef(0);
  const noiseStateRef   = useRef<NoiseReductionState>(createNoiseState());
  const lastNoiseTRef   = useRef(0);

  // Stable refs — formula/params/aggLevel are read at message time without triggering reconnect
  const adapterRef  = useRef(adapter);
  const symbolRef   = useRef(displaySymbol);
  const formulaRef  = useRef(formula);
  const paramsRef   = useRef(params);
  const aggRef      = useRef(aggLevel);
  const refMidRef   = useRef(referenceMid);
  adapterRef.current  = adapter;
  symbolRef.current   = displaySymbol;
  formulaRef.current  = formula;
  paramsRef.current   = params;
  aggRef.current      = aggLevel;
  refMidRef.current   = referenceMid;

  useEffect(() => {
    connectionRef.current = {
      connected: state.connected,
      connecting: state.connecting,
      error: state.error,
    };
  }, [state.connected, state.connecting, state.error]);

  const disconnect = useCallback(() => {
    if (pingRef.current)       clearInterval(pingRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (rafIdRef.current)      { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    latestRef.current = null;
    emaRef.current    = 0;
    lastEmaTRef.current = 0;
    noiseStateRef.current = createNoiseState();
    lastNoiseTRef.current = 0;
  }, []);

  // connectRef keeps onclose always calling the latest connect (avoids stale closure)
  const connectRef = useRef<() => void>(() => {});

  const computeSnapshot = useCallback((
    bids: Level[],
    asks: Level[],
    now: number,
    useCurrentAsPrevious = false,
  ): OrderbookState => {
    const prevBids = useCurrentAsPrevious ? bids : prevBidsRef.current;
    const prevAsks = useCurrentAsPrevious ? asks : prevAsksRef.current;

    const imbalance = clampUnit(computeImbalance(
      formulaRef.current,
      paramsRef.current,
      bids,
      asks,
      prevBids,
      prevAsks,
      refMidRef.current,
    ));

    const totalBidVol = bids.reduce((s, l) => s + parseFloat(l.a), 0);
    const totalAskVol = asks.reduce((s, l) => s + parseFloat(l.a), 0);
    const bestBid = bids[0] ? parseFloat(bids[0].p) : 0;
    const bestAsk = asks[0] ? parseFloat(asks[0].p) : 0;
    const spread = bestBid && bestAsk ? Math.max(0, bestAsk - bestBid) : 0;

    const dt = lastEmaTRef.current ? now - lastEmaTRef.current : EMA_HALFLIFE_MS;
    const alpha = 1 - Math.exp(-dt / EMA_HALFLIFE_MS);
    emaRef.current = clampUnit(alpha * imbalance + (1 - alpha) * emaRef.current);
    lastEmaTRef.current = now;

    const tradingSignal = computeTradingSignal(
      imbalance,
      noiseStateRef.current,
      now,
      lastNoiseTRef.current,
      { emaHalfLifeMs: EMA_HALFLIFE_MS },
    );
    lastNoiseTRef.current = now;

    return {
      bids,
      asks,
      symbol: symbolRef.current,
      timestamp: now,
      imbalance,
      emaImbalance: emaRef.current,
      tradingSignal,
      totalBidVol,
      totalAskVol,
      spread,
      connected: connectionRef.current.connected,
      connecting: connectionRef.current.connecting,
      error: connectionRef.current.error,
    };
  }, []);

  const connect = useCallback(() => {
    const ad  = adapterRef.current;
    const sym = symbolRef.current;
    const wsSymbol = ad.toWsSymbol(sym);
    if (!wsSymbol) return;

    disconnect();
    bidMapRef.current.clear();
    askMapRef.current.clear();
    prevBidsRef.current = [];
    prevAsksRef.current = [];
    noiseStateRef.current = createNoiseState();
    lastNoiseTRef.current = 0;
    setState(s => ({ ...s, connecting: true, connected: false, error: null }));

    let ws: WebSocket;
    try {
      ws = new WebSocket(ad.getWsUrl(wsSymbol));
    } catch {
      setState(s => ({ ...s, connecting: false, error: 'Failed to connect' }));
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setState(s => ({ ...s, connected: true, connecting: false, error: null }));

      if (ad.buildSubscribeMsg) {
        ws.send(JSON.stringify(ad.buildSubscribeMsg(wsSymbol, aggRef.current)));
      }
      if (ad.pingMsg && ad.pingIntervalMs) {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(ad.pingMsg));
          }
        }, ad.pingIntervalMs);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      let raw: unknown;
      try { raw = JSON.parse(event.data as string); } catch { return; }

      const result = adapterRef.current.processMessage(raw, bidMapRef.current, askMapRef.current);

      // Send any response message the adapter requests (e.g. pong reply to server ping)
      if (result && 'send' in result && result.send !== undefined && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(result.send));
      }

      if (!result || result.mode === 'noop') return;

      let bids: Level[];
      let asks: Level[];
      if (result.mode === 'direct') {
        bids = result.bids;
        asks = result.asks;
      } else {
        bids = mapToLevels(bidMapRef.current, true);
        asks = mapToLevels(askMapRef.current, false);
      }

      const now = Date.now();
      latestRef.current = {
        ...computeSnapshot(bids, asks, now),
        connected: true,
        connecting: false,
        error: null,
      };
      prevBidsRef.current = bids;
      prevAsksRef.current = asks;

      // Coalesce into a single render per animation frame
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;
          const snap = latestRef.current;
          if (!snap) return;
          setState(snap);

          const t = Date.now();
          if (t - lastHistoryT.current >= HISTORY_SAMPLE_MS) {
            lastHistoryT.current = t;
            setHistory(prev => {
              const next = prev.filter(p => p.t >= t - HISTORY_DURATION_MS);
              next.push({ t, imbalance: snap.imbalance, bidVol: snap.totalBidVol, askVol: snap.totalAskVol });
              return next;
            });
          }
        });
      }
    };

    ws.onerror = () => {
      setState(s => ({ ...s, error: 'WebSocket error', connecting: false }));
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      setState(s => ({ ...s, connected: false, connecting: false }));
      if (retryRef.current < MAX_RETRIES) {
        retryRef.current += 1;
        retryTimerRef.current = setTimeout(() => connectRef.current(), RECONNECT_DELAY_MS);
      } else {
        setState(s => ({ ...s, error: 'Max reconnect attempts reached' }));
      }
    };
  }, [disconnect, computeSnapshot]);

  connectRef.current = connect;

  useEffect(() => {
    const wsSymbol = adapter.toWsSymbol(displaySymbol);
    if (wsSymbol) connect();
    else setState(defaultState(displaySymbol));
    return () => disconnect();
    // adapter.id + displaySymbol + aggLevel are the reconnect triggers;
    // formula/params are handled via refs and don't need reconnects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter.id, displaySymbol, aggLevel]);

  useEffect(() => {
    const bids = prevBidsRef.current;
    const asks = prevAsksRef.current;
    if (!bids.length && !asks.length) return;

    const now = Date.now();
    const snap = computeSnapshot(bids, asks, now, true);
    latestRef.current = snap;
    setState(prev => ({ ...prev, ...snap }));

    setHistory(prev => {
      const next = prev.filter(p => p.t >= now - HISTORY_DURATION_MS);
      next.push({
        t: now,
        imbalance: snap.imbalance,
        bidVol: snap.totalBidVol,
        askVol: snap.totalAskVol,
      });
      return next;
    });
  }, [formula, params, referenceMid, computeSnapshot]);

  return { state, history, reconnect: connect };
}

export { DEFAULT_FORMULA_PARAMS };
