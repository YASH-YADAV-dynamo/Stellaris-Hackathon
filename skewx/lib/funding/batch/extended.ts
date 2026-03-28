import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const EXT_ID = 'extended' as const satisfies AdapterId;

const SOURCE =
  'Extended GET /api/v1/info/markets → data[i].marketStats.fundingRate, nextFundingRate (ms).';

export async function fetchExtendedBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://api.starknet.extended.exchange/api/v1/info/markets', {
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

  const data = (json as { data?: unknown[] }).data;
  if (!Array.isArray(data)) {
    for (const id of wantedPairIds) out.set(id, { error: 'no data' });
    return out;
  }

  const byName = new Map<string, { fundingRate?: unknown; nextFundingRate?: unknown }>();
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { name?: string; marketStats?: { fundingRate?: unknown; nextFundingRate?: unknown } };
    if (typeof r.name === 'string' && r.marketStats) {
      byName.set(r.name, r.marketStats);
    }
  }

  for (const pairId of wantedPairIds) {
    const sym = resolvePair(pairId, EXT_ID);
    if (!sym) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const stats = byName.get(sym);
    if (!stats) {
      out.set(pairId, { error: 'market not listed' });
      continue;
    }

    const fundingRateHourly = parseFundingRate(stats.fundingRate);
    if (fundingRateHourly === null) {
      out.set(pairId, { error: 'no fundingRate' });
      continue;
    }

    let nextMs: number;
    const nfr = stats.nextFundingRate;
    if (typeof nfr === 'number' && Number.isFinite(nfr) && nfr > 0) {
      nextMs = nfr > 1e12 ? nfr : nfr * 1000;
    } else {
      nextMs = Date.now() + ONE_HOUR_MS;
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
