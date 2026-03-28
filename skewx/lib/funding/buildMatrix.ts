import type {
  FundingApiResponse,
  FundingCellResult,
  FundingMatrixRow,
  FundingOkData,
} from '@/types/funding';
import type { AdapterId } from '@/lib/dexAdapters';
import { resolvePair } from '@/lib/pairs';
import { fetchHyperliquidBatch } from '@/lib/funding/batch/hyperliquid';
import { fetchDydxBatch } from '@/lib/funding/batch/dydx';
import { fetchAsterBatch } from '@/lib/funding/batch/aster';
import { fetchParadexBatch } from '@/lib/funding/batch/paradex';
import { fetchExtendedBatch } from '@/lib/funding/batch/extended';
import { fetchOrderlyBatch } from '@/lib/funding/batch/orderly';
import { fetchLighterBatch } from '@/lib/funding/batch/lighter';
import { fetchEdgexBatch } from '@/lib/funding/batch/edgex';
import { fetchPacificaBatch } from '@/lib/funding/batch/pacifica';
import { fetchExchange01Batch } from '@/lib/funding/batch/exchange01';
import { fetchHotstuffBatch } from '@/lib/funding/batch/hotstuff';
import { fetchHibachiBatch } from '@/lib/funding/batch/hibachi';
import { fetchSynthetixBatch } from '@/lib/funding/batch/synthetix';

export const FUNDING_ADAPTER_ORDER: AdapterId[] = [
  'pacifica',
  // '01',
  'hotstuff',
  // 'paradex',
  // 'hibachi',
  'hyperliquid',
  'extended',
  'aster',
  'orderly',
  'lighter',
  'edgex',
  // 'dydx',
  // 'synthetix',
];

type BatchMap = Map<string, FundingOkData | { error: string }>;

const BATCH_FETCHERS: Record<
  AdapterId,
  (wanted: Set<string>) => Promise<BatchMap>
> = {
  pacifica: fetchPacificaBatch,
  '01': fetchExchange01Batch,
  hotstuff: fetchHotstuffBatch,
  paradex: fetchParadexBatch,
  hibachi: fetchHibachiBatch,
  hyperliquid: fetchHyperliquidBatch,
  extended: fetchExtendedBatch,
  aster: fetchAsterBatch,
  orderly: fetchOrderlyBatch,
  lighter: fetchLighterBatch,
  edgex: fetchEdgexBatch,
  dydx: fetchDydxBatch,
  synthetix: fetchSynthetixBatch,
};

function toCell(entry: FundingOkData | { error: string }): FundingCellResult {
  if ('error' in entry && typeof entry.error === 'string') {
    return { status: 'error', code: 'UPSTREAM', message: entry.error };
  }
  const d = entry as FundingOkData;
  return { status: 'ok', data: d };
}

function maxFundingSpread(cells: Record<string, FundingCellResult>): number | null {
  let minRate = Number.POSITIVE_INFINITY;
  let maxRate = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const c of Object.values(cells)) {
    if (c.status !== 'ok') continue;
    const rate = c.data.fundingRateHourly;
    if (!Number.isFinite(rate)) continue;
    if (rate < minRate) minRate = rate;
    if (rate > maxRate) maxRate = rate;
    count += 1;
  }

  if (count < 2) return null;
  return maxRate - minRate;
}

/**
 * Builds full matrix: parallel batch fetch per venue, then merge per cell.
 */
export async function buildFundingMatrix(pairIds: string[]): Promise<FundingApiResponse> {
  const wanted = new Set(pairIds);

  const batchMaps = await Promise.all(
    FUNDING_ADAPTER_ORDER.map(id => BATCH_FETCHERS[id](wanted)),
  );

  const byAdapter = Object.fromEntries(
    FUNDING_ADAPTER_ORDER.map((id, i) => [id, batchMaps[i]]),
  ) as Record<AdapterId, BatchMap>;

  const pairs: FundingMatrixRow[] = pairIds.map(symbol => {
    const cells = {} as Record<AdapterId, FundingCellResult>;

    for (const adapterId of FUNDING_ADAPTER_ORDER) {
      if (!resolvePair(symbol, adapterId)) {
        cells[adapterId] = {
          status: 'error',
          code: 'unsupported_pair',
          message: 'Pair not listed on this venue',
        };
        continue;
      }

      const raw = byAdapter[adapterId].get(symbol) ?? { error: 'missing batch row' };
      cells[adapterId] = toCell(raw);
    }

    return {
      symbol,
      maxArbRate: maxFundingSpread(cells),
      cells,
    };
  });

  return { updatedAt: Date.now(), pairs };
}
