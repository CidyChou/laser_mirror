import type { LevelDefinition } from '@/gameplay/types';

export function stageId(level: LevelDefinition, fallbackIndex = 0): string {
  return level.campaign?.id ?? level.stageKey ?? `level:${fallbackIndex + 1}`;
}

export function isBossStage(level: LevelDefinition): boolean {
  return level.campaign?.kind === 'boss' || Boolean(level.timeBoss);
}

export function stageLabel(level: LevelDefinition, fallbackIndex = 0): string {
  const number = level.campaign?.displayNumber ?? fallbackIndex + 1;
  return isBossStage(level) ? `第 ${level.chapterNo} 章 · 挑战` : `第 ${number} 关`;
}

export function stageCompletionLabel(level: LevelDefinition, fallbackIndex = 0): string {
  const number = level.campaign?.displayNumber ?? fallbackIndex + 1;
  return isBossStage(level) ? `第 ${level.chapterNo} 章挑战已完成` : `第 ${number} 关已完成`;
}

export function stageFileLabel(level: LevelDefinition, fallbackIndex = 0): string {
  const number = level.campaign?.displayNumber ?? fallbackIndex + 1;
  return isBossStage(level) ? `第${level.chapterNo}章-挑战` : `第${number}关`;
}

export function rewardLevelIndex(level: LevelDefinition, fallbackIndex = 0): number {
  return Math.max(0, (level.campaign?.displayNumber ?? fallbackIndex + 1) - 1);
}
