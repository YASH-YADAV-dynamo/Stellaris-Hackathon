import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtcHourMs } from '@/lib/funding/nextHourUtc';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const PARADEX_ID = 'paradex' as const satisfies AdapterId;

const SOURCE =
  'Paradex GET /v1/markets/summary?market=ALL → results[i].funding_rate (future_funding_rate if preferred).';

export async function fetchParadexBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://api.prod.paradex.trade/v1/markets/summary?market=ALL', {
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

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    for (const id of wantedPairIds) out.set(id, { error: 'invalid JSON' });
    return out;
  }

  const results = (json as { results?: unknown[] }).results;
  if (!Array.isArray(results)) {
    for (const id of wantedPairIds) out.set(id, { error: 'no results' });
    return out;
  }

  const bySym = new Map<string, { funding_rate?: string; future_funding_rate?: string }>();
  for (const row of results) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { symbol?: string; funding_rate?: string; future_funding_rate?: string };
    if (typeof r.symbol === 'string') {
      bySym.set(r.symbol, r);
    }
  }

  const nextMs = nextUtcHourMs();

  for (const pairId of wantedPairIds) {
    const sym = resolvePair(pairId, PARADEX_ID);
    if (!sym) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const row = bySym.get(sym);
    if (!row) {
      out.set(pairId, { error: 'symbol not in summary' });
      continue;
    }

    const raw = row.future_funding_rate ?? row.funding_rate;
    const fundingRateHourly = parseFundingRate(raw);
    if (fundingRateHourly === null) {
      out.set(pairId, { error: 'no funding rate' });
      continue;
    }

    out.set(pairId, {
      fundingRateHourly,
      paymentDisplay: formatRateAsPercent(fundingRateHourly),
      dataSource: SOURCE,
      nextFundingMs: nextMs,
      fundingPeriodMs: ONE_HOUR_MS,
      tag: fundingTagFromRate(fundingRateHourly),
    });
  }

  return out;
}
