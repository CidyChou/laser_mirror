import { readFileSync } from 'node:fs';
import classic from '../src/levels/classic.json';
import expansion from '../src/levels/expansion.json';
import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { focusNeed, itemKey } from '../src/gameplay/levelAccess';
import type { Direction, LevelDefinition, LevelItem, Orientation } from '../src/gameplay/types';

type ClassicTrace = {
  n: number;
  hits: boolean[];
  switches: string[];
  exits: string[];
  doors: Record<string, boolean>;
};

const simulator = new LaserSimulator();

function cloneItems(items: LevelItem[]): LevelItem[] {
  return items.map(item => ({ ...item })) as LevelItem[];
}

function solved(level: LevelDefinition, items: LevelItem[]): boolean {
  const trace = simulator.simulate(level, items, computeGeometry(level));
  if (!trace.hits.every(Boolean)) return false;
  return items.every(item => {
    if (item.type === 'focus') return !!trace.focusOn[itemKey(item.x, item.y)];
    return true;
  });
}

type Knob = { index: number; kind: 'bit' | 'dir' };

function knobs(items: LevelItem[]): Knob[] {
  const list: Knob[] = [];
  items.forEach((item, index) => {
    if ((item.type === 'mirror' || item.type === 'splitter') && !item.fixed) list.push({ index, kind: 'bit' });
    if (item.type === 'combiner' && !item.fixed) list.push({ index, kind: 'dir' });
  });
  return list;
}

function apply(items: LevelItem[], controls: Knob[], code: number) {
  let n = code;
  for (const knob of controls) {
    const item = items[knob.index];
    if (knob.kind === 'bit' && (item.type === 'mirror' || item.type === 'splitter')) {
      item.s = (n & 1) as Orientation;
      n >>= 1;
    } else if (knob.kind === 'dir' && item.type === 'combiner') {
      item.dir = (n & 3) as Direction;
      n >>= 2;
    }
  }
}

function search(level: LevelDefinition): { startSolved: boolean; solutions: number; first?: LevelItem[] } {
  const controls = knobs(level.items);
  const bits = controls.reduce((sum, knob) => sum + (knob.kind === 'bit' ? 1 : 2), 0);
  const limit = 1 << bits;
  const startSolved = solved(level, cloneItems(level.items));
  let solutions = 0;
  let first: LevelItem[] | undefined;
  for (let code = 0; code < limit; code++) {
    const items = cloneItems(level.items);
    apply(items, controls, code);
    if (!solved(level, items)) continue;
    solutions += 1;
    if (!first) first = items;
  }
  return { startSolved, solutions, first };
}

function classicFingerprint(level: LevelDefinition, index: number): ClassicTrace {
  const trace = simulator.simulate(level, level.items as LevelItem[], computeGeometry(level));
  return {
    n: index + 1,
    hits: trace.hits,
    switches: [...trace.switches].sort(),
    exits: trace.exits.map(exit => `${exit.side}${exit.index}`),
    doors: trace.doorStates,
  };
}

function snapshotClassic() {
  const errors: string[] = [];
  const expected = JSON.parse(readFileSync(new URL('../src/levels/classic-traces.json', import.meta.url), 'utf8')) as ClassicTrace[];
  (classic as LevelDefinition[]).forEach((level, index) => {
    const actual = JSON.stringify(classicFingerprint(level, index));
    const gold = JSON.stringify(expected[index]);
    if (actual !== gold) errors.push(`classic #${index + 1} laser trace changed`);
  });
  if (expected.length !== 50) errors.push(`classic-traces.json should have 50 entries, got ${expected.length}`);
  return errors;
}

function assertMechanics() {
  const errors: string[] = [];
  (expansion as LevelDefinition[]).forEach((level, index) => {
    const n = 51 + index;
    const start = simulator.simulate(level, level.items as LevelItem[], computeGeometry(level));
    for (const [key, on] of Object.entries(start.combinerOn)) {
      if (on) errors.push(`#${n} combiner ${key} is on at start`);
    }
    const result = search(level);
    if (!result.first) return;
    const win = simulator.simulate(level, result.first, computeGeometry(level));
    const focuses = result.first.filter(item => item.type === 'focus');
    for (const item of focuses) {
      const hits = win.impactEvents.filter(e => e.type === 'focus' && e.x === item.x && e.y === item.y);
      if (hits.length < 2) errors.push(`#${n} focus ${item.x},${item.y} only ${hits.length} impact(s)`);
      const directions = new Set(hits.flatMap(hit => hit.incomingDir === undefined ? [] : [hit.incomingDir]));
      if (directions.size < focusNeed(item)) {
        errors.push(`#${n} focus ${item.x},${item.y} has ${directions.size} incoming direction(s), needs ${focusNeed(item)}`);
      }
    }
    for (const item of result.first) {
      if (item.type !== 'combiner' || !win.combinerOn[itemKey(item.x, item.y)]) continue;
      const out = win.segments.find(seg => {
        const startAt = computeGeometry(level);
        const c = { x: startAt.ox + (item.x + 0.5) * startAt.cell, y: startAt.oy + (item.y + 0.5) * startAt.cell };
        return Math.hypot(seg.x1 - c.x, seg.y1 - c.y) < 2;
      });
      if (out && out.startDist < 30) errors.push(`#${n} combiner emits too early at ${out.startDist}`);
    }
  });
  return errors;
}

const mechanicErrors = assertMechanics();
if (mechanicErrors.length) {
  console.error(mechanicErrors.join('\n'));
  process.exit(1);
}
console.log('Combiner/focus mechanics OK.');

const classicErrors = snapshotClassic();
if (classicErrors.length) {
  console.error(classicErrors.join('\n'));
  process.exit(1);
}
console.log(`Classic 50 simulate OK.`);

const levels = expansion as LevelDefinition[];
let failed = 0;
levels.forEach((level, index) => {
  const n = index + 51;
  const result = search(level);
  const focus = level.items.filter(item => item.type === 'focus').length;
  const combiners = level.items.filter(item => item.type === 'combiner').length;
  const flag = result.solutions === 0 ? 'UNSOLVED' : result.startSolved ? 'ALREADY' : 'ok';
  console.log(`#${n} ${level.name.padEnd(8)} sol=${result.solutions} start=${result.startSolved ? 'yes' : 'no'} focus=${focus} comb=${combiners} ${flag}`);
  if (result.solutions === 0) failed += 1;
});
if (failed) {
  console.error(`${failed} expansion levels have no solution`);
  process.exit(1);
}
console.log('All expansion levels have at least one solution.');
