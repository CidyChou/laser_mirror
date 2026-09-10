import type { LevelDefinition } from '@/gameplay/types';
import { stageId } from '@/levels/campaign';
import type { IPlatform } from '@/platform/IPlatform';

export const COMPLETED_LEVELS_STORAGE_KEY = 'laser-mirror-completed-levels';
export const CURRENT_LEVEL_STORAGE_KEY = 'laser-mirror-current-level';
export const COMPLETED_STAGES_STORAGE_KEY = 'laser-mirror-completed-stages-v2';
export const CURRENT_STAGE_STORAGE_KEY = 'laser-mirror-current-stage-v2';
export const ALL_LEVELS_UNLOCKED_STORAGE_KEY = 'laser-mirror-all-levels-unlocked';

export function loadAllLevelsUnlocked(platform: IPlatform): boolean {
  return platform.storage.get(ALL_LEVELS_UNLOCKED_STORAGE_KEY) === '1';
}

export function saveAllLevelsUnlocked(platform: IPlatform, unlocked: boolean) {
  platform.storage.set(ALL_LEVELS_UNLOCKED_STORAGE_KEY, unlocked ? '1' : '0');
}

function parseArray(raw: string | null): unknown[] | null {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function indexById(levels: readonly LevelDefinition[]): Map<string, number> {
  return new Map(levels.map((level, index) => [stageId(level, index), index]));
}

/** Loads stable stage ids. Existing numeric saves are migrated as ordinary
 * level numbers; a boss is considered complete when its preceding old level
 * was already complete, so adding bosses never revokes earned access. */
export function loadCompletedLevels(platform: IPlatform, levels: readonly LevelDefinition[]): Set<number> {
  const byId = indexById(levels);
  const current = parseArray(platform.storage.get(COMPLETED_STAGES_STORAGE_KEY));
  if (current) {
    return new Set(current.flatMap((value) => {
      const index = typeof value === 'string' ? byId.get(value) : undefined;
      return index == null ? [] : [index];
    }));
  }

  const legacy = parseArray(platform.storage.get(COMPLETED_LEVELS_STORAGE_KEY)) ?? [];
  const ordinaryNumbers = new Set(legacy.flatMap((value) => {
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < 130 ? [index + 1] : [];
  }));
  const migrated = new Set<number>();
  levels.forEach((level, index) => {
    const number = level.campaign?.displayNumber ?? index + 1;
    if (ordinaryNumbers.has(number)) migrated.add(index);
  });
  saveCompletedLevels(platform, migrated, levels);
  return migrated;
}

export function saveCompletedLevels(
  platform: IPlatform,
  completed: ReadonlySet<number>,
  levels: readonly LevelDefinition[],
) {
  const values = [...completed]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < levels.length)
    .sort((a, b) => a - b)
    .map((index) => stageId(levels[index], index));
  platform.storage.set(COMPLETED_STAGES_STORAGE_KEY, JSON.stringify(values));
}

export function firstIncompleteLevel(totalLevels: number, completed: ReadonlySet<number>): number {
  for (let index = 0; index < totalLevels; index += 1) {
    if (!completed.has(index)) return index;
  }
  return Math.max(0, totalLevels - 1);
}

export function isLevelUnlocked(
  index: number,
  totalLevels: number,
  completed: ReadonlySet<number>,
  allLevelsUnlocked = false,
): boolean {
  if (index < 0 || index >= totalLevels) return false;
  if (allLevelsUnlocked) return true;
  return completed.has(index) || index === firstIncompleteLevel(totalLevels, completed);
}

export function loadCurrentLevel(
  platform: IPlatform,
  levels: readonly LevelDefinition[],
  completed: ReadonlySet<number>,
  allLevelsUnlocked = false,
): number {
  const byId = indexById(levels);
  const stable = platform.storage.get(CURRENT_STAGE_STORAGE_KEY);
  let saved = stable ? byId.get(stable) : undefined;
  if (saved == null) {
    const legacyRaw = platform.storage.get(CURRENT_LEVEL_STORAGE_KEY);
    const legacy = legacyRaw === null ? NaN : Number(legacyRaw);
    if (Number.isInteger(legacy) && legacy >= 0 && legacy < 130) saved = byId.get(`level:${legacy + 1}`);
  }
  return saved != null && isLevelUnlocked(saved, levels.length, completed, allLevelsUnlocked)
    ? saved
    : firstIncompleteLevel(levels.length, completed);
}

export function saveCurrentLevel(platform: IPlatform, index: number, levels: readonly LevelDefinition[]) {
  const bounded = Math.max(0, Math.min(levels.length - 1, Math.floor(index)));
  platform.storage.set(CURRENT_STAGE_STORAGE_KEY, stageId(levels[bounded], bounded));
}

export function clearLevelProgress(platform: IPlatform) {
  platform.storage.set(COMPLETED_LEVELS_STORAGE_KEY, '[]');
  platform.storage.set(CURRENT_LEVEL_STORAGE_KEY, '0');
  platform.storage.set(COMPLETED_STAGES_STORAGE_KEY, '[]');
  platform.storage.set(CURRENT_STAGE_STORAGE_KEY, 'level:1');
}
