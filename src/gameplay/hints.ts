import solutions from '@/levels/hints.json';
import { stageId } from '@/levels/campaign';
import type { GameState, LevelDefinition, LevelItem } from './types';
import { LaserSimulator } from './LaserSimulator';
import { computeGeometry } from './geometry';
import { itemKey } from './levelAccess';

const simulator = new LaserSimulator();

export interface HintControl { x: number; y: number; value: number }
export interface HintSolution { signature: string; controls: HintControl[] }
export interface MirrorHint { x: number; y: number; turns: number; text: string }

/** Include the source orientation so changes to a board invalidate stale hints. */
export function hintSignature(level: LevelDefinition) {
  const source = JSON.stringify([level.rows, level.cols, level.emitter, level.emitters, level.targets, level.items]);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function mirrorHint(state: GameState): MirrorHint | null {
  if (state.level.timeBoss || state.firing || state.won) return null;
  const entry = (solutions as Record<string, HintSolution>)[stageId(state.level, state.levelIndex)];
  if (!entry || entry.signature !== hintSignature(state.level)) return null;
  const trace = simulator.simulate(state.level, state.items, computeGeometry(state.level));
  if (trace.hits.every(Boolean) && state.items.every(item => item.type !== 'focus' || trace.focusOn[itemKey(item.x, item.y)])) return null;
  for (const target of entry.controls) {
    const item = state.items.find(item => item.x === target.x && item.y === target.y);
    if (!item || !['mirror', 'splitter', 'combiner'].includes(item.type)) continue;
    const size = item.type === 'combiner' ? 4 : 2;
    const turns = (target.value - controlValue(item) + size) % size;
    if (turns) return { x: item.x, y: item.y, turns, text: `已调整第 ${item.y + 1} 行、第 ${item.x + 1} 列的${item.type === 'combiner' ? '集光器' : item.type === 'splitter' ? '分光器' : '镜子'}` };
  }
  return null;
}

export function controlValue(item: LevelItem) {
  return item.type === 'combiner' ? item.dir : item.type === 'mirror' || item.type === 'splitter' ? item.s : 0;
}
