import type { IPlatform } from '@/platform/IPlatform';

export const HEART_STORAGE_KEY = 'laser-mirror-hearts';
export const MAX_HEARTS = 3;

export function loadHearts(platform: IPlatform): number {
  const raw = platform.storage.get(HEART_STORAGE_KEY);
  if (raw === null || raw === '') return MAX_HEARTS;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(MAX_HEARTS, Math.floor(parsed)))
    : MAX_HEARTS;
}

export function saveHearts(platform: IPlatform, hearts: number) {
  const value = Math.max(0, Math.min(MAX_HEARTS, Math.floor(hearts)));
  platform.storage.set(HEART_STORAGE_KEY, String(value));
}
