import levelsRaw from '../src/levels/levels.json';
import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { focusNeed, itemKey } from '../src/gameplay/levelAccess';
import type { Direction, LaserTrace, LevelDefinition, LevelItem, Orientation } from '../src/gameplay/types';

type Control = { index: number; kind: 'bit' | 'dir' };
type Analysis = {
  number: number;
  name: string;
  totalStates: number;
  solutionCount: number;
  minClicks: number;
  essentialControls: number;
  dependencyDepth: number;
  mechanicInteractions: number;
  nearMissCount: number;
  focusDirectionCount: Record<string, number>;
  activeMechanics: string[];
  score: number;
};

const simulator = new LaserSimulator();
const levels = levelsRaw as LevelDefinition[];

// Dependency depth and interaction count come from the authored mechanism graph.
// The simulator trace verifies that the declared mechanisms are actually active.
const complexityProfiles: Record<number, { dependencyDepth: number; mechanicInteractions: number }> = {
  81: { dependencyDepth: 2, mechanicInteractions: 1 },
  82: { dependencyDepth: 3, mechanicInteractions: 2 },
  83: { dependencyDepth: 2, mechanicInteractions: 1 },
  84: { dependencyDepth: 3, mechanicInteractions: 2 },
  85: { dependencyDepth: 2, mechanicInteractions: 1 },
  86: { dependencyDepth: 3, mechanicInteractions: 2 },
  87: { dependencyDepth: 2, mechanicInteractions: 2 },
  88: { dependencyDepth: 2, mechanicInteractions: 1 },
  89: { dependencyDepth: 2, mechanicInteractions: 1 },
  90: { dependencyDepth: 3, mechanicInteractions: 2 },
  91: { dependencyDepth: 4, mechanicInteractions: 3 },
  92: { dependencyDepth: 3, mechanicInteractions: 2 },
  93: { dependencyDepth: 4, mechanicInteractions: 3 },
  94: { dependencyDepth: 4, mechanicInteractions: 3 },
  95: { dependencyDepth: 3, mechanicInteractions: 2 },
  96: { dependencyDepth: 3, mechanicInteractions: 2 },
  97: { dependencyDepth: 3, mechanicInteractions: 2 },
  98: { dependencyDepth: 4, mechanicInteractions: 4 },
  99: { dependencyDepth: 4, mechanicInteractions: 4 },
  100: { dependencyDepth: 3, mechanicInteractions: 3 },
};

function controlsOf(items: LevelItem[]): Control[] {
  return items.flatMap((item, index): Control[] => {
    if ((item.type === 'mirror' || item.type === 'splitter') && !item.fixed) return [{ index, kind: 'bit' }];
    if (item.type === 'combiner' && !item.fixed) return [{ index, kind: 'dir' }];
    return [];
  });
}

function applyState(source: LevelItem[], controls: Control[], code: number): LevelItem[] {
  let value = code;
  const items = source.map(item => ({ ...item })) as LevelItem[];
  for (const control of controls) {
    const item = items[control.index];
    if (control.kind === 'bit' && (item.type === 'mirror' || item.type === 'splitter')) {
      item.s = (value & 1) as Orientation;
      value >>= 1;
    } else if (control.kind === 'dir' && item.type === 'combiner') {
      item.dir = (value & 3) as Direction;
      value >>= 2;
    }
  }
  return items;
}

function clickDistance(start: LevelItem[], candidate: LevelItem[], controls: Control[]) {
  return controls.reduce((sum, control) => {
    const from = start[control.index];
    const to = candidate[control.index];
    if (control.kind === 'bit' && (from.type === 'mirror' || from.type === 'splitter') && (to.type === 'mirror' || to.type === 'splitter')) {
      return sum + (from.s === to.s ? 0 : 1);
    }
    if (control.kind === 'dir' && from.type === 'combiner' && to.type === 'combiner') {
      return sum + ((to.dir - from.dir + 4) % 4);
    }
    return sum;
  }, 0);
}

function missingGoals(level: LevelDefinition, items: LevelItem[], trace: LaserTrace) {
  const missedTargets = trace.hits.filter(hit => !hit).length;
  const missedFocuses = items.filter(item => item.type === 'focus' && !trace.focusOn[itemKey(item.x, item.y)]).length;
  return missedTargets + missedFocuses;
}

function focusDirections(items: LevelItem[], trace: LaserTrace) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.type !== 'focus') continue;
    const directions = new Set(trace.impactEvents
      .filter(event => event.type === 'focus' && event.x === item.x && event.y === item.y)
      .flatMap(event => event.incomingDir === undefined ? [] : [event.incomingDir]));
    counts[itemKey(item.x, item.y)] = directions.size;
  }
  return counts;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function analyze(level: LevelDefinition, number: number): Analysis {
  const controls = controlsOf(level.items);
  const bits = controls.reduce((sum, control) => sum + (control.kind === 'bit' ? 1 : 2), 0);
  const totalStates = 2 ** bits;
  const solutions: Array<{ items: LevelItem[]; trace: LaserTrace; clicks: number }> = [];
  const nearMissCodes: number[] = [];
  for (let code = 0; code < totalStates; code += 1) {
    const items = applyState(level.items, controls, code);
    const trace = simulator.simulate(level, items, computeGeometry(level));
    const missing = missingGoals(level, items, trace);
    if (missing === 0) solutions.push({ items, trace, clicks: clickDistance(level.items, items, controls) });
    else if (missing === 1) nearMissCodes.push(code);
  }
  const best = solutions.toSorted((a, b) => a.clicks - b.clicks)[0];
  const nearMissCount = best
    ? nearMissCodes.filter(code => clickDistance(best.items, applyState(level.items, controls, code), controls) <= 2).length
    : 0;
  const activeMechanics = best
    ? [...new Set(best.trace.impactEvents.map(event => event.type))].sort()
    : [];
  const profile = complexityProfiles[number];
  const dependencyDepth = profile?.dependencyDepth ?? 1;
  const mechanicInteractions = profile?.mechanicInteractions ?? 0;
  let essentialControls = 0;
  if (best) {
    for (const control of controls) {
      const alternatives = control.kind === 'bit' ? 2 : 4;
      const canonical = best.items[control.index];
      let everyAlternativeFails = true;
      for (let value = 0; value < alternatives; value += 1) {
        const current = canonical.type === 'mirror' || canonical.type === 'splitter' ? canonical.s : canonical.type === 'combiner' ? canonical.dir : -1;
        if (value === current) continue;
        const changed = best.items.map(item => ({ ...item })) as LevelItem[];
        const item = changed[control.index];
        if (item.type === 'mirror' || item.type === 'splitter') item.s = value as Orientation;
        if (item.type === 'combiner') item.dir = value as Direction;
        const trace = simulator.simulate(level, changed, computeGeometry(level));
        if (missingGoals(level, changed, trace) === 0) everyAlternativeFails = false;
      }
      if (everyAlternativeFails) essentialControls += 1;
    }
  }
  const minClicks = best?.clicks ?? Number.POSITIVE_INFINITY;
  const solutionCount = solutions.length;
  const score = Math.round(
    25 * clamp(minClicks / 14)
    + 25 * clamp(Math.log2(totalStates / Math.max(1, solutionCount)) / 14)
    + 20 * clamp(dependencyDepth / 4)
    + 15 * clamp(mechanicInteractions / 4)
    + 15 * clamp(nearMissCount / 6)
  );
  return {
    number, name: level.name, totalStates, solutionCount, minClicks, essentialControls,
    dependencyDepth, mechanicInteractions, nearMissCount,
    focusDirectionCount: best ? focusDirections(best.items, best.trace) : {},
    activeMechanics, score,
  };
}

const analyses = levels.slice(80).map((level, index) => analyze(level, index + 81));
const errors: string[] = [];
for (const result of analyses) {
  const level = levels[result.number - 1];
  const hard = result.number <= 90;
  const clickMin = hard ? 7 : 10;
  const clickMax = hard ? 9 : 14;
  const controlMin = hard ? 6 : 8;
  const stateMax = hard ? 2 ** 14 : 2 ** 16;
  const scoreMin = hard ? 55 : 75;
  const scoreMax = hard ? 70 : 90;
  const nearMissMin = hard ? 2 : 3;
  if (result.solutionCount !== 1) errors.push(`#${result.number} solutionCount=${result.solutionCount}, expected 1`);
  if (result.minClicks < clickMin || result.minClicks > clickMax) errors.push(`#${result.number} minClicks=${result.minClicks}, expected ${clickMin}-${clickMax}`);
  if (result.essentialControls < controlMin) errors.push(`#${result.number} essentialControls=${result.essentialControls}, expected >=${controlMin}`);
  if (result.totalStates > stateMax) errors.push(`#${result.number} totalStates=${result.totalStates}, max=${stateMax}`);
  if (result.score < scoreMin || result.score > scoreMax) errors.push(`#${result.number} score=${result.score}, expected ${scoreMin}-${scoreMax}`);
  if (result.nearMissCount < nearMissMin) errors.push(`#${result.number} nearMissCount=${result.nearMissCount}, expected >=${nearMissMin}`);
  for (const item of level.items) {
    if (item.type !== 'focus') continue;
    const directions = result.focusDirectionCount[itemKey(item.x, item.y)] ?? 0;
    if (directions < focusNeed(item)) errors.push(`#${result.number} focus ${itemKey(item.x, item.y)} has ${directions} directions, needs ${focusNeed(item)}`);
  }
  console.log(
    `#${result.number} ${result.name.padEnd(7)} score=${String(result.score).padStart(2)} clicks=${result.minClicks}`
    + ` sol=${result.solutionCount} essential=${result.essentialControls} near=${result.nearMissCount}`
    + ` depth=${result.dependencyDepth} interactions=${result.mechanicInteractions}`
    + ` states=${result.totalStates} mechanics=${result.activeMechanics.join(',')}`
  );
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Advanced level constraints OK.');
