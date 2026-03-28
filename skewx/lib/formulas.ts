import { FormulaParams, FormulaType, Level } from '@/types/orderbook';

// Use a tiny epsilon to avoid division by zero for levels exactly at mid
const MIN_DIST = 1e-9;

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function getMid(bids: Level[], asks: Level[], referenceMid?: number): number {
  if (referenceMid && referenceMid > 0) return referenceMid;
  if (!bids.length || !asks.length) return 0;
  return (parseFloat(bids[0].p) + parseFloat(asks[0].p)) / 2;
}

/**
 * 1. Distance-Weighted Imbalance
 * I = (Σ B_i·e^(-λ·d_i) - Σ A_i·e^(-λ·d_i)) / (Σ B_i·e^(-λ·d_i) + Σ A_i·e^(-λ·d_i))
 * d_i = fractional distance from mid (|p_i - mid| / mid)
 */
export function calcDistanceWeighted(
  bids: Level[],
  asks: Level[],
  lambda: number,
  referenceMid?: number,
): number {
  const mid = getMid(bids, asks, referenceMid);
  if (!mid) return 0;

  const bidW = bids.reduce((s, l) => {
    const d = Math.max(Math.abs(mid - parseFloat(l.p)) / mid, MIN_DIST);
    return s + parseFloat(l.a) * Math.exp(-lambda * d);
  }, 0);

  const askW = asks.reduce((s, l) => {
    const d = Math.max(Math.abs(parseFloat(l.p) - mid) / mid, MIN_DIST);
    return s + parseFloat(l.a) * Math.exp(-lambda * d);
  }, 0);

  const total = bidW + askW;
  return total === 0 ? 0 : (bidW - askW) / total;
}

/**
 * 2. Near-Mid Liquidity Imbalance
 * I = (B_±x% - A_±x%) / (B_±x% + A_±x%)
 * Only levels within xPct% of mid are included
 */
export function calcNearMid(
  bids: Level[],
  asks: Level[],
  xPct: number,
  referenceMid?: number,
): number {
  const mid = getMid(bids, asks, referenceMid);
  if (!mid) return 0;

  const threshold = mid * (xPct / 100);

  const bidVol = bids
    .filter(l => Math.abs(mid - parseFloat(l.p)) <= threshold)
    .reduce((s, l) => s + parseFloat(l.a), 0);

  const askVol = asks
    .filter(l => Math.abs(parseFloat(l.p) - mid) <= threshold)
    .reduce((s, l) => s + parseFloat(l.a), 0);

  const total = bidVol + askVol;
  return total === 0 ? 0 : (bidVol - askVol) / total;
}

/**
 * 3. Classic Imbalance (depth ratio)
 * I = (ΣBid - ΣAsk) / (ΣBid + ΣAsk)
 */
export function calcClassic(bids: Level[], asks: Level[]): number {
  const bidVol = bids.reduce((s, l) => s + parseFloat(l.a), 0);
  const askVol = asks.reduce((s, l) => s + parseFloat(l.a), 0);
  const total = bidVol + askVol;
  if (total === 0) return 0;
  return (bidVol - askVol) / total;
}

/**
 * 4. Order Flow Imbalance (OFI)
 * OFI = Σ(ΔB_i - ΔA_i), normalized by total depth
 * Requires previous tick's bids/asks to compute deltas
 */
export function calcOFI(
  bids: Level[],
  asks: Level[],
  prevBids: Level[],
  prevAsks: Level[],
): number {
  const prevBidMap = new Map(prevBids.map(l => [l.p, parseFloat(l.a)]));
  const prevAskMap = new Map(prevAsks.map(l => [l.p, parseFloat(l.a)]));

  let ofi = 0;

  // Bid changes: new levels + volume increases count positive
  for (const l of bids) {
    const prev = prevBidMap.get(l.p) ?? 0;
    ofi += parseFloat(l.a) - prev;
  }
  // Bid levels that disappeared
  for (const [p, a] of prevBidMap) {
    if (!bids.some(l => l.p === p)) ofi -= a;
  }

  // Ask changes: volume increases count negative
  for (const l of asks) {
    const prev = prevAskMap.get(l.p) ?? 0;
    ofi -= parseFloat(l.a) - prev;
  }
  // Ask levels that disappeared
  for (const [p, a] of prevAskMap) {
    if (!asks.some(l => l.p === p)) ofi += a;
  }

  const totalDepth =
    bids.reduce((s, l) => s + parseFloat(l.a), 0) +
    asks.reduce((s, l) => s + parseFloat(l.a), 0);

  if (totalDepth === 0) return 0;
  // Clamp to [-1, 1]
  return Math.max(-1, Math.min(1, ofi / totalDepth));
}

/**
 * 5. Microprice Imbalance
 * MP = (P_ask·V_bid + P_bid·V_ask) / (V_bid + V_ask)
 * I  = 2 * (MP - Mid) / Spread  → [-1, 1]
 */
export function calcMicroprice(bids: Level[], asks: Level[]): number {
  if (!bids.length || !asks.length) return 0;

  const bestBidPrice = parseFloat(bids[0].p);
  const bestAskPrice = parseFloat(asks[0].p);
  const bidVol = parseFloat(bids[0].a);
  const askVol = parseFloat(asks[0].a);

  const totalVol = bidVol + askVol;
  if (totalVol === 0) return 0;

  const mp = (bestAskPrice * bidVol + bestBidPrice * askVol) / totalVol;
  const mid = (bestBidPrice + bestAskPrice) / 2;
  const spread = bestAskPrice - bestBidPrice;

  if (spread <= 0) return 0;
  return Math.max(-1, Math.min(1, (2 * (mp - mid)) / spread));
}

/**
 * 6. Power-Law Depth Imbalance
 * I = (Σ B_i/d_i^α - Σ A_i/d_i^α) / (Σ B_i/d_i^α + Σ A_i/d_i^α)
 * d_i = fractional distance from mid
 */
export function calcPowerLaw(
  bids: Level[],
  asks: Level[],
  alpha: number,
  referenceMid?: number,
): number {
  const mid = getMid(bids, asks, referenceMid);
  if (!mid) return 0;

  const bidW = bids.reduce((s, l) => {
    const d = Math.max(Math.abs(mid - parseFloat(l.p)) / mid, MIN_DIST);
    return s + parseFloat(l.a) / Math.pow(d, alpha);
  }, 0);

  const askW = asks.reduce((s, l) => {
    const d = Math.max(Math.abs(parseFloat(l.p) - mid) / mid, MIN_DIST);
    return s + parseFloat(l.a) / Math.pow(d, alpha);
  }, 0);

  const total = bidW + askW;
  return total === 0 ? 0 : (bidW - askW) / total;
}

/**
 * Dispatcher — calls the appropriate formula based on type
 */
export function computeImbalance(
  formula: FormulaType,
  params: FormulaParams,
  bids: Level[],
  asks: Level[],
  prevBids: Level[],
  prevAsks: Level[],
  referenceMid?: number,
): number {
  let raw = 0;
  switch (formula) {
    case 'distanceWeighted':
      raw = calcDistanceWeighted(bids, asks, params.lambda, referenceMid);
      break;
    case 'nearMid':
      raw = calcNearMid(bids, asks, params.xPct, referenceMid);
      break;
    case 'classic':
      raw = calcClassic(bids, asks);
      break;
    case 'ofi':
      raw = calcOFI(bids, asks, prevBids, prevAsks);
      break;
    case 'microprice':
      raw = calcMicroprice(bids, asks);
      break;
    case 'powerLaw':
      raw = calcPowerLaw(bids, asks, params.alpha, referenceMid);
      break;
    default:
      raw = 0;
      break;
  }
  return clampUnit(raw);
}
