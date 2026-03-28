/** Format decimal funding rate as percentage (e.g. 0.0001 → 0.0100%). */
export function formatRateAsPercent(rate: number, decimals = 4): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}
