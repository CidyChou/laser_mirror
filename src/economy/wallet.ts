import type { IPlatform } from '@/platform/IPlatform';

export const COIN_STORAGE_KEY = 'laser-mirror-coins';

export function loadCoins(platform: IPlatform): number {
  const raw = platform.storage.get(COIN_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function saveCoins(platform: IPlatform, coins: number) {
  platform.storage.set(COIN_STORAGE_KEY, String(Math.max(0, Math.floor(coins))));
}

export function winReward(levelIndex: number): number {
  return 36 + Math.max(0, levelIndex) * 2;
}
