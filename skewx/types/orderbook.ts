export interface Level {
  a: string; // total amount at this aggregation level
  n: number; // number of orders
  p: string; // price (highest in bids, lowest in asks)
}

export interface BookData {
  l: [Level[], Level[]]; // [bids, asks]
  s: string;             // symbol
  t: number;             // timestamp ms
  li: number;            // exchange nonce
}

export interface BookMessage {
  channel: string;
  data: BookData;
}

export type Regime = 'stable' | 'trending' | 'volatile';

export interface TradingSignal {
  value: number;           // -1 to +1, final noise-reduced
  confidence: number;      // 0–1, from regime
  regime: Regime;
  rawImbalance: number;
  emaImbalance: number;
  spikeFiltered: boolean;
  uncertainty?: number;    // Kalman uncertainty
}

export interface NoiseReductionState {
  history: number[];
  smoothedHistory: number[];
  lastValue: number;
  ema: number;
  kalmanState: { x: number; P: number } | null;
  spikeCount: number;
}

export interface OrderbookState {
  bids: Level[];
  asks: Level[];
  symbol: string;
  timestamp: number;
  imbalance: number;        // -1 to +1
  emaImbalance: number;     // time-smoothed EMA for fair cross-exchange comparison
  tradingSignal?: TradingSignal;
  totalBidVol: number;
  totalAskVol: number;
  spread: number;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

export interface HistoryPoint {
  t: number;
  imbalance: number;
  bidVol: number;
  askVol: number;
}

export type AggLevel = 1 | 10 | 100 | 1000 | 10000;

export type FormulaType =
  | 'distanceWeighted'
  | 'nearMid'
  | 'classic'
  | 'ofi'
  | 'microprice'
  | 'powerLaw';

export interface FormulaParams {
  lambda: number; // distanceWeighted: decay rate (0.01–100)
  xPct: number;   // nearMid: band width % from mid (0.1–5)
  alpha: number;  // powerLaw: exponent (0.5–3.0)
}

export const DEFAULT_FORMULA_PARAMS: FormulaParams = {
  lambda: 10,
  xPct: 1.0,
  alpha: 1.0,
};

export const FORMULA_META: Record<
  FormulaType,
  { label: string; short: string; description: string; paramKey?: keyof FormulaParams }
> = {
  distanceWeighted: {
    label: 'Distance-Weighted',
    short: 'DW',
    description: 'Exponential decay by distance from mid. Near levels weigh more.',
    paramKey: 'lambda',
  },
  nearMid: {
    label: 'Near-Mid Liquidity',
    short: 'NM',
    description: 'Only levels within x% of mid price. Ignores far levels.',
    paramKey: 'xPct',
  },
  classic: {
    label: 'Classic Imbalance',
    short: 'CI',
    description: 'Standard depth ratio: (ΣBid − ΣAsk) / (ΣBid + ΣAsk).',
  },
  ofi: {
    label: 'Order Flow Imbalance',
    short: 'OFI',
    description: 'Net change in bid vs ask volume per tick, normalized.',
  },
  microprice: {
    label: 'Microprice',
    short: 'MP',
    description: 'Volume-weighted fair price offset from mid, scaled by spread.',
  },
  powerLaw: {
    label: 'Power-Law Depth',
    short: 'PL',
    description: 'Weight decays as 1/d^α. Higher α = stronger near-mid bias.',
    paramKey: 'alpha',
  },
};
