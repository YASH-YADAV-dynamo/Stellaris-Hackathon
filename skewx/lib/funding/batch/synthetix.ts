import type { FundingOkData } from '@/types/funding';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';

const ADAPTER = 'synthetix' as const satisfies AdapterId;

/**
 * Synthetix v3 perp funding is read from `PerpsMarketProxy.getMarketSummary` on-chain.
 * No public REST batch in this repo yet — cells show a clear upstream message.
 */
export async function fetchSynthetixBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();
  const msg =
    'Synthetix v3: use on-chain getMarketSummary (per-second rate) or subgraph; REST batch not wired';

  for (const pairId of wantedPairIds) {
    if (!resolvePair(pairId, ADAPTER)) {
      out.set(pairId, { error: 'unsupported_pair' });
    } else {
      out.set(pairId, { error: msg });
    }
  }

  return out;
}
