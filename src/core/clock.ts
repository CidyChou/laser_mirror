let last = 0;

/** Monotonic milliseconds for shot timing. Mini-game `performance.now()` can
 *  stall, go backwards, or return 0 outside rAF; those values freeze a shot. */
export function nowMs(): number {
  const performance = (globalThis as any).performance;
  let value = typeof performance?.now === 'function' ? Number(performance.now()) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) value = Date.now();
  if (value < last) value = last;
  last = value;
  return value;
}
