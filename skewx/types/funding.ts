import type { AdapterId } from '@/lib/dexAdapters';

/** Display tag from funding sign (no oracle). */
export type FundingSideTag = 'buy' | 'sell' | 'neutral';

export interface FundingOkData {
  /**
   * Signed rate used for BUY/SELL tags and coloring (decimal, e.g. 0.0001 = 0.01%).
   * Parsed from the venue’s API field documented in `dataSource`.
   */
  fundingRateHourly: number;
  /**
   * Primary cell text: API-native funding value as formatted string (usually % rate).
   * Venues expose **rates**, not USD payments, unless their API includes quote payment.
   */
  paymentDisplay: string;
  /**
   * Short provenance string for tooltips (endpoint + JSON field).
   */
  dataSource: string;
  /** Unix ms until next funding settlement (from API when available, else derived). */
  nextFundingMs: number;
  /** Funding period in ms when known (e.g. 1h). */
  fundingPeriodMs: number;
  tag: FundingSideTag;
}

export type FundingCellResult =
  | { status: 'ok'; data: FundingOkData }
  | { status: 'error'; code: string; message: string };

export interface FundingMatrixRow {
  symbol: string;
  /** Max − min `fundingRateHourly` among ok cells, or null if fewer than two ok */
  maxArbRate: number | null;
  cells: Record<AdapterId, FundingCellResult>;
}

export interface FundingApiResponse {
  updatedAt: number;
  pairs: FundingMatrixRow[];
}
