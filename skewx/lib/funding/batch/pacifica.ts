import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtcHourMs } from '@/lib/funding/nextHourUtc';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const ADAPTER = 'pacifica' as const satisfies AdapterId;

const SOURCE = 'Pacifica GET /api/v1/info → data[].funding_rate (next_funding_rate fallback).';

export async function fetchPacificaBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://api.pacifica.fi/api/v1/info', { cache: 'no-store' });
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

  const list = Array.isArray(json) ? json : (json as { data?: unknown })?.data;
  if (!Array.isArray(list)) {
    for (const id of wantedPairIds) out.set(id, { error: 'expected market array' });
    return out;
  }

  const bySym = new Map<
    string,
    {
      funding_rate?: string;
      next_funding_rate?: string;
      fundingRate?: string;
      nextFundingRate?: string;
      nextFundingTime?: number | string;
    }
  >();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as {
      symbol?: string;
      funding_rate?: string;
      next_funding_rate?: string;
      fundingRate?: string;
      nextFundingRate?: string;
      nextFundingTime?: number | string;
    };
    if (typeof r.symbol === 'string') {
      bySym.set(r.symbol.toUpperCase(), {
        funding_rate: r.funding_rate,
        next_funding_rate: r.next_funding_rate,
        fundingRate: r.fundingRate,
        nextFundingRate: r.nextFundingRate,
        nextFundingTime: r.nextFundingTime,
      });
    }
  }

  for (const pairId of wantedPairIds) {
    if (!resolvePair(pairId, ADAPTER)) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const key = resolvePair(pairId, ADAPTER).toUpperCase();
    const row = bySym.get(key);
    if (!row) {
      out.set(pairId, { error: 'symbol not in markets' });
      continue;
    }

    const fundingRateRaw =
      row.funding_rate ??
      row.fundingRate ??
      row.next_funding_rate ??
      row.nextFundingRate;

    const fundingRateHourly = parseFundingRate(fundingRateRaw);
    if (fundingRateHourly === null) {
      out.set(pairId, { error: 'no funding rate fields' });
      continue;
    }
    let nextMs = nextUtcHourMs();
    const nft =
      typeof row.nextFundingTime === 'number'
        ? row.nextFundingTime
        : typeof row.nextFundingTime === 'string'
          ? parseFloat(row.nextFundingTime)
          : Number.NaN;
    if (Number.isFinite(nft) && nft > Date.now()) {
      nextMs = nft;
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
