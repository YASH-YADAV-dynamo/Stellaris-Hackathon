import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtc8hBoundaryMs } from '@/lib/funding/utcBoundaries';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';

const LIGHTER_ID = 'lighter' as const satisfies AdapterId;

const SOURCE =
  'Lighter GET /api/v1/funding-rates → funding_rates[] (prefer exchange=binance for symbol).';

type LighterRow = { market_id: number; exchange: string; symbol: string; rate: number };

function pickRate(rows: LighterRow[], base: string): number | null {
  const sym = base.toUpperCase();
  const matches = rows.filter(r => r.symbol.toUpperCase() === sym);
  if (matches.length === 0) return null;
  const binance = matches.find(r => r.exchange === 'binance');
  return (binance ?? matches[0]).rate;
}

export async function fetchLighterBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://mainnet.zklighter.elliot.ai/api/v1/funding-rates', {
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

  const rows = (json as { funding_rates?: LighterRow[] }).funding_rates;
  if (!Array.isArray(rows)) {
    for (const id of wantedPairIds) out.set(id, { error: 'no funding_rates' });
    return out;
  }

  const nextMs = nextUtc8hBoundaryMs();

  for (const pairId of wantedPairIds) {
    if (!resolvePair(pairId, LIGHTER_ID)) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const base = pairId.split('/')[0] ?? '';
    const rate = pickRate(rows, base);
    if (rate === null || !Number.isFinite(rate)) {
      out.set(pairId, { error: 'symbol not in funding_rates' });
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
