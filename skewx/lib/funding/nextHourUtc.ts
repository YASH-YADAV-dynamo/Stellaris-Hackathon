/** Next UTC hour boundary in ms (used when API omits nextFundingTime). */
export function nextUtcHourMs(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  d.setUTCMinutes(0, 0, 0);
  let t = d.getTime();
  if (t <= nowMs) t += 3_600_000;
  return t;
}
