import type { IPlatform } from '@/platform/IPlatform';

export const BONUS_USAGE_KEY = 'laser-mirror-ad-bonus-usage-v1';
export const COIN_AD_USAGE_KEY = 'laser-mirror-coin-ad-usage-v1';
export const INTERSTITIAL_PROGRESS_KEY = 'laser-mirror-ad-progress-v1';
export const HINT_COIN_COST = 60;

function today(now: number) {
  const date = new Date(now);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function bonusRemaining(platform: IPlatform, limit: number, now = Date.now(), key = BONUS_USAGE_KEY) {
  try {
    const saved = JSON.parse(platform.storage.get(key) || '{}');
    const count = saved.day === today(now) && Number.isInteger(saved.count) && saved.count > 0 ? saved.count : 0;
    return Math.max(0, limit - count);
  } catch { return limit; }
}

/** Call only after a completed video and after the reward is still applicable. */
export function consumeBonus(platform: IPlatform, limit: number, now = Date.now(), key = BONUS_USAGE_KEY) {
  const remaining = bonusRemaining(platform, limit, now, key);
  if (remaining <= 0) return false;
  platform.storage.set(key, JSON.stringify({ day: today(now), count: limit - remaining + 1 }));
  return true;
}

/** Count first clears only; callers pass false for replays and tutorial rewards. */
export function recordFirstClear(platform: IPlatform, key: string, firstAfter: number, every: number) {
  let seen: string[] = [];
  try {
    const saved: unknown = JSON.parse(platform.storage.get(INTERSTITIAL_PROGRESS_KEY) || '[]');
    if (Array.isArray(saved)) seen = [...new Set(saved.filter((value): value is string => typeof value === 'string'))];
  } catch {}
  if (seen.includes(key)) return false;
  seen.push(key);
  platform.storage.set(INTERSTITIAL_PROGRESS_KEY, JSON.stringify(seen));
  return seen.length >= firstAfter && (seen.length - firstAfter) % Math.max(1, every) === 0;
}
