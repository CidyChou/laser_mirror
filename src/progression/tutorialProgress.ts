import type { IPlatform } from '@/platform/IPlatform';
import type { LevelDefinition } from '@/gameplay/types';
import { tutorialLessonIds } from '@/gameplay/tutorial';

export const TUTORIAL_STORAGE_KEY = 'laser-mirror-tutorial-v1';
export function loadTutorialProgress(platform: IPlatform, levels: readonly LevelDefinition[], completed: ReadonlySet<number>): Set<string> {
  try {
    const raw = platform.storage.get(TUTORIAL_STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    }
  } catch { /* A corrupt save should never block entry to the game. */ }
  // Existing players have already learned mechanisms in completed boards. New ones still teach themselves.
  return new Set([...completed].flatMap(index => levels[index] ? tutorialLessonIds(levels[index]) : []));
}
export function saveTutorialProgress(platform: IPlatform, seen: ReadonlySet<string>) {
  platform.storage.set(TUTORIAL_STORAGE_KEY, JSON.stringify([...seen].sort()));
}
