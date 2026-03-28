import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtcHourMs } from '@/lib/funding/nextHourUtc';

const DYDX_SOURCE =
  'dYdX indexer GET /v4/perpetualMarkets → markets[ticker].nextFundingRate. Docs: docs.dydx.xyz (Indexer API).';

export async function fetchDydxBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://indexer.dydx.trade/v4/perpetualMarkets', {
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

  const markets = (json as { markets?: Record<string, {
    nextFundingRate?: string;
    status?: string;
  }> }).markets;

  if (!markets) {
    for (const id of wantedPairIds) out.set(id, { error: 'no markets' });
    return out;
  }

  const now = Date.now();
  const nextMs = nextUtcHourMs(now);

  for (const [ticker, m] of Object.entries(markets)) {
    const parts = ticker.split('-');
    if (parts.length !== 2) continue;
    const [base, quote] = parts;
    if (quote !== 'USD') continue;
    const pairId = `${base}/USD`;
    if (!wantedPairIds.has(pairId)) continue;

    if (m.status === 'FINAL_SETTLEMENT') {
      out.set(pairId, { error: 'market settled' });
      continue;
    }

    const rateStr = m.nextFundingRate;
    if (rateStr === undefined || rateStr === '') {
      out.set(pairId, { error: 'no nextFundingRate' });
      continue;
    }

    const fundingRateHourly = parseFloat(rateStr);
    if (!Number.isFinite(fundingRateHourly)) {
      out.set(pairId, { error: 'bad rate' });
      continue;
    }

    out.set(pairId, {
      fundingRateHourly,
      paymentDisplay: formatRateAsPercent(fundingRateHourly),
      dataSource: DYDX_SOURCE,
      nextFundingMs: nextMs,
      fundingPeriodMs: ONE_HOUR_MS,
      tag: fundingTagFromRate(fundingRateHourly),
    });
  }

  for (const id of wantedPairIds) {
    if (!out.has(id)) out.set(id, { error: 'market not listed' });
  }

  return out;
}
