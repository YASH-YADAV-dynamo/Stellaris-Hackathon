import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtc8hBoundaryMs } from '@/lib/funding/utcBoundaries';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';

const ORDERLY_ID = 'orderly' as const satisfies AdapterId;

const SOURCE =
  'Orderly GET /v1/public/market_info/funding_history → data.rows[i].funding.last.rate (8h cadence).';

export async function fetchOrderlyBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://api.orderly.org/v1/public/market_info/funding_history', {
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

  const rows = (json as { data?: { rows?: unknown[] } }).data?.rows;
  if (!Array.isArray(rows)) {
    for (const id of wantedPairIds) out.set(id, { error: 'no rows' });
    return out;
  }

  const bySymbol = new Map<string, { funding?: { last?: { rate?: number } } }>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { symbol?: string; funding?: { last?: { rate?: number } } };
    if (typeof r.symbol === 'string') {
      bySymbol.set(r.symbol, r);
    }
  }

  const nextMs = nextUtc8hBoundaryMs();

  for (const pairId of wantedPairIds) {
    const sym = resolvePair(pairId, ORDERLY_ID);
    if (!sym) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const row = bySymbol.get(sym);
    const rate = row?.funding?.last?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      out.set(pairId, { error: 'no funding.last.rate' });
      continue;
    }

    out.set(pairId, {
      fundingRateHourly: rate,
      paymentDisplay: formatRateAsPercent(rate),
      dataSource: SOURCE,
      nextFundingMs: nextMs,
      fundingPeriodMs: 8 * ONE_HOUR_MS,
      tag: fundingTagFromRate(rate),
    });
  }

  return out;
}
