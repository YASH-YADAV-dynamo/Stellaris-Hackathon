import type { FundingOkData } from '@/types/funding';
import { ONE_HOUR_MS } from '@/lib/funding/constants';
import { formatRateAsPercent } from '@/lib/funding/display';
import { fundingTagFromRate } from '@/lib/funding/tag';
import { nextUtcHourMs } from '@/lib/funding/nextHourUtc';
import { resolvePair } from '@/lib/pairs';
import type { AdapterId } from '@/lib/dexAdapters';
import { parseFundingRate } from '@/lib/funding/batch/helpers';

const ADAPTER = 'hotstuff' as const satisfies AdapterId;

const SOURCE = 'HotStuff POST /info {method:"ticker",params:{symbol:"all"}} → funding_rate.';
const HOTSTUFF_CACHE_TTL_MS = 5 * 60_000;

type HotstuffFundingRow = {
  funding_rate?: string;
  fundingRate?: string;
  next_funding_time?: number | string;
  nextFundingTime?: number | string;
};

let hotstuffByPairCache = new Map<string, HotstuffFundingRow>();
let hotstuffByPairCacheAt = 0;

/** Map API symbol (e.g. BTC-USD, BTC-PERP) → pair id BASE/USD */
function symbolToPairId(symbol: string): string | null {
  const u = symbol.toUpperCase();
  if (u.endsWith('-USD')) return `${u.replace('-USD', '')}/USD`;
  if (u.endsWith('-PERP')) return `${u.replace('-PERP', '')}/USD`;
  return null;
}

export async function fetchHotstuffBatch(
  wantedPairIds: Set<string>,
): Promise<Map<string, FundingOkData | { error: string }>> {
  const out = new Map<string, FundingOkData | { error: string }>();

  let byPair = new Map<string, HotstuffFundingRow>();
  let liveErr: string | null = null;

  let res: Response | null = null;
  try {
    res = await fetch('https://api.hotstuff.trade/info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        method: 'ticker',
        params: { symbol: 'all' },
      }),
      cache: 'no-store',
    });
  } catch (e) {
    liveErr = e instanceof Error ? e.message : String(e);
  }

  if (res && res.ok) {
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      liveErr = 'invalid JSON';
      json = null;
    }

    if (json) {
      let list: unknown[] = [];
      if (Array.isArray(json)) list = json;
      else if (json && typeof json === 'object' && Array.isArray((json as { markets?: unknown[] }).markets)) {
        list = (json as { markets: unknown[] }).markets;
      } else if (json && typeof json === 'object' && Array.isArray((json as { data?: unknown[] }).data)) {
        list = (json as { data: unknown[] }).data;
      }

      for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        const r = row as {
          symbol?: string;
          funding_rate?: string;
          fundingRate?: string;
          next_funding_time?: number | string;
          nextFundingTime?: number | string;
        };
        if (typeof r.symbol !== 'string') continue;
        const pid = symbolToPairId(r.symbol);
        if (!pid || !resolvePair(pid, ADAPTER)) continue;
        byPair.set(pid, {
          funding_rate: r.funding_rate,
          fundingRate: r.fundingRate,
          next_funding_time: r.next_funding_time,
          nextFundingTime: r.nextFundingTime,
        });
      }
    }
  } else if (res) {
    liveErr = `HTTP ${res.status}`;
  }

  if (byPair.size > 0) {
    hotstuffByPairCache = byPair;
    hotstuffByPairCacheAt = Date.now();
  } else {
    const cacheFresh = hotstuffByPairCache.size > 0 && Date.now() - hotstuffByPairCacheAt <= HOTSTUFF_CACHE_TTL_MS;
    if (cacheFresh) {
      byPair = new Map(hotstuffByPairCache);
    } else {
      const err = liveErr ?? 'hotstuff funding unavailable';
      for (const id of wantedPairIds) out.set(id, { error: err });
      return out;
    }
  }

  for (const pairId of wantedPairIds) {
    if (!resolvePair(pairId, ADAPTER)) {
      out.set(pairId, { error: 'unsupported_pair' });
      continue;
    }
    const row = byPair.get(pairId);
    if (!row) {
      out.set(pairId, { error: 'symbol not in markets' });
      continue;
    }
    const fundingRateHourly = parseFundingRate(row.funding_rate ?? row.fundingRate);
    if (fundingRateHourly === null) {
      out.set(pairId, { error: 'no funding_rate' });
      continue;
    }
    let nextMs = nextUtcHourMs();
    const nextFundingRaw = row.next_funding_time ?? row.nextFundingTime;
    const nextFundingMs =
      typeof nextFundingRaw === 'number'
        ? nextFundingRaw
        : typeof nextFundingRaw === 'string'
          ? parseFloat(nextFundingRaw)
          : Number.NaN;
    if (Number.isFinite(nextFundingMs) && nextFundingMs > Date.now()) {
      nextMs = nextFundingMs;
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
