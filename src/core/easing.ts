export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutBack(t: number, s = 1.70158): number {
  const p = t - 1;
  return p * p * ((s + 1) * p + s) + 1;
}
