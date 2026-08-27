import rawLevels from './levels.json';
import type { LevelDefinition } from '@/gameplay/types';

export class LevelRepository {
  readonly levels: LevelDefinition[] = rawLevels as LevelDefinition[];
}
