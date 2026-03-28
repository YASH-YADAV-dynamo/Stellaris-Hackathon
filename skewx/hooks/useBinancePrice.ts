'use client';

import { useEffect, useRef, useState } from 'react';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

function pairToBinanceSymbol(pairId: string): string {
  const base = pairId.split('/')[0]?.toLowerCase();
  if (!base) return '';
  return `${base}usdt`;
}

/**
 * Shared singleton connections per Binance symbol.
 * Multiple components subscribing to the same pair reuse one WebSocket.
 */
const subs = new Map<string, {
  ws: WebSocket | null;
  mid: number;
  listeners: Set<() => void>;
}>();

function getOrCreateSub(binSym: string) {
  let sub = subs.get(binSym);
  if (sub) return sub;

  sub = { ws: null, mid: 0, listeners: new Set() };
  subs.set(binSym, sub);

  const connect = () => {
    const ws = new WebSocket(`${BINANCE_WS}/${binSym}@bookTicker`);

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string);
        const bid = parseFloat(msg.b);
        const ask = parseFloat(msg.a);
        if (bid > 0 && ask > 0) {
          sub!.mid = (bid + ask) / 2;
          sub!.listeners.forEach((cb) => cb());
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (sub!.listeners.size > 0) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();

    sub!.ws = ws;
  };

  connect();
  return sub;
}

function removeSub(binSym: string, cb: () => void) {
  const sub = subs.get(binSym);
  if (!sub) return;
  sub.listeners.delete(cb);
  if (sub.listeners.size === 0) {
    sub.ws?.close();
    subs.delete(binSym);
  }
}

/**
 * Real-time Binance mid-price via WebSocket bookTicker.
 * Takes a pair like "BTC/USD", returns the live mid (e.g. 74250.5).
 * Returns 0 while connecting or if the pair is unsupported.
 */
export function useBinancePrice(pairId: string): number {
  const binSym = pairToBinanceSymbol(pairId);
  const [mid, setMid] = useState(0);
  const binSymRef = useRef(binSym);
  binSymRef.current = binSym;

  useEffect(() => {
    if (!binSym) return;

    const sub = getOrCreateSub(binSym);
    if (sub.mid > 0) setMid(sub.mid);

    const cb = () => setMid(sub.mid);
    sub.listeners.add(cb);

    return () => removeSub(binSym, cb);
  }, [binSym]);

  return mid;
}
