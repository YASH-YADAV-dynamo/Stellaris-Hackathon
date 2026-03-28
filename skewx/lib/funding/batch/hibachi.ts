import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtc8hBoundaryMs } from '@/lib/funding/utcBoundaries';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const ADAPTER = 'hibachi' as const satisfies AdapterId;

const SOURCE =
  'Hibachi GET /v1/public/fundingRate?symbol= → lastFundingRate, nextFundingTime (Binance-style).';

function usdtSymbol(pairId: string): string {
  const base = pairId.split('/')[0] ?? '';
  return `${base}USDT`.toUpperCase();
}

export async function fetchHibachiBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  const targets: string[] = [];
  for (const pairId of wantedPairIds) {
    if (resolvePair(pairId, ADAPTER)) targets.push(pairId);
  }

  if (targets.length === 0) {
    for (const id of wantedPairIds) out.set(id, { error: 'unsupported_pair' });
    return out;
  }

  const settled = await Promise.all(
    targets.map(async (pairId): Promise<
      | { pairId: string; ok: FundingOkData }
      | { pairId: string; err: string }
    > => {
      const sym = usdtSymbol(pairId);
      try {
        const res = await fetch(
          `https://api.hibachi.xyz/v1/public/fundingRate?symbol=${encodeURIComponent(sym)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return { pairId, err: `HTTP ${res.status}` };
        const text = await res.text();
        if (!text || text.trim() === '') return { pairId, err: 'empty response' };
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          return { pairId, err: 'invalid JSON' };
        }
        const row = json as {
          lastFundingRate?: string;
          nextFundingTime?: number;
        };
        const fundingRateHourly = parseFundingRate(row.lastFundingRate);
        if (fundingRateHourly === null) return { pairId, err: 'no lastFundingRate' };
        let nextMs = nextUtc8hBoundaryMs();
        if (typeof row.nextFundingTime === 'number' && row.nextFundingTime > Date.now()) {
          nextMs = row.nextFundingTime;
        }
        return {
          pairId,
          ok: {
            fundingRateHourly,
            paymentDisplay: formatRateAsPercent(fundingRateHourly),
            dataSource: SOURCE,
            nextFundingMs: nextMs,
            fundingPeriodMs: 8 * ONE_HOUR_MS,
            tag: fundingTagFromRate(fundingRateHourly),
          },
        };
      } catch (e) {
        return { pairId, err: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  for (const s of settled) {
    if ('err' in s) out.set(s.pairId, { error: s.err });
    else out.set(s.pairId, s.ok);
  }

  for (const pairId of wantedPairIds) {
    if (!resolvePair(pairId, ADAPTER)) {
      out.set(pairId, { error: 'unsupported_pair' });
    } else if (!out.has(pairId)) {
      out.set(pairId, { error: 'missing batch row' });
    }
  }

  return out;
}
