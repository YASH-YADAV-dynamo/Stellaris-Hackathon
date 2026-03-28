export interface MarketPair {
  id:          string;   // "BTC/USD" — primary key used throughout
  base:        string;   // "BTC"
  quote:       string;   // "USD"
  type:        'perp';
  displayName: string;   // "BTC / USD"
  searchTerms: string[];
}

export const MARKET_PAIRS: MarketPair[] = [
  { id: 'BTC/USD',   base: 'BTC',   quote: 'USD',  type: 'perp', displayName: 'BTC / USD',   searchTerms: ['btc', 'bitcoin'] },
  { id: 'ETH/USD',   base: 'ETH',   quote: 'USD',  type: 'perp', displayName: 'ETH / USD',   searchTerms: ['eth', 'ethereum'] },
  { id: 'SOL/USD',   base: 'SOL',   quote: 'USD',  type: 'perp', displayName: 'SOL / USD',   searchTerms: ['sol', 'solana'] },
  { id: 'AVAX/USD',  base: 'AVAX',  quote: 'USD',  type: 'perp', displayName: 'AVAX / USD',  searchTerms: ['avax', 'avalanche'] },
  { id: 'SUI/USD',   base: 'SUI',   quote: 'USD',  type: 'perp', displayName: 'SUI / USD',   searchTerms: ['sui'] },
  { id: 'XRP/USD',   base: 'XRP',   quote: 'USD',  type: 'perp', displayName: 'XRP / USD',   searchTerms: ['xrp', 'ripple'] },
  { id: 'BNB/USD',   base: 'BNB',   quote: 'USD',  type: 'perp', displayName: 'BNB / USD',   searchTerms: ['bnb', 'binance'] },
  { id: 'HYPE/USD',  base: 'HYPE',  quote: 'USD',  type: 'perp', displayName: 'HYPE / USD',  searchTerms: ['hype'] },
];

const NATIVE_SYMBOLS: Record<string, Record<string, string>> = {
  pacifica: {
    'BTC/USD': 'BTC',
    'ETH/USD': 'ETH',
    'SOL/USD': 'SOL',
    'AVAX/USD': 'AVAX',
    'BNB/USD': 'BNB',
    'HYPE/USD': 'HYPE',
  },
  '01':     { 'BTC/USD': 'BTCUSD', 'ETH/USD': 'ETHUSD', 'SOL/USD': 'SOLUSD' },
  hotstuff: {
    'BTC/USD': 'BTC-PERP', 'ETH/USD': 'ETH-PERP', 'SOL/USD': 'SOL-PERP',
    'XRP/USD': 'XRP-PERP', 'BNB/USD': 'BNB-PERP', 'HYPE/USD': 'HYPE-PERP',
  },
  paradex:  { 'BTC/USD': 'BTC-USD-PERP', 'ETH/USD': 'ETH-USD-PERP', 'SOL/USD': 'SOL-USD-PERP' },
  hibachi:  {
    'BTC/USD': 'BTC/USDT-P', 'ETH/USD': 'ETH/USDT-P', 'SOL/USD': 'SOL/USDT-P',
    'SUI/USD': 'SUI/USDT-P', 'XRP/USD': 'XRP/USDT-P', 'BNB/USD': 'BNB/USDT-P',
    'HYPE/USD': 'HYPE/USDT-P',
  },
  hyperliquid: {
    'BTC/USD': 'BTC', 'ETH/USD': 'ETH', 'SOL/USD': 'SOL', 'AVAX/USD': 'AVAX',
    'SUI/USD': 'SUI', 'XRP/USD': 'XRP', 'BNB/USD': 'BNB',
    'HYPE/USD': 'HYPE',
  },
  extended: {
    'BTC/USD': 'BTC-USD', 'ETH/USD': 'ETH-USD', 'SOL/USD': 'SOL-USD',
    'AVAX/USD': 'AVAX-USD', 'BNB/USD': 'BNB-USD', 'HYPE/USD': 'HYPE-USD',
  },
  aster: {
    'BTC/USD': 'btcusdt', 'ETH/USD': 'ethusdt', 'SOL/USD': 'solusdt',
    'AVAX/USD': 'avaxusdt', 'SUI/USD': 'suiusdt', 'XRP/USD': 'xrpusdt',
    'BNB/USD': 'bnbusdt', 'HYPE/USD': 'hypeusdt',
  },
  /** Synthetix Info WS — wss://papi.synthetix.io/v1/ws/info, subscribe type:orderbook */
  synthetix: {
    'BTC/USD':  'BTC-USDT',
    'ETH/USD':  'ETH-USDT',
    'SOL/USD':  'SOL-USDT',
    'AVAX/USD': 'AVAX-USDT',
    'SUI/USD':  'SUI-USDT',
    'XRP/USD':  'XRP-USDT',
    'BNB/USD':  'BNB-USDT',
    'HYPE/USD': 'HYPE-USDT',
  },
  /** dYdX v4 market IDs — wss://indexer.dydx.trade/v4/ws, channel v4_orderbook */
  dydx: {
    'BTC/USD':  'BTC-USD',
    'ETH/USD':  'ETH-USD',
    'SOL/USD':  'SOL-USD',
    'AVAX/USD': 'AVAX-USD',
    'SUI/USD':  'SUI-USD',
    'XRP/USD':  'XRP-USD',
    'BNB/USD':  'BNB-USD',
    'HYPE/USD': 'HYPE-USD',
  },
  /** EdgeX contract IDs — fetched from metadata WS channel depth.{contractId}.15 */
  edgex: {
    'BTC/USD':  '10000001',
    'ETH/USD':  '10000002',
    'SOL/USD':  '10000003',
    'AVAX/USD': '10000065',
    'SUI/USD':  '10000068',
    'XRP/USD':  '10000066',
    'BNB/USD':  '10000064',
    'HYPE/USD': '10000072',
  },
  /** Lighter (zkLighter) market indices — see https://mainnet.zklighter.elliot.ai/api/v1/orderBooks */
  lighter: {
    'BTC/USD': '1',
    'ETH/USD': '0',
    'SOL/USD': '2',
    'AVAX/USD': '9',
    'SUI/USD':  '16',
    'XRP/USD':  '7',
    'BNB/USD':  '25',
    'HYPE/USD': '24',
  },
  /** Orderly perp symbols: PERP_{BASE}_USDC — see https://orderly.network/docs */
  orderly: {
    'BTC/USD': 'PERP_BTC_USDC',
    'ETH/USD': 'PERP_ETH_USDC',
    'SOL/USD': 'PERP_SOL_USDC',
    'AVAX/USD': 'PERP_AVAX_USDC',
    'SUI/USD': 'PERP_SUI_USDC',
    'XRP/USD': 'PERP_XRP_USDC',
    'BNB/USD': 'PERP_BNB_USDC',
    'HYPE/USD': 'PERP_HYPE_USDC',
  },
};

export function resolvePair(pairId: string, adapterId: string): string {
  return NATIVE_SYMBOLS[adapterId]?.[pairId] ?? '';
}

export function getPairsForAdapter(adapterId: string): MarketPair[] {
  const map = NATIVE_SYMBOLS[adapterId];
  if (!map) return [];
  return MARKET_PAIRS.filter(p => p.id in map);
}

export function getAllPairs(): MarketPair[] {
  return MARKET_PAIRS;
}

export function getAdaptersForPair(pairId: string): string[] {
  return Object.entries(NATIVE_SYMBOLS)
    .filter(([, map]) => pairId in map)
    .map(([id]) => id);
}

export function searchPairs(query: string, pairs: MarketPair[]): MarketPair[] {
  const q = query.toLowerCase().trim();
  if (!q) return pairs;
  return pairs.filter(p =>
    p.id.toLowerCase().includes(q) ||
    p.base.toLowerCase().includes(q) ||
    p.quote.toLowerCase().includes(q) ||
    p.searchTerms.some(t => t.includes(q))
  );
}

export const MAJOR_BASES = new Set(['BTC', 'ETH', 'SOL']);
