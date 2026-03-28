import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtcHourMs } from '@/lib/funding/nextHourUtc';

const HL_SOURCE =
  'Hyperliquid POST /info {type:metaAndAssetCtxs} → assetCtxs[i].funding (hourly rate). Docs: hyperliquid.gitbook.io → API → Info endpoint.';

export type HlBatchEntry = FundingOkData;

/**
 * One POST returns all perps; map coin name → pair id `BASE/USD`.
 */
export async function fetchHyperliquidBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, HlBatchEntry | { error: string }>> {
  const out = new Map<string, HlBatchEntry | { error: string }>();

  let res: Response;
  try {
    res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
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

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    for (const id of wantedPairIds) out.set(id, { error: 'invalid JSON' });
    return out;
  }

  if (!Array.isArray(data) || data.length < 2) {
    for (const id of wantedPairIds) out.set(id, { error: 'unexpected shape' });
    return out;
  }

  const meta = data[0] as { universe?: Array<{ name: string; isDelisted?: boolean }> };
  const ctxs = data[1] as Array<{ funding?: string } | undefined>;

  if (!meta.universe || !ctxs) {
    for (const id of wantedPairIds) out.set(id, { error: 'missing universe' });
    return out;
  }

  const now = Date.now();
  const nextMs = nextUtcHourMs(now);

  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i];
    if (u.isDelisted) continue;
    const pairId = `${u.name}/USD`;
    if (!wantedPairIds.has(pairId)) continue;

    const ctx = ctxs[i];
    if (!ctx?.funding) {
      out.set(pairId, { error: 'no funding field' });
      continue;
    }

    const fundingRateHourly = parseFloat(ctx.funding);
    if (!Number.isFinite(fundingRateHourly)) {
      out.set(pairId, { error: 'bad funding number' });
      continue;
    }

    out.set(pairId, {
      fundingRateHourly,
      paymentDisplay: formatRateAsPercent(fundingRateHourly),
      dataSource: HL_SOURCE,
      nextFundingMs: nextMs,
      fundingPeriodMs: ONE_HOUR_MS,
      tag: fundingTagFromRate(fundingRateHourly),
    });
  }

  for (const id of wantedPairIds) {
    if (!out.has(id)) out.set(id, { error: 'coin not in universe' });
  }

  return out;
}
