import type { IPlatform } from '@/platform/IPlatform';

export const COMPLETED_LEVELS_STORAGE_KEY = 'laser-mirror-completed-levels';
export const CURRENT_LEVEL_STORAGE_KEY = 'laser-mirror-current-level';

export function loadCompletedLevels(platform: IPlatform, totalLevels: number): Set<number> {
  try {
    const raw = platform.storage.get(COMPLETED_LEVELS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.flatMap((value) => {
      const index = Number(value);
      return Number.isInteger(index) && index >= 0 && index < totalLevels ? [index] : [];
    }));
  } catch {
    return new Set();
  }
}

export function saveCompletedLevels(platform: IPlatform, completed: ReadonlySet<number>) {
  const values = [...completed].filter(Number.isInteger).sort((a, b) => a - b);
  platform.storage.set(COMPLETED_LEVELS_STORAGE_KEY, JSON.stringify(values));
}

export function firstIncompleteLevel(totalLevels: number, completed: ReadonlySet<number>): number {
  for (let index = 0; index < totalLevels; index += 1) {
    if (!completed.has(index)) return index;
  }
  return Math.max(0, totalLevels - 1);
}

export function isLevelUnlocked(index: number, totalLevels: number, completed: ReadonlySet<number>): boolean {
  if (index < 0 || index >= totalLevels) return false;
  return completed.has(index) || index === firstIncompleteLevel(totalLevels, completed);
}

export function loadCurrentLevel(platform: IPlatform, totalLevels: number, completed: ReadonlySet<number>): number {
  const raw = platform.storage.get(CURRENT_LEVEL_STORAGE_KEY);
  const saved = raw === null ? firstIncompleteLevel(totalLevels, completed) : Number(raw);
  return Number.isInteger(saved) && isLevelUnlocked(saved, totalLevels, completed)
    ? saved
    : firstIncompleteLevel(totalLevels, completed);
}

export function saveCurrentLevel(platform: IPlatform, index: number) {
  platform.storage.set(CURRENT_LEVEL_STORAGE_KEY, String(Math.max(0, Math.floor(index))));
}

export function clearLevelProgress(platform: IPlatform) {
  saveCompletedLevels(platform, new Set());
  saveCurrentLevel(platform, 0);
}
