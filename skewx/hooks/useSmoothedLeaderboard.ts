'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { LeaderboardEntry } from '@/components/Leaderboard';

export interface SmoothedEntry extends LeaderboardEntry {
  displayImbalance: number;
  displayBidVol:    number;
  displayAskVol:    number;
  rank:             number;
}

interface Options {
  sortIntervalMs?: number;  // how often to re-rank  (default 1000)
  hysteresis?:     number;  // min |ema| delta to swap (default 0.005)
  lerpSpeed?:      number;  // per-frame interpolation (default 0.12)
}

const EPSILON = 1e-6;

function lerp(a: number, b: number, t: number): number {
  return Math.abs(b - a) < EPSILON ? b : a + (b - a) * t;
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

export function useSmoothedLeaderboard(
  entries: LeaderboardEntry[],
  opts?: Options,
): SmoothedEntry[] {
  const sortMs     = opts?.sortIntervalMs ?? 1000;
  const hysteresis = opts?.hysteresis ?? 0.005;
  const speed      = opts?.lerpSpeed ?? 0.12;

  const [output, setOutput] = useState<SmoothedEntry[]>([]);

  const displayRef   = useRef<Map<string, { imb: number; bid: number; ask: number }>>(new Map());
  const orderRef     = useRef<string[]>([]);
  const lastSortRef  = useRef(0);
  const rafRef       = useRef(0);
  const entriesRef   = useRef(entries);
  const prevConnRef  = useRef<Map<string, boolean>>(new Map());
  entriesRef.current = entries;

  const computeRanks = useCallback((
    items: LeaderboardEntry[],
    currentOrder: string[],
    hyst: number,
  ): string[] => {
    const candidate = [...items]
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        return Math.abs(clampUnit(b.emaImbalance)) - Math.abs(clampUnit(a.emaImbalance));
      })
      .map(e => e.id);

    if (currentOrder.length !== candidate.length) return candidate;

    const byId = new Map(items.map(e => [e.id, e]));
    const merged = [...currentOrder];

    for (let i = 0; i < candidate.length; i++) {
      const cId = candidate[i];
      const curIdx = merged.indexOf(cId);
      if (curIdx === i) continue;

      const curAtI  = byId.get(merged[i]);
      const cEntry  = byId.get(cId);
      if (!curAtI || !cEntry) { return candidate; }

      const diff = Math.abs(
        Math.abs(clampUnit(cEntry.emaImbalance)) - Math.abs(clampUnit(curAtI.emaImbalance)),
      );
      if (diff > hyst || curAtI.connected !== cEntry.connected) {
        merged.splice(curIdx, 1);
        merged.splice(i, 0, cId);
      }
    }
    return merged;
  }, []);

  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      const now  = Date.now();
      const items = entriesRef.current;

      // Check for connection state changes (immediate re-rank)
      let connChanged = false;
      for (const e of items) {
        if (prevConnRef.current.get(e.id) !== e.connected) {
          connChanged = true;
          break;
        }
      }
      for (const e of items) prevConnRef.current.set(e.id, e.connected);

      // Re-sort on cadence or on connection change
      if (connChanged || now - lastSortRef.current >= sortMs) {
        orderRef.current = computeRanks(items, orderRef.current, hysteresis);
        lastSortRef.current = now;
      }

      // Bootstrap order if empty
      if (orderRef.current.length !== items.length) {
        orderRef.current = items.map(e => e.id);
      }

      // Lerp display values
      let changed = false;
      const next: SmoothedEntry[] = [];

      for (const entry of items) {
        const prev = displayRef.current.get(entry.id);
        const resetNeeded = !prev || !entry.connected;
        const targetImb = clampUnit(entry.imbalance);
        const prevImb = prev ? clampUnit(prev.imb) : targetImb;

        const dImb = clampUnit(resetNeeded ? targetImb : lerp(prevImb, targetImb, speed));
        const dBid = resetNeeded ? entry.bidVol    : lerp(prev.bid, entry.bidVol, speed);
        const dAsk = resetNeeded ? entry.askVol    : lerp(prev.ask, entry.askVol, speed);

        if (!prev || Math.abs(dImb - prev.imb) > EPSILON ||
            Math.abs(dBid - prev.bid) > EPSILON ||
            Math.abs(dAsk - prev.ask) > EPSILON) {
          changed = true;
        }
        displayRef.current.set(entry.id, { imb: dImb, bid: dBid, ask: dAsk });

        const rank = orderRef.current.indexOf(entry.id);
        next.push({
          ...entry,
          displayImbalance: dImb,
          displayBidVol:    dBid,
          displayAskVol:    dAsk,
          rank: rank === -1 ? items.length - 1 : rank,
        });
      }

      if (changed || next.length !== output.length) {
        setOutput(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        for (const e of entriesRef.current) {
          displayRef.current.set(e.id, {
            imb: clampUnit(e.imbalance),
            bid: e.bidVol,
            ask: e.askVol,
          });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMs, hysteresis, speed, computeRanks]);

  return output;
}
