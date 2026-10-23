import type { IPlatform } from '@/platform/IPlatform';
import { ECONOMY } from './config';

export const HEART_STORAGE_KEY = 'laser-mirror-hearts';
export const MAX_HEARTS = 5;
export const AD_HEART_REWARD = 5;
export const HEART_RECOVERY_KEY = 'laser-mirror-heart-recovery-v1';

function normalize(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_HEARTS, Math.floor(value))) : MAX_HEARTS;
}

function storedHearts(platform: IPlatform) {
  const raw = platform.storage.get(HEART_STORAGE_KEY);
  return raw === null || raw === '' ? MAX_HEARTS : normalize(Number(raw));
}

function recoveryAnchor(platform: IPlatform, now: number) {
  const value = Number(platform.storage.get(HEART_RECOVERY_KEY));
  return Number.isFinite(value) && value > 0 && value <= now ? value : now;
}

export function loadHearts(platform: IPlatform): number {
  return recoverHearts(platform).hearts;
}

export function saveHearts(platform: IPlatform, hearts: number, now = Date.now()) {
  const value = normalize(hearts);
  platform.storage.set(HEART_STORAGE_KEY, String(value));
  platform.storage.set(HEART_RECOVERY_KEY, String(value === MAX_HEARTS ? 0 : recoveryAnchor(platform, now)));
}

/** currentHearts can include a just-finished failed shot not yet saved. */
export function recoverHearts(platform: IPlatform, currentHearts = storedHearts(platform), now = Date.now()) {
  const current = normalize(currentHearts);
  const wasFull = storedHearts(platform) === MAX_HEARTS;
  const anchor = wasFull ? now : recoveryAnchor(platform, now);
  const elapsed = Math.max(0, Math.floor((now - anchor) / ECONOMY.heartRecoveryMs));
  const hearts = Math.min(MAX_HEARTS, current + elapsed);
  const nextAnchor = hearts === MAX_HEARTS ? 0 : anchor + elapsed * ECONOMY.heartRecoveryMs;
  platform.storage.set(HEART_STORAGE_KEY, String(hearts));
  platform.storage.set(HEART_RECOVERY_KEY, String(nextAnchor));
  return { hearts, recovered: hearts - current, nextAt: hearts === MAX_HEARTS ? null : nextAnchor + ECONOMY.heartRecoveryMs };
}

export function nextHeartRecovery(platform: IPlatform, now = Date.now()): number | null {
  return storedHearts(platform) >= MAX_HEARTS ? null : recoveryAnchor(platform, now) + ECONOMY.heartRecoveryMs;
}

export function heartRefillCost(hearts: number) {
  const missing = MAX_HEARTS - normalize(hearts);
  return missing === MAX_HEARTS ? ECONOMY.fullHeartPrice : missing * ECONOMY.heartPrice;
}

export function heartPurchase(coins: number, hearts: number, amount: 'one' | 'fill' | number) {
  const current = normalize(hearts);
  if (typeof amount === 'number' && (!Number.isInteger(amount) || amount < 1 || amount > MAX_HEARTS - current)) return null;
  const gained = typeof amount === 'number' ? amount : amount === 'one' ? Math.min(1, MAX_HEARTS - current) : MAX_HEARTS - current;
  const cost = amount === 'fill' ? heartRefillCost(current) : gained === MAX_HEARTS ? ECONOMY.fullHeartPrice : gained * ECONOMY.heartPrice;
  if (!gained || !Number.isSafeInteger(coins) || coins < cost) return null;
  return { coins: coins - cost, hearts: current + gained, gained, cost };
}
