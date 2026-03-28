import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtcHourMs } from '@/lib/funding/nextHourUtc';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const ADAPTER = '01' as const satisfies AdapterId;

const SOURCE = '01 Exchange GET /v1/markets → funding_rate, next_funding_time (ms).';

function nativeListing(pairId: string): string {
  const base = pairId.split('/')[0] ?? '';
  return `${base}-PERP`;
}

export async function fetchExchange01Batch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://api.01.xyz/v1/markets', { cache: 'no-store' });
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

  const bySym = new Map<string, { funding_rate?: string; next_funding_time?: number }>();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { symbol?: string; funding_rate?: string; next_funding_time?: number };
    if (typeof r.symbol === 'string') {
      bySym.set(r.symbol.toUpperCase(), {
        funding_rate: r.funding_rate,
        next_funding_time: r.next_funding_time,
      });
    }
  }

  for (const pairId of wantedPairIds) {
    if (!resolvePair(pairId, ADAPTER)) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const key = nativeListing(pairId).toUpperCase();
    const row = bySym.get(key);
    if (!row) {
      out.set(pairId, { error: 'symbol not in markets' });
      continue;
    }
    const fundingRateHourly = parseFundingRate(row.funding_rate);
    if (fundingRateHourly === null) {
      out.set(pairId, { error: 'no funding_rate' });
      continue;
    }
    let nextMs = nextUtcHourMs();
    if (typeof row.next_funding_time === 'number' && row.next_funding_time > Date.now()) {
      nextMs = row.next_funding_time;
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
