import rawLevels from './levels.json';
import rawTimeBosses from './time-bosses.json';
import type { LevelDefinition } from '@/gameplay/types';

export class LevelRepository {
  readonly normalLevels: LevelDefinition[] = (rawLevels as LevelDefinition[]).map((level, index) => ({
    ...level,
    campaign: { id: `level:${index + 1}`, kind: 'normal', displayNumber: index + 1 },
  }));

  readonly timeBosses: LevelDefinition[] = (rawTimeBosses as LevelDefinition[]).map((level) => ({
    ...level,
    campaign: { id: `boss:${level.chapterNo}`, kind: 'boss', displayNumber: level.chapterNo * 10 },
  }));

  readonly levels: LevelDefinition[] = this.normalLevels.flatMap((level, index) => {
    const number = index + 1;
    const boss = number % 10 === 0
      ? this.timeBosses.find((entry) => entry.campaign?.displayNumber === number)
      : undefined;
    return boss ? [level, boss] : [level];
  });
}
