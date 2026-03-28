import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtc4hBoundaryMs } from '@/lib/funding/utcBoundaries';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const EDGEX_ID = 'edgex' as const satisfies AdapterId;

const SOURCE =
  'EdgeX GET /public/funding/getLatestFundingRate?contractId= → data[0].fundingRate, fundingTime (ms).';

export async function fetchEdgexBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  const targets: string[] = [];
  for (const pairId of wantedPairIds) {
    if (resolvePair(pairId, EDGEX_ID)) targets.push(pairId);
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
      const contractId = resolvePair(pairId, EDGEX_ID)!;
      try {
        const res = await fetch(
          `https://pro.edgex.exchange/api/v1/public/funding/getLatestFundingRate?contractId=${encodeURIComponent(contractId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return { pairId, err: `HTTP ${res.status}` };
        const json = (await res.json()) as {
          data?: Array<{
            fundingRate?: string;
            fundingTime?: string;
            forecastFundingRate?: string;
          }>;
        };
        const row = json.data?.[0];
        if (!row) return { pairId, err: 'empty data' };
        const rate = parseFundingRate(row.fundingRate);
        if (rate === null) return { pairId, err: 'bad fundingRate' };
        let nextMs = nextUtc4hBoundaryMs();
        if (row.fundingTime !== undefined && row.fundingTime !== '') {
          const ft = parseFloat(String(row.fundingTime));
          if (Number.isFinite(ft) && ft > 1e12) nextMs = Math.round(ft);
        }
        return {
          pairId,
          ok: {
            fundingRateHourly: rate,
            paymentDisplay: formatRateAsPercent(rate),
            dataSource: SOURCE,
            nextFundingMs: nextMs,
            fundingPeriodMs: 4 * ONE_HOUR_MS,
            tag: fundingTagFromRate(rate),
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
    if (!resolvePair(pairId, EDGEX_ID)) {
      out.set(pairId, { error: 'unsupported_pair' });
    } else if (!out.has(pairId)) {
      out.set(pairId, { error: 'missing batch row' });
    }
  }

  return out;
}
