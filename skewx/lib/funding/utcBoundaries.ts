import { ONE_HOUR_MS } from '@/lib/funding/constants';

/** Next 00:00 / 08:00 / 16:00 UTC boundary after `nowMs`. */
export function nextUtc8hBoundaryMs(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  const h = d.getUTCHours();
  const slot = Math.floor(h / 8) * 8;
  d.setUTCHours(slot, 0, 0, 0);
  let t = d.getTime();
  if (t <= nowMs) t += 8 * ONE_HOUR_MS;
  return t;
}

/** Next 4h UTC boundary (0,4,8,12,16,20). */
export function nextUtc4hBoundaryMs(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  const h = d.getUTCHours();
  const slot = Math.floor(h / 4) * 4;
  d.setUTCHours(slot, 0, 0, 0);
  let t = d.getTime();
  if (t <= nowMs) t += 4 * ONE_HOUR_MS;
  return t;
}
