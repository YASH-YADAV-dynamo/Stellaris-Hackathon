import type { FundingSideTag } from '@/types/funding';
import { FUNDING_RATE_DEADBAND } from '@/lib/funding/constants';

/**
 * Positive funding → longs pay shorts → earn by shorting → SELL.
 * Negative funding → shorts pay longs → earn by longing → BUY.
 */
export function fundingTagFromRate(hourlyRate: number): FundingSideTag {
  if (!Number.isFinite(hourlyRate)) return 'neutral';
  if (Math.abs(hourlyRate) < FUNDING_RATE_DEADBAND) return 'neutral';
  return hourlyRate > 0 ? 'sell' : 'buy';
}
