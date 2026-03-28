import type { Level } from '@/types/orderbook';
import { resolvePair, getPairsForAdapter } from '@/lib/pairs';

// ── Result types ────────────────────────────────────────────────────────────

/**
 * Returned by processMessage().
 * 'direct' — adapter provides Level[] arrays directly (e.g. snapshot-only feeds).
 * 'map'    — adapter mutated bidMap/askMap; caller converts them to Level[].
 * 'noop'   — no orderbook update; hook sends `send` as a WS response (e.g. server-ping pong).
 * null     — ignore this message entirely.
 *
 * Optional `send` on 'direct'/'map' lets adapters piggyback a response message.
 */
export type ProcessResult =
  | { mode: 'direct'; bids: Level[]; asks: Level[]; send?: unknown }
  | { mode: 'map';    send?: unknown }
  | { mode: 'noop';   send: unknown }
  | null;

// ── Adapter interface ───────────────────────────────────────────────────────

export interface DexAdapter {
  /** Unique string key, matches ADAPTERS record key and public/exchanges/<id>.png */
  id:               string;
  name:             string;
  route:            string;
  color:            string;
  supportedSymbols: string[];

  /** Map display symbol (e.g. "BTC") → WS symbol. Return '' if unsupported. */
  toWsSymbol: (displaySymbol: string) => string;

  /** Full WebSocket URL; may embed the WS symbol for URL-based subscriptions. */
  getWsUrl: (wsSymbol: string) => string;

  /**
   * JSON message to send on open.
   * null = no subscribe message needed (symbol is embedded in the URL).
   * aggLevel is optional and only used by Pacifica.
   */
  buildSubscribeMsg: ((wsSymbol: string, aggLevel?: number) => unknown) | null;

  /** Optional ping to keep the connection alive. */
  pingMsg?:        unknown;
  pingIntervalMs?: number;

  /**
   * Parse one raw WebSocket message.
   * For 'map' mode: mutate bidMap/askMap in-place then return { mode:'map' }.
   * For 'direct' mode: return { mode:'direct', bids, asks } to bypass maps.
   * Return null to skip the message.
   */
  processMessage: (
    raw:    unknown,
    bidMap: Map<string, number>,
    askMap: Map<string, number>,
  ) => ProcessResult;
}

// ── Pacifica ─────────────────────────────────────────────────────────────────
// Full snapshot each tick — preserve `n` (order-count) by using 'direct' mode.

export const pacificaAdapter: DexAdapter = {
  id:               'pacifica',
  name:             'Pacifica',
  route:            '/pacifica',
  color:            '#00ff88',
  supportedSymbols: getPairsForAdapter('pacifica').map(p => p.id),

  toWsSymbol: (s) => resolvePair(s, 'pacifica'),
  getWsUrl:   () => 'wss://ws.pacifica.fi/ws',

  buildSubscribeMsg: (sym, agg = 1) => ({
    method: 'subscribe',
    params: { source: 'book', symbol: sym, agg_level: agg },
  }),

  pingMsg:         { method: 'ping' },
  pingIntervalMs:  30_000,

  processMessage: (raw) => {
    const msg = raw as { channel?: string; data?: { l?: [Level[], Level[]] } };
    if (msg.channel !== 'book' || !msg.data?.l) return null;
    const [bids, asks] = msg.data.l;
    return { mode: 'direct', bids, asks };
  },
};

// ── 01 Exchange ───────────────────────────────────────────────────────────────
// Delta feed — symbol is embedded in the WebSocket URL; no subscribe message.

export const zoAdapter: DexAdapter = {
  id:               '01',
  name:             '01 Exchange',
  route:            '/01',
  color:            '#6366f1',
  supportedSymbols: getPairsForAdapter('01').map(p => p.id),

  toWsSymbol:        (s) => resolvePair(s, '01'),
  getWsUrl:          (sym) => `wss://zo-mainnet.n1.xyz/ws/deltas@${sym}`,
  buildSubscribeMsg: null,

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      delta?: { bids: [number, number][]; asks: [number, number][] };
    };
    if (!msg.delta) return null;

    msg.delta.bids.forEach(([price, size]) => {
      const k = price.toString();
      size === 0 ? bidMap.delete(k) : bidMap.set(k, size);
    });
    msg.delta.asks.forEach(([price, size]) => {
      const k = price.toString();
      size === 0 ? askMap.delete(k) : askMap.set(k, size);
    });
    return { mode: 'map' };
  },
};

// ── HotStuff ──────────────────────────────────────────────────────────────────
// JSON-RPC subscribe + snapshot/delta feed.

interface HsLevel { price: number; size: number }

export const hotstuffAdapter: DexAdapter = {
  id:               'hotstuff',
  name:             'HotStuff',
  route:            '/hotstuff',
  color:            '#f97316',
  supportedSymbols: getPairsForAdapter('hotstuff').map(p => p.id),

  toWsSymbol:        (s) => resolvePair(s, 'hotstuff'),
  getWsUrl:          () => 'wss://api.hotstuff.trade/ws/',

  buildSubscribeMsg: (sym) => ({
    jsonrpc: '2.0', id: '1', method: 'subscribe',
    params:  { channel: 'orderbook', symbol: sym },
  }),

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      method?:  string;
      result?:  unknown;
      error?:   unknown;
      params?:  {
        data?: {
          update_type?: string;
          books?: { bids: HsLevel[]; asks: HsLevel[] };
          bids?:  HsLevel[];
          asks?:  HsLevel[];
        };
      };
    };

    // Skip confirmations / errors
    if (msg.result !== undefined || msg.error !== undefined) return null;
    if (msg.method !== 'event' || !msg.params?.data) return null;

    const data = msg.params.data;
    // Handle both nested (.books) and flat layouts
    const bidsArr: HsLevel[] = data.books?.bids ?? data.bids ?? [];
    const asksArr: HsLevel[] = data.books?.asks ?? data.asks ?? [];

    if (data.update_type === 'snapshot') {
      bidMap.clear();
      askMap.clear();
    }
    bidsArr.forEach(({ price, size }) => {
      const k = price.toString();
      size === 0 ? bidMap.delete(k) : bidMap.set(k, size);
    });
    asksArr.forEach(({ price, size }) => {
      const k = price.toString();
      size === 0 ? askMap.delete(k) : askMap.set(k, size);
    });
    return { mode: 'map' };
  },
};

// ── Paradex ───────────────────────────────────────────────────────────────────
// JSON-RPC snapshot feed (depth 15, 50 ms).
// update_type 's' = full snapshot (in inserts), 'd' = incremental delta.

interface ParadexLevel { price: string; side: 'BUY' | 'SELL'; size: string }

export const paradexAdapter: DexAdapter = {
  id:               'paradex',
  name:             'Paradex',
  route:            '/paradex',
  color:            '#a855f7',
  supportedSymbols: getPairsForAdapter('paradex').map(p => p.id),

  toWsSymbol:       (s) => resolvePair(s, 'paradex'),
  getWsUrl:         () => 'wss://ws.api.prod.paradex.trade/v1?',

  buildSubscribeMsg: (sym) => ({
    id: 1, jsonrpc: '2.0', method: 'subscribe',
    params: { channel: `order_book.${sym}.snapshot@15@50ms` },
  }),

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      method?:  string;
      result?:  unknown;
      error?:   unknown;
      params?:  {
        data?: {
          update_type?: 's' | 'd';
          inserts?: ParadexLevel[];
          updates?: ParadexLevel[];
          deletes?: ParadexLevel[];
        };
      };
    };

    if (msg.result !== undefined || msg.error !== undefined) return null;
    if (msg.method !== 'subscription' || !msg.params?.data) return null;

    const { update_type, inserts = [], updates = [], deletes = [] } = msg.params.data;

    if (update_type === 's') {
      bidMap.clear();
      askMap.clear();
      inserts.forEach(({ price, side, size }) => {
        const map = side === 'BUY' ? bidMap : askMap;
        const s = parseFloat(size);
        s > 0 ? map.set(price, s) : map.delete(price);
      });
    } else {
      [...inserts, ...updates].forEach(({ price, side, size }) => {
        const map = side === 'BUY' ? bidMap : askMap;
        const s = parseFloat(size);
        s > 0 ? map.set(price, s) : map.delete(price);
      });
      deletes.forEach(({ price, side }) => {
        (side === 'BUY' ? bidMap : askMap).delete(price);
      });
    }
    return { mode: 'map' };
  },
};

// ── Hibachi ──────────────────────────────────────────────────────────────────
// WebSocket subscribe feed. Snapshot first, then incremental Updates.
// Levels: { price: string, quantity: string }

interface HibachiLevel { price: string; quantity: string }

export const hibachiAdapter: DexAdapter = {
  id:               'hibachi',
  name:             'Hibachi',
  route:            '/hibachi',
  color:            '#ef4444',
  supportedSymbols: getPairsForAdapter('hibachi').map(p => p.id),

  toWsSymbol:       (s) => resolvePair(s, 'hibachi'),
  getWsUrl:         () => 'wss://data-api.hibachi.xyz/ws/market',

  buildSubscribeMsg: (sym) => ({
    method: 'subscribe',
    parameters: {
      subscriptions: [{ symbol: sym, topic: 'orderbook' }],
    },
  }),

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      topic?:       string;
      messageType?: 'Snapshot' | 'Update';
      data?: {
        bid?: { levels?: HibachiLevel[] };
        ask?: { levels?: HibachiLevel[] };
      };
    };

    if (msg.topic !== 'orderbook' || !msg.data) return null;

    if (msg.messageType === 'Snapshot') {
      bidMap.clear();
      askMap.clear();
    }

    const applyLevels = (levels: HibachiLevel[] | undefined, map: Map<string, number>) => {
      if (!levels) return;
      levels.forEach(({ price, quantity }) => {
        const q = parseFloat(quantity);
        q === 0 ? map.delete(price) : map.set(price, q);
      });
    };

    applyLevels(msg.data.bid?.levels, bidMap);
    applyLevels(msg.data.ask?.levels, askMap);

    return { mode: 'map' };
  },
};

// ── Hyperliquid ──────────────────────────────────────────────────────────────
// Full L2 book snapshots pushed every ~0.5 s.
// levels: [bids[], asks[]], each { px: string, sz: string, n: number }

export const hyperliquidAdapter: DexAdapter = {
  id:               'hyperliquid',
  name:             'Hyperliquid',
  route:            '/hyperliquid',
  color:            '#84cc16',
  supportedSymbols: getPairsForAdapter('hyperliquid').map(p => p.id),

  toWsSymbol:       (s) => resolvePair(s, 'hyperliquid'),
  getWsUrl:         () => 'wss://api.hyperliquid.xyz/ws',

  buildSubscribeMsg: (sym) => ({
    method: 'subscribe',
    subscription: { type: 'l2Book', coin: sym },
  }),

  processMessage: (raw) => {
    const msg = raw as {
      channel?: string;
      data?: {
        coin?: string;
        time?: number;
        levels?: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>];
      };
    };

    if (msg.channel !== 'l2Book' || !msg.data?.levels) return null;

    const [rawBids, rawAsks] = msg.data.levels;
    const bids: Level[] = rawBids.map(l => ({ p: l.px, a: l.sz, n: l.n }));
    const asks: Level[] = rawAsks.map(l => ({ p: l.px, a: l.sz, n: l.n }));

    return { mode: 'direct', bids, asks };
  },
};

// ── Extended ─────────────────────────────────────────────────────────────────
// Snapshot + delta feed. Symbol embedded in URL — no subscribe message.
// Snapshot levels have { p, q } where q = absolute size.
// Delta levels have { p, q, c } where q = change, c = new absolute size.

interface ExtendedLevel { p: string; q: string; c?: string }

export const extendedAdapter: DexAdapter = {
  id:               'extended',
  name:             'Extended',
  route:            '/extended',
  color:            '#06b6d4',
  supportedSymbols: getPairsForAdapter('extended').map(p => p.id),

  toWsSymbol:        (s) => resolvePair(s, 'extended'),
  getWsUrl:          (sym) =>
    `wss://api.starknet.extended.exchange/stream.extended.exchange/v1/orderbooks/${sym}`,
  buildSubscribeMsg: null,

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      type?: 'SNAPSHOT' | 'DELTA';
      data?: {
        t?: string;
        m?: string;
        b?: ExtendedLevel[];
        a?: ExtendedLevel[];
      };
    };

    if (!msg.data || !msg.type) return null;
    const isSnapshot = msg.type === 'SNAPSHOT';

    if (isSnapshot) {
      bidMap.clear();
      askMap.clear();
    }

    const apply = (levels: ExtendedLevel[] | undefined, map: Map<string, number>) => {
      if (!levels) return;
      levels.forEach((lv) => {
        const size = parseFloat(isSnapshot ? lv.q : (lv.c ?? lv.q));
        size === 0 ? map.delete(lv.p) : map.set(lv.p, size);
      });
    };

    apply(msg.data.b, bidMap);
    apply(msg.data.a, askMap);

    return { mode: 'map' };
  },
};

// ── Aster ────────────────────────────────────────────────────────────────────
// Binance-compatible partial depth stream. Symbol embedded in URL.
// Levels are [price, quantity] tuples. Full snapshot each push.

export const asterAdapter: DexAdapter = {
  id:               'aster',
  name:             'Aster',
  route:            '/aster',
  color:            '#f59e0b',
  supportedSymbols: getPairsForAdapter('aster').map(p => p.id),

  toWsSymbol:        (s) => resolvePair(s, 'aster'),
  getWsUrl:          (sym) => `wss://fstream.asterdex.com/ws/${sym}@depth20@100ms`,
  buildSubscribeMsg: null,

  processMessage: (raw) => {
    const msg = raw as {
      e?: string;
      b?: [string, string][];
      a?: [string, string][];
    };

    if (msg.e !== 'depthUpdate' || !msg.b || !msg.a) return null;

    const bids: Level[] = msg.b.map(([p, a]) => ({ p, a, n: 0 }));
    const asks: Level[] = msg.a.map(([p, a]) => ({ p, a, n: 0 }));

    return { mode: 'direct', bids, asks };
  },
};

// ── Orderly Network (EVM public WS) ───────────────────────────────────────────
// Public COMMON_ID from Orderly's own SDK (js-sdk/packages/net/src/ws/ws.ts).
// Server sends {"event":"ping","ts":...} application pings — must reply with pong.
// @orderbook: full depth-100 snapshot pushed every 1 s → direct mode.

const ORDERLY_PUBLIC_ID = 'OqdphuyCtYWxwzhxyLLjOWNdFP7sQt8RPWzmb5xY';

export const orderlyAdapter: DexAdapter = {
  id:               'orderly',
  name:             'Orderly',
  route:            '/orderly',
  color:            '#8b5cf6',
  supportedSymbols: getPairsForAdapter('orderly').map((p) => p.id),

  toWsSymbol: (s) => resolvePair(s, 'orderly'),
  getWsUrl:   ()  => `wss://ws-evm.orderly.org/ws/stream/${ORDERLY_PUBLIC_ID}`,

  buildSubscribeMsg: (sym) => ({
    id:    `ob-${Date.now()}`,
    event: 'subscribe',
    topic: `${sym}@orderbook`,
  }),

  processMessage: (raw) => {
    const msg = raw as {
      event?: string;
      ts?:    number;
      topic?: string;
      data?:  { bids?: [number, number][]; asks?: [number, number][] };
    };

    // Reply to server keepalive pings
    if (msg.event === 'ping') {
      return { mode: 'noop', send: { event: 'pong', ts: msg.ts } };
    }

    if (msg.event === 'subscribe') return null;
    if (!msg.topic?.endsWith('@orderbook') || !msg.data) return null;

    const { bids = [], asks = [] } = msg.data;
    const toLevels = (rows: [number, number][], desc: boolean): Level[] =>
      [...rows]
        .sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0]))
        .slice(0, 50)
        .map(([p, a]) => ({ p: String(p), a: String(a), n: 0 }));

    return {
      mode: 'direct',
      bids: toLevels(bids, true),
      asks: toLevels(asks, false),
    };
  },
};

// ── Synthetix ─────────────────────────────────────────────────────────────────
// Info WS (no auth): wss://papi.synthetix.io/v1/ws/info
// Requires Origin header — set automatically by browsers; no action needed in the hook.
// Subscribe: {id, method:"subscribe", params:{type:"orderbook", symbol:"BTC-USDT"}}
// Heartbeat: client sends {id,method:"ping",params:{}} every 30 s.
// snapshot (type:"snapshot"): clear map, set absolute sizes {price, quantity}.
// diff (type:"diff"):         update map; quantity "0" → delete.

export const synthetixAdapter: DexAdapter = {
  id:               'synthetix',
  name:             'Synthetix',
  route:            '/synthetix',
  color:            '#00d1ff',
  supportedSymbols: getPairsForAdapter('synthetix').map(p => p.id),

  toWsSymbol: (s) => resolvePair(s, 'synthetix'),
  getWsUrl:   ()  => 'wss://papi.synthetix.io/v1/ws/info',

  buildSubscribeMsg: (sym) => ({
    id:     `sub-${sym}`,
    method: 'subscribe',
    params: { type: 'orderbook', symbol: sym },
  }),

  pingMsg:        { id: 'heartbeat', method: 'ping', params: {} },
  pingIntervalMs: 30_000,

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      method?: string;
      status?: number;
      type?:   string;
      data?:   {
        bids?: { price: string; quantity: string }[];
        asks?: { price: string; quantity: string }[];
      };
    };

    // Subscription confirmation or ping response — ignore
    if (msg.status !== undefined || msg.method === 'pong') return null;
    if (msg.method !== 'orderbook_depth_update' || !msg.data) return null;

    const isSnap = msg.type === 'snapshot';

    const applyLevels = (
      levels: { price: string; quantity: string }[] | undefined,
      map:    Map<string, number>,
    ) => {
      if (!levels) return;
      for (const { price, quantity } of levels) {
        const q = parseFloat(quantity);
        if (q <= 0) map.delete(price);
        else map.set(price, q);
      }
    };

    if (isSnap) { bidMap.clear(); askMap.clear(); }
    applyLevels(msg.data.bids, bidMap);
    applyLevels(msg.data.asks, askMap);

    return { mode: 'map' };
  },
};

// ── dYdX v4 ───────────────────────────────────────────────────────────────────
// WS: wss://indexer.dydx.trade/v4/ws, channel v4_orderbook
// Heartbeat: protocol-level WebSocket ping frames every 30 s — handled automatically by the browser.
// Subscribed (snapshot): bids/asks as {price, size} objects.
// channel_data (delta): bids/asks as [price, size, offset?] tuples; size "0" → delete.

export const dydxAdapter: DexAdapter = {
  id:               'dydx',
  name:             'dYdX',
  route:            '/dydx',
  color:            '#6d28d9',
  supportedSymbols: getPairsForAdapter('dydx').map(p => p.id),

  toWsSymbol: (s) => resolvePair(s, 'dydx'),
  getWsUrl:   ()  => 'wss://indexer.dydx.trade/v4/ws',

  buildSubscribeMsg: (sym) => ({
    type:    'subscribe',
    channel: 'v4_orderbook',
    id:      sym,
  }),

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      type?:     string;
      channel?:  string;
      contents?: {
        bids?: ({ price: string; size: string } | [string, string, string?])[];
        asks?: ({ price: string; size: string } | [string, string, string?])[];
      };
    };

    if (msg.type === 'connected') return null;
    if (msg.channel !== 'v4_orderbook') return null;

    const isSnap   = msg.type === 'subscribed';
    const isUpdate = msg.type === 'channel_data';
    if (!isSnap && !isUpdate) return null;
    if (!msg.contents) return null;

    if (isSnap) { bidMap.clear(); askMap.clear(); }

    const applyLevels = (
      levels: ({ price: string; size: string } | [string, string, string?])[] | undefined,
      map:    Map<string, number>,
    ) => {
      if (!levels) return;
      for (const level of levels) {
        const [price, size] = Array.isArray(level)
          ? [level[0], level[1]]
          : [level.price, level.size];
        const s = parseFloat(size);
        if (s <= 0) map.delete(price);
        else map.set(price, s);
      }
    };

    applyLevels(msg.contents.bids, bidMap);
    applyLevels(msg.contents.asks, askMap);

    return { mode: 'map' };
  },
};

// ── EdgeX ─────────────────────────────────────────────────────────────────────
// WS: wss://quote.edgex.exchange/api/v1/public/ws
// Channel: depth.{contractId}.15  (15 levels)
// Server sends {"type":"ping","time":"..."} — must reply {"type":"pong","time":"..."}.
// Actual message type is "quote-event" (docs say "payload" — incorrect).
// Levels are {price,size} objects. size="0" → delete; any positive → new absolute value.
// Both Snapshot and Changed carry absolute sizes; Snapshot clears the map first.

export const edgexAdapter: DexAdapter = {
  id:               'edgex',
  name:             'EdgeX',
  route:            '/edgex',
  color:            '#f43f5e',
  supportedSymbols: getPairsForAdapter('edgex').map(p => p.id),

  toWsSymbol: (s) => resolvePair(s, 'edgex'),
  getWsUrl:   ()  => 'wss://quote.edgex.exchange/api/v1/public/ws',

  buildSubscribeMsg: (sym) => ({
    type:    'subscribe',
    channel: `depth.${sym}.15`,
  }),

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      type?:    string;
      time?:    string;
      content?: {
        dataType?: string;
        data?:     {
          depthType?: string;
          bids?:      { price: string; size: string }[];
          asks?:      { price: string; size: string }[];
        }[];
      };
    };

    if (msg.type === 'ping' && msg.time !== undefined) {
      return { mode: 'noop', send: { type: 'pong', time: msg.time } };
    }

    if (msg.type !== 'quote-event' || !msg.content?.data?.[0]) return null;

    const entry  = msg.content.data[0];
    const isSnap = (msg.content.dataType ?? entry.depthType ?? '').toLowerCase().includes('snapshot');

    const applyLevels = (
      levels: { price: string; size: string }[] | undefined,
      map:    Map<string, number>,
    ) => {
      if (!levels) return;
      for (const { price, size } of levels) {
        const s = parseFloat(size);
        if (s <= 0) map.delete(price);
        else map.set(price, s);
      }
    };

    if (isSnap) { bidMap.clear(); askMap.clear(); }
    applyLevels(entry.bids, bidMap);
    applyLevels(entry.asks, askMap);

    return { mode: 'map' };
  },
};

// ── Lighter (zkLighter) ───────────────────────────────────────────────────────
// Single shared WS connection. Symbol → numeric market_index (from pairs.ts).
// First message per subscription is a full snapshot; subsequent messages are
// state-change deltas (size "0" = remove level). Uses keepalive pong every 60 s.

export const lighterAdapter: DexAdapter = {
  id:               'lighter',
  name:             'Lighter',
  route:            '/lighter',
  color:            '#06b6d4',
  supportedSymbols: getPairsForAdapter('lighter').map(p => p.id),

  toWsSymbol: (s) => resolvePair(s, 'lighter'),
  getWsUrl:   ()  => 'wss://mainnet.zklighter.elliot.ai/stream',

  buildSubscribeMsg: (sym) => ({
    type:    'subscribe',
    channel: `order_book/${sym}`,
  }),

  pingMsg:        { type: 'pong' },
  pingIntervalMs: 60_000,

  processMessage: (raw, bidMap, askMap) => {
    const msg = raw as {
      type?:        string;
      order_book?:  {
        asks?: { price: string; size: string }[];
        bids?: { price: string; size: string }[];
      };
    };

    if (
      msg.type === 'ping' ||
      msg.type === 'pong' ||
      msg.type?.startsWith('subscribed')
    ) return null;

    if (msg.type !== 'update/order_book' || !msg.order_book) return null;

    for (const { price, size } of msg.order_book.bids ?? []) {
      if (parseFloat(size) === 0) bidMap.delete(price);
      else bidMap.set(price, parseFloat(size));
    }
    for (const { price, size } of msg.order_book.asks ?? []) {
      if (parseFloat(size) === 0) askMap.delete(price);
      else askMap.set(price, parseFloat(size));
    }

    return { mode: 'map' };
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const ADAPTERS = {
  pacifica:     pacificaAdapter,
  '01':         zoAdapter,
  hotstuff:     hotstuffAdapter,
  paradex:      paradexAdapter,
  hibachi:      hibachiAdapter,
  hyperliquid:  hyperliquidAdapter,
  extended:     extendedAdapter,
  aster:        asterAdapter,
  orderly:      orderlyAdapter,
  lighter:      lighterAdapter,
  edgex:        edgexAdapter,
  dydx:         dydxAdapter,
  synthetix:    synthetixAdapter,
} as const;

export type AdapterId = keyof typeof ADAPTERS;
