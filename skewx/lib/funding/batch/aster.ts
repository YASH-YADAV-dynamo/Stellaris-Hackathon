import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';

const ASTER_ID = 'aster' as const satisfies AdapterId;

const ASTER_SOURCE =
  'Aster GET /fapi/v1/premiumIndex → lastFundingRate, nextFundingTime (Binance Futures–compatible).';

/**
 * Single REST call returns all USDT perpetuals; match by native Aster symbol.
 */
export async function fetchAsterBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://fapi.asterdex.com/fapi/v1/premiumIndex', {
      cache: 'no-store',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const id of wantedPairIds) out.set(id, { error: msg });
    return out;
  }

  if (!res.ok) {
    const err = `HTTP ${res.status}`;
    for (const id of wantedPairIds) out.set(id, { error: err });
    return out;
  }

  let list: unknown;
  try {
    list = await res.json();
  } catch {
    for (const id of wantedPairIds) out.set(id, { error: 'invalid JSON' });
    return out;
  }

  if (!Array.isArray(list)) {
    for (const id of wantedPairIds) out.set(id, { error: 'expected array' });
    return out;
  }

  const byUpper = new Map<string, {
    lastFundingRate?: string;
    nextFundingTime?: number;
  }>();

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { symbol?: string; lastFundingRate?: string; nextFundingTime?: number };
    if (typeof r.symbol === 'string') {
      byUpper.set(r.symbol.toUpperCase(), {
        lastFundingRate: r.lastFundingRate,
        nextFundingTime: r.nextFundingTime,
      });
    }
  }

  for (const pairId of wantedPairIds) {
    const sym = resolvePair(pairId, ASTER_ID);
    if (!sym) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const upper = sym.toUpperCase();
    const row = byUpper.get(upper);
    if (!row) {
      out.set(pairId, { error: 'symbol not in index' });
      continue;
    }

    const fr = row.lastFundingRate;
    if (fr === undefined || fr === '') {
      out.set(pairId, { error: 'no lastFundingRate' });
      continue;
    }

    const fundingRateHourly = parseFloat(fr);
    if (!Number.isFinite(fundingRateHourly)) {
      out.set(pairId, { error: 'bad funding rate' });
      continue;
    }

    const eightH = 8 * ONE_HOUR_MS;
    const nextMs =
      typeof row.nextFundingTime === 'number' && row.nextFundingTime > Date.now()
        ? row.nextFundingTime
        : Date.now() + eightH;

    out.set(pairId, {
      fundingRateHourly,
      paymentDisplay: formatRateAsPercent(fundingRateHourly),
      dataSource: ASTER_SOURCE,
      nextFundingMs: nextMs,
      /** Binance-compat perpetuals: funding every 8h; `lastFundingRate` is last settled print. */
      fundingPeriodMs: eightH,
      tag: fundingTagFromRate(fundingRateHourly),
    });
  }

  return out;
}
