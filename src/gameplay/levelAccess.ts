import type { Direction, LevelDefinition, LevelItem, Port } from './types';

export function levelEmitters(level: LevelDefinition): Port[] {
  if (level.emitters && level.emitters.length > 0) return level.emitters;
  return [level.emitter];
}

export function startStateFromPort(level: Pick<LevelDefinition, 'cols' | 'rows'>, port: Port): {x:number;y:number;dir:Direction} {
  const i = port.index;
  if (port.side === 'W') return { x: -1, y: i, dir: 0 };
  if (port.side === 'E') return { x: level.cols, y: i, dir: 2 };
  if (port.side === 'N') return { x: i, y: -1, dir: 1 };
  return { x: i, y: level.rows, dir: 3 };
}

export function itemKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function focusNeed(item: Extract<LevelItem, { type: 'focus' }>): number {
  const n = Math.floor(item.need ?? 2);
  return n > 1 ? n : 2;
}

export function combinerNeed(item: Extract<LevelItem, { type: 'combiner' }>): number {
  const n = Math.floor(item.need ?? 2);
  return n > 1 ? n : 2;
}

export function nextCombinerDir(dir: Direction): Direction {
  return ((dir + 1) % 4) as Direction;
}
