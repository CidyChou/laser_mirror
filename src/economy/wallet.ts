import type { IPlatform } from '@/platform/IPlatform';
import { ECONOMY } from './config';

export const COIN_STORAGE_KEY = 'laser-mirror-coins';
export const WALLET_INITIALIZED_KEY = 'laser-mirror-wallet-initialized-v2';

export function loadCoins(platform: IPlatform): number {
  const raw = platform.storage.get(COIN_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function saveCoins(platform: IPlatform, coins: number) {
  platform.storage.set(COIN_STORAGE_KEY, String(Math.max(0, Math.floor(coins))));
}

export function initializeCoins(platform: IPlatform, hasProgress: boolean): number {
  const saved = platform.storage.get(COIN_STORAGE_KEY);
  let coins = loadCoins(platform);
  if (platform.storage.get(WALLET_INITIALIZED_KEY) !== '1') {
    if ((saved === null || saved === '') && !hasProgress) coins = ECONOMY.starterCoins;
    platform.storage.set(WALLET_INITIALIZED_KEY, '1');
    saveCoins(platform, coins);
  }
  return coins;
}

export function winReward(levelIndex: number, boss = false): number {
  const number = Math.max(1, Math.floor(Number.isFinite(levelIndex) ? levelIndex : 0) + 1);
  const tier = ECONOMY.firstClearTiers.find(tier => number <= tier.through) ?? ECONOMY.firstClearTiers[ECONOMY.firstClearTiers.length - 1];
  return tier.coins * (boss ? 2 : 1);
}

export function firstClearReward(levelIndex: number, boss: boolean, newlyCompleted: boolean): number {
  return newlyCompleted ? winReward(levelIndex, boss) : 0;
}
