import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { itemKey } from '../src/gameplay/levelAccess';
import type { Direction, LevelDefinition, LevelItem, Orientation, Port } from '../src/gameplay/types';

type XY = [number, number];
type Extra = { fixed?: true; decoy?: true };
type AdvancedSpec = Omit<LevelDefinition, 'emitter' | 'items'> & {
  emitters: Port[];
  solution: LevelItem[];
  targetClicks: number;
  minControls: number;
};

const simulator = new LaserSimulator();
const m = (x: number, y: number, s: Orientation, extra: Extra = {}): LevelItem => ({ type: 'mirror', x, y, s, ...extra });
const sp = (x: number, y: number, s: Orientation, extra: Extra = {}): LevelItem => ({ type: 'splitter', x, y, s, ...extra });
const wall = (x: number, y: number): LevelItem => ({ type: 'wall', x, y });
const focus = (x: number, y: number, need = 2): LevelItem => ({ type: 'focus', x, y, need });
const comb = (x: number, y: number, dir: Direction, need = 2): LevelItem => ({ type: 'combiner', x, y, dir, need });
const sw = (x: number, y: number, id: string): LevelItem => ({ type: 'switch', x, y, id });
const door = (x: number, y: number, id: string, requires: string[]): LevelItem => ({ type: 'door', x, y, id, requires });
const portal = (x: number, y: number, pair: string): LevelItem => ({ type: 'portal', x, y, pair });
const port = (side: Port['side'], index: number): Port => ({ side, index });

function dirOf(a: XY, b: XY): Direction {
  if (b[0] > a[0] && b[1] === a[1]) return 0;
  if (b[1] > a[1] && b[0] === a[0]) return 1;
  if (b[0] < a[0] && b[1] === a[1]) return 2;
  if (b[1] < a[1] && b[0] === a[0]) return 3;
  throw new Error(`non-orthogonal path ${a} -> ${b}`);
}

function mirrorS(incoming: Direction, outgoing: Direction): Orientation {
  if (([1, 0, 3, 2] as Direction[])[incoming] === outgoing) return 0;
  if (([3, 2, 1, 0] as Direction[])[incoming] === outgoing) return 1;
  throw new Error(`no mirror for ${incoming} -> ${outgoing}`);
}

function expand(points: XY[]): XY[] {
  const cells: XY[] = [points[0]];
  for (const [tx, ty] of points.slice(1)) {
    let [x, y] = cells[cells.length - 1];
    while (x !== tx || y !== ty) {
      if (x !== tx && y !== ty) throw new Error(`diagonal path ${x},${y} -> ${tx},${ty}`);
      if (x < tx) x += 1;
      else if (x > tx) x -= 1;
      else if (y < ty) y += 1;
      else y -= 1;
      cells.push([x, y]);
    }
  }
  return cells;
}

function path(points: XY[], extra: Extra = {}, opts: { startDir?: Direction; endDir?: Direction } = {}): LevelItem[] {
  const cells = expand(points);
  const result: LevelItem[] = [];
  if (opts.startDir !== undefined && cells.length > 1) {
    const outgoing = dirOf(cells[0], cells[1]);
    if (outgoing !== opts.startDir) result.push(m(cells[0][0], cells[0][1], mirrorS(opts.startDir, outgoing), extra));
  }
  for (let index = 1; index < cells.length - 1; index += 1) {
    const incoming = dirOf(cells[index - 1], cells[index]);
    const outgoing = dirOf(cells[index], cells[index + 1]);
    if (incoming !== outgoing) result.push(m(cells[index][0], cells[index][1], mirrorS(incoming, outgoing), extra));
  }
  if (opts.endDir !== undefined && cells.length > 1) {
    const last = cells[cells.length - 1];
    const incoming = dirOf(cells[cells.length - 2], last);
    if (incoming !== opts.endDir) result.push(m(last[0], last[1], mirrorS(incoming, opts.endDir), extra));
  }
  return result;
}

function merge(...parts: LevelItem[][]): LevelItem[] {
  const cells = new Map<string, LevelItem>();
  for (const item of parts.flat()) {
    const key = itemKey(item.x, item.y);
    const previous = cells.get(key);
    if (!previous) {
      cells.set(key, item);
      continue;
    }
    if (JSON.stringify(previous) !== JSON.stringify(item)) {
      throw new Error(`advanced level cell conflict at ${key}: ${previous.type}/${item.type}`);
    }
  }
  return [...cells.values()];
}

function asLevel(spec: AdvancedSpec, items: LevelItem[]): LevelDefinition {
  return {
    name: spec.name,
    chapter: spec.chapter,
    chapterNo: spec.chapterNo,
    rows: spec.rows,
    cols: spec.cols,
    emitter: spec.emitters[0],
    emitters: spec.emitters,
    targets: spec.targets,
    items,
    shots: 3,
    hint: spec.hint,
  };
}

function isSolved(level: LevelDefinition, items: LevelItem[]) {
  const trace = simulator.simulate(level, items, computeGeometry(level));
  return trace.hits.every(Boolean)
    && items.every(item => item.type !== 'focus' || !!trace.focusOn[itemKey(item.x, item.y)]);
}

type Control = { index: number; kind: 'bit' | 'dir' };

function controlsOf(items: LevelItem[]): Control[] {
  return items.flatMap((item, index): Control[] => {
    if ((item.type === 'mirror' || item.type === 'splitter') && !item.fixed) return [{ index, kind: 'bit' }];
    if (item.type === 'combiner' && !item.fixed) return [{ index, kind: 'dir' }];
    return [];
  });
}

function enumerateSolutions(level: LevelDefinition, canonical: LevelItem[]) {
  const controls = controlsOf(canonical);
  const bits = controls.reduce((sum, control) => sum + (control.kind === 'bit' ? 1 : 2), 0);
  if (bits > 16) throw new Error(`${level.name} has ${bits} control bits; limit is 16`);
  const solutions: number[][] = [];
  for (let code = 0; code < 2 ** bits; code += 1) {
    let value = code;
    const items = canonical.map(item => ({ ...item })) as LevelItem[];
    const state: number[] = [];
    for (const control of controls) {
      const item = items[control.index];
      if (control.kind === 'bit' && (item.type === 'mirror' || item.type === 'splitter')) {
        item.s = (value & 1) as Orientation;
        state.push(item.s);
        value >>= 1;
      } else if (control.kind === 'dir' && item.type === 'combiner') {
        item.dir = (value & 3) as Direction;
        state.push(item.dir);
        value >>= 2;
      }
    }
    if (isSolved(level, items)) solutions.push(state);
  }
  return { controls, solutions };
}

function lockAmbiguousControls(spec: AdvancedSpec): LevelItem[] {
  const solution = spec.solution.map(item => ({ ...item })) as LevelItem[];
  for (;;) {
    const level = asLevel(spec, solution);
    const { controls, solutions } = enumerateSolutions(level, solution);
    if (!solutions.length) {
      const trace = simulator.simulate(level, solution, computeGeometry(level));
      throw new Error(`${spec.name} canonical layout is not solvable: hits=${JSON.stringify(trace.hits)} focus=${JSON.stringify(trace.focusOn)} exits=${trace.exits.map(exit => `${exit.side}${exit.index}`).join(',')} switches=${[...trace.switches].join(',')} impacts=${trace.impactEvents.map(event => `${event.type}@${event.x},${event.y}`).join('|')}`);
    }
    if (solutions.length === 1) return solution;
    const canonicalState = controls.map(control => {
      const item = solution[control.index];
      return item.type === 'mirror' || item.type === 'splitter' ? item.s : item.type === 'combiner' ? item.dir : -1;
    });
    const ambiguousIndexes = canonicalState
      .map((value, index) => solutions.some(state => state[index] !== value) ? index : -1)
      .filter(index => index >= 0);
    const ambiguous = ambiguousIndexes.find(index => controls[index].kind === 'bit') ?? ambiguousIndexes[0] ?? -1;
    if (ambiguous < 0) throw new Error(`${spec.name} has duplicate canonical solutions`);
    const item = solution[controls[ambiguous].index];
    if (item.type === 'mirror' || item.type === 'splitter' || item.type === 'combiner') item.fixed = true;
  }
}

function scrambleToClicks(items: LevelItem[], clicks: number): LevelItem[] {
  const result = items.map(item => ({ ...item })) as LevelItem[];
  let remaining = clicks;
  for (const item of result) {
    if (remaining <= 0) break;
    if ((item.type === 'mirror' || item.type === 'splitter') && !item.fixed) {
      item.s = (item.s ^ 1) as Orientation;
      remaining -= 1;
    }
  }
  for (const item of result) {
    if (remaining <= 0) break;
    if (item.type !== 'combiner' || item.fixed) continue;
    const delta = Math.min(3, remaining) as 1 | 2 | 3;
    item.dir = ((item.dir - delta + 4) % 4) as Direction;
    remaining -= delta;
  }
  if (remaining) throw new Error(`cannot scramble layout to ${clicks} clicks`);
  return result;
}

function finalize(spec: AdvancedSpec): LevelDefinition {
  const canonical = lockAmbiguousControls(spec);
  const controlCount = controlsOf(canonical).length;
  if (controlCount < spec.minControls) {
    throw new Error(`${spec.name} has ${controlCount} essential controls; needs ${spec.minControls}`);
  }
  let startItems: LevelItem[];
  try {
    startItems = scrambleToClicks(canonical, spec.targetClicks);
  } catch (error) {
    throw new Error(`${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const level = asLevel(spec, startItems);
  if (isSolved(level, level.items)) throw new Error(`${spec.name} starts solved`);
  return level;
}

const hard = '交错机关';
const expert = '终极光域';

const specs: AdvancedSpec[] = [
  {
    name: '交叉开门', chapter: hard, chapterNo: 9, cols: 7, rows: 7,
    emitters: [port('W', 1), port('W', 5)], targets: [port('E', 1), port('E', 5)], shots: 3,
    hint: '两束光打开的门，并不属于自己。', targetClicks: 7, minControls: 6,
    solution: merge(
      [sp(2, 1, 0), sp(4, 5, 1), sw(2, 4, 'A'), sw(4, 2, 'B'), door(5, 0, 'DB', ['B']), door(5, 5, 'DA', ['A'])],
      path([[2, 1], [3, 1], [3, 0], [6, 0], [6, 1]], {}, { endDir: 0 }),
      path([[0, 5], [1, 5], [1, 6], [4, 6], [4, 5]], {}, { startDir: 0 }),
      [wall(0, 3), wall(6, 3)],
    ),
  },
  {
    name: '跃迁充能', chapter: hard, chapterNo: 9, cols: 7, rows: 7,
    emitters: [port('W', 1), port('S', 3)], targets: [port('E', 5)], shots: 3,
    hint: '传送只改变位置，不改变方向。', targetClicks: 7, minControls: 6,
    solution: merge(
      [sp(1, 1, 0), portal(1, 3, 'P1'), portal(5, 3, 'P1'), focus(3, 4)],
      path([[1, 1], [3, 1], [3, 0], [6, 0], [6, 5]], {}, { endDir: 0 }),
      path([[5, 4], [3, 4]], {}, { startDir: 1 }),
      path([[3, 6], [5, 6], [5, 5], [3, 5], [3, 4]], {}, { startDir: 3 }),
      [wall(2, 2), wall(4, 2)],
    ),
  },
  {
    name: '双锁分流', chapter: hard, chapterNo: 9, cols: 7, rows: 7,
    emitters: [port('W', 2), port('S', 0)], targets: [port('E', 1), port('E', 5)], shots: 3,
    hint: '两枚认证缺一不可，分出去的光也要回来。', targetClicks: 7, minControls: 6,
    solution: merge(
      [sp(1, 2, 0), sp(1, 5, 1), sw(1, 4, 'A'), sw(3, 2, 'B'), door(5, 1, 'D', ['A', 'B'])],
      path([[1, 2], [4, 2], [4, 1], [6, 1]]),
      path([[0, 6], [1, 6], [1, 5]], {}, { startDir: 3 }),
      path([[2, 5], [4, 5], [4, 6], [6, 6], [6, 5]], {}, { endDir: 0 }),
      [wall(3, 3), wall(3, 4)],
    ),
  },
  {
    name: '聚合分岔', chapter: hard, chapterNo: 9, cols: 7, rows: 7,
    emitters: [port('W', 1), port('S', 2)], targets: [port('S', 1), port('E', 3), port('N', 5)], shots: 3,
    hint: '聚合后的光还可以再次分流。', targetClicks: 8, minControls: 6,
    solution: merge(
      [sp(1, 1, 0), comb(3, 3, 0), sp(5, 3, 1)],
      path([[1, 1], [4, 1], [4, 2], [3, 2], [3, 3]]),
      path([[2, 6], [2, 3], [3, 3]], {}, { startDir: 3 }),
      path([[5, 3], [5, 0]]),
      [wall(0, 4), wall(4, 4)],
    ),
  },
  {
    name: '双核接力', chapter: hard, chapterNo: 9, cols: 8, rows: 7,
    emitters: [port('W', 0), port('W', 3), port('S', 6)], targets: [port('E', 5)], shots: 3,
    hint: '第一座核心的终点，也是第二座核心的起点。', targetClicks: 8, minControls: 6,
    solution: merge(
      [comb(2, 2, 0), comb(6, 5, 0)],
      path([[0, 0], [2, 0], [2, 2]]),
      path([[0, 3], [1, 3], [1, 2], [2, 2]]),
      path([[2, 2], [5, 2], [5, 5], [6, 5]]),
      path([[6, 6], [6, 5]], {}, { startDir: 3 }),
      [wall(3, 3), wall(4, 3), wall(7, 2)],
    ),
  },
  {
    name: '门后晶体', chapter: hard, chapterNo: 9, cols: 7, rows: 7,
    emitters: [port('W', 1), port('W', 5)], targets: [], shots: 3,
    hint: '一束负责开门，两束要从不同方向抵达晶体。', targetClicks: 8, minControls: 6,
    solution: merge(
      [sp(2, 1, 0), sw(2, 4, 'A'), door(2, 6, 'D', ['A']), portal(3, 5, 'P1'), portal(5, 4, 'P1'), focus(4, 3)],
      path([[2, 1], [3, 1], [3, 0], [4, 0], [4, 3]]),
      path([[0, 5], [1, 5], [1, 6], [3, 6], [3, 5]], {}, { startDir: 0 }),
      path([[5, 3], [4, 3]], {}, { startDir: 3 }),
      [wall(0, 3), wall(6, 6)],
    ),
  },
  {
    name: '三源取舍', chapter: hard, chapterNo: 9, cols: 8, rows: 7,
    emitters: [port('W', 1), port('S', 2), port('N', 6)], targets: [port('E', 4)], shots: 3,
    hint: '聚合输出还有两份工作，第三束光只负责晶体。', targetClicks: 8, minControls: 6,
    solution: merge(
      [comb(3, 4, 0), sp(5, 4, 1), focus(5, 2)],
      path([[0, 1], [2, 1], [2, 4], [3, 4]], {}, { startDir: 0 }),
      path([[2, 6], [4, 6], [4, 5], [3, 5], [3, 4]], {}, { startDir: 3 }),
      path([[6, 0], [6, 1], [7, 1], [7, 2], [5, 2]], {}, { startDir: 1 }),
      [wall(1, 3), wall(6, 5)],
    ),
  },
  {
    name: '回廊互锁', chapter: hard, chapterNo: 9, cols: 8, rows: 7,
    emitters: [port('W', 1), port('W', 5)], targets: [port('E', 1), port('E', 5)], shots: 3,
    hint: '两条回廊各自保管着对方的钥匙。', targetClicks: 9, minControls: 7,
    solution: merge(
      [sp(2, 1, 0), sp(5, 5, 1), sw(2, 4, 'A'), sw(5, 2, 'B'), door(6, 0, 'DB', ['B']), door(6, 5, 'DA', ['A'])],
      path([[2, 1], [3, 1], [3, 0], [7, 0], [7, 1]], {}, { endDir: 0 }),
      path([[0, 5], [1, 5], [1, 6], [5, 6], [5, 5]], {}, { startDir: 0 }),
      [wall(0, 3), wall(7, 3)],
    ),
  },
  {
    name: '双跃聚能', chapter: hard, chapterNo: 9, cols: 8, rows: 7,
    emitters: [port('W', 1), port('W', 5), port('S', 6)], targets: [port('E', 3), port('S', 5), port('N', 6)], shots: 3,
    hint: '两次跃迁在中心会合，第三束走最远的外圈。', targetClicks: 9, minControls: 7,
    solution: merge(
      [portal(2, 1, 'P1'), portal(3, 2, 'P1'), portal(2, 5, 'P2'), portal(3, 4, 'P2'), comb(3, 3, 0), sp(5, 3, 0)],
      path([[0, 1], [1, 1], [1, 0], [2, 0], [2, 1]], {}, { startDir: 0 }),
      path([[0, 5], [1, 5], [1, 6], [2, 6], [2, 5]], {}, { startDir: 0 }),
      path([[6, 6], [7, 6], [7, 0], [6, 0]], {}, { startDir: 3, endDir: 3 }),
      [wall(0, 3), wall(6, 2)],
    ),
  },
  {
    name: '机关交响', chapter: hard, chapterNo: 9, cols: 8, rows: 8,
    emitters: [port('W', 1), port('W', 6), port('E', 1)], targets: [port('E', 4)], shots: 3,
    hint: '开门、跃迁和聚合只是同一条旋律的不同小节。', targetClicks: 9, minControls: 6,
    solution: merge(
      [sp(1, 1, 0), sw(1, 4, 'A'), portal(3, 1, 'P1'), portal(3, 3, 'P1'), comb(4, 4, 0), door(5, 4, 'D', ['A']), sp(6, 4, 1), focus(6, 2)],
      path([[3, 3], [4, 3], [4, 4]]),
      path([[0, 6], [2, 6], [2, 4], [4, 4]], {}, { startDir: 0 }),
      path([[7, 1], [7, 2], [6, 2]], {}, { startDir: 2 }),
      [wall(0, 3), wall(7, 6)],
    ),
  },
];

function expertVariant(baseIndex: number, name: string, targetClicks: number, overrides: Partial<AdvancedSpec> = {}): AdvancedSpec {
  const base = specs[baseIndex];
  return {
    ...base,
    ...overrides,
    name,
    chapter: expert,
    chapterNo: 10,
    cols: overrides.cols ?? 8,
    rows: overrides.rows ?? 8,
    targetClicks,
    minControls: overrides.minControls ?? 8,
    emitters: overrides.emitters ?? base.emitters.map(entry => ({ ...entry })),
    targets: overrides.targets ?? base.targets.map(entry => ({ ...entry })),
    solution: overrides.solution ?? base.solution.map(item => ({ ...item })) as LevelItem[],
  };
}

const mirrorBase = specs[1];
specs.push(expertVariant(1, '镜像陷阱', 10, {
  hint: '外观可以对称，机关的责任却不对称。',
  solution: merge(
    mirrorBase.solution,
    [sw(2, 1, 'A'), door(5, 0, 'D', ['A'])],
  ),
}));

const interlockBase = specs[7];
specs.push(expertVariant(7, '双门互锁', 11, {
  hint: '共享开关之外，第三束光还要穿过两条回廊。',
  emitters: [...interlockBase.emitters, port('N', 0)],
  targets: [...interlockBase.targets, port('S', 7)],
  solution: merge(
    interlockBase.solution.filter(item => !(item.type === 'wall' && item.x === 7 && item.y === 3)),
    path([[0, 0], [0, 2], [7, 2], [7, 7]], {}, { startDir: 1, endDir: 1 }),
  ),
}));

specs.push({
  name: '三束汇核', chapter: expert, chapterNo: 10, cols: 8, rows: 8,
  emitters: [port('W', 1), port('W', 6), port('S', 0)], targets: [port('E', 4), port('S', 6), port('N', 7), port('E', 6), port('W', 2), port('N', 1)], shots: 3,
  hint: '三条输入缺一不可，聚合输出仍要一分为二。', targetClicks: 12, minControls: 8,
  solution: merge(
    [sp(1, 1, 1), comb(4, 4, 0, 3), sp(6, 4, 0), sp(7, 4, 1), sp(7, 2, 0), sp(6, 6, 0)],
    path([[0, 1], [3, 1], [3, 3], [4, 3], [4, 4]], {}, { startDir: 0 }),
    path([[0, 6], [2, 6], [2, 5], [4, 5], [4, 4]], {}, { startDir: 0 }),
    path([[0, 7], [0, 5], [1, 5], [1, 4], [4, 4]], {}, { startDir: 3 }),
    [wall(0, 3), wall(7, 7)],
  ),
});

specs.push({
  name: '串联跃迁', chapter: expert, chapterNo: 10, cols: 8, rows: 8,
  emitters: [port('W', 0), port('W', 3), port('S', 7)], targets: [port('E', 5)], shots: 3,
  hint: '第一座核心的输出必须跃迁后才能加入第二座核心。', targetClicks: 12, minControls: 8,
  solution: merge(
    [comb(2, 2, 0), portal(4, 2, 'P1'), portal(5, 4, 'P1'), comb(6, 5, 0)],
    path([[0, 0], [2, 0], [2, 2]], {}, { startDir: 0 }),
    path([[0, 3], [1, 3], [1, 2], [2, 2]], {}, { startDir: 0 }),
    path([[5, 4], [6, 4], [6, 5]], {}, { startDir: 0 }),
    path([[7, 7], [7, 6], [6, 6], [6, 5]], {}, { startDir: 3 }),
    [wall(3, 5), wall(7, 2)],
  ),
});

specs.push({
  name: '双核双晶', chapter: expert, chapterNo: 10, cols: 8, rows: 8,
  emitters: [port('W', 1), port('S', 2), port('E', 6), port('N', 5)], targets: [], shots: 3,
  hint: '两座核心各管一颗晶体，另外两条支路交叉补能。', targetClicks: 12, minControls: 8,
  solution: merge(
    [sp(1, 1, 0), comb(2, 3, 0), focus(4, 3), sp(6, 6, 0), comb(5, 4, 2), focus(4, 4)],
    path([[1, 1], [2, 1], [2, 3]]),
    path([[1, 2], [1, 4], [4, 4]], {}, { startDir: 1 }),
    path([[6, 6], [5, 6], [5, 4]]),
    path([[6, 5], [6, 3], [4, 3]], {}, { startDir: 3 }),
    [wall(3, 1), wall(4, 6)],
  ),
});

const dualCoreBase = specs[14];
specs.push({
  ...dualCoreBase,
  name: '四源矩阵', chapter: expert, chapterNo: 10,
  emitters: dualCoreBase.emitters.map(entry => entry.side === 'N' && entry.index === 5 ? port('N', 7) : { ...entry }),
  targets: [port('N', 3), port('N', 5)],
  hint: '四个方向共享中心镜阵，两颗晶体之外还有两条分光出口。',
  targetClicks: 11,
  solution: merge(
    dualCoreBase.solution.filter(item => !(item.type === 'wall' && item.x === 3 && item.y === 1)),
    [sp(3, 4, 1), sp(5, 3, 0)],
    path([[7, 0], [7, 4], [5, 4]], {}, { startDir: 1 }),
  ),
});

specs.push({
  name: '三门认证', chapter: expert, chapterNo: 10, cols: 8, rows: 8,
  emitters: [port('W', 1), port('W', 4), port('S', 4)], targets: [port('E', 1), port('E', 4), port('N', 4)], shots: 3,
  hint: 'A+B 与 B+C 是两套认证，共享的 B 不能断。', targetClicks: 12, minControls: 8,
  solution: merge(
    [sw(1, 1, 'A'), door(4, 0, 'D2', ['B', 'C']), portal(3, 0, 'P1'), portal(6, 0, 'P1'), sw(1, 5, 'B'), door(5, 6, 'D1', ['A', 'B']), sw(3, 3, 'C')],
    path([[0, 1], [2, 1], [2, 0], [7, 0], [7, 1]], {}, { startDir: 0, endDir: 0 }),
    path([[0, 4], [1, 4], [1, 6], [7, 6], [7, 4]], {}, { startDir: 0, endDir: 0 }),
    path([[4, 7], [3, 7], [3, 2], [4, 2], [4, 0]], {}, { startDir: 3, endDir: 3 }),
    [wall(2, 5), wall(6, 3)],
  ),
});

const symphonyBase = specs[9];
const doubleSplitSpec = expertVariant(9, '双分光回路', 10, {
  hint: '两级分光分别承担开门、终点与晶体充能。',
  targets: [...symphonyBase.targets, port('W', 5)],
  solution: merge(
    symphonyBase.solution,
    [portal(1, 2, 'P2'), portal(1, 3, 'P2'), sp(1, 5, 1)],
  ),
});
specs.push(doubleSplitSpec);

specs.push(expertVariant(9, '光域迷城', 11, {
  rows: 9,
  hint: '两组跃迁与两套门锁把同一条主路拆成三层。',
  targets: [...symphonyBase.targets, port('W', 5)],
  emitters: symphonyBase.emitters.map(entry => ({ ...entry })),
  solution: merge(
    symphonyBase.solution.filter(item => !(item.type === 'mirror' && item.x === 2 && item.y === 4)),
    [portal(1, 2, 'P2'), portal(1, 3, 'P2'), sp(1, 5, 1), sw(1, 6, 'B'), portal(2, 5, 'P3'), portal(3, 5, 'P3'), m(3, 4, 1), door(7, 4, 'D2', ['A', 'B'])],
  ),
}));

specs.push({
  name: '终极光域', chapter: expert, chapterNo: 10, cols: 8, rows: 9,
  emitters: [port('W', 1), port('W', 6), port('S', 4), port('E', 1)], targets: [port('E', 4), port('W', 5)], shots: 3,
  hint: '四束光各有职责：三束汇核，最后一束把晶体补满。', targetClicks: 14, minControls: 8,
  solution: merge(
    [sp(1, 1, 0), portal(3, 1, 'P1'), portal(3, 3, 'P1'), sw(1, 4, 'A'), sp(1, 5, 1), comb(4, 4, 0, 3), sp(5, 4, 1), door(6, 4, 'D', ['A']), focus(6, 2, 3), sp(7, 2, 1)],
    path([[3, 3], [4, 3], [4, 4]]),
    path([[0, 6], [2, 6], [2, 4], [4, 4]], {}, { startDir: 0 }),
    path([[4, 8], [4, 4]], {}, { startDir: 3 }),
    path([[7, 1], [7, 2]], {}, { startDir: 2, endDir: 1 }),
    path([[7, 3], [6, 3], [6, 2]], {}, { startDir: 1 }),
    path([[5, 4], [5, 2], [6, 2]]),
    [wall(0, 3), wall(7, 6)],
  ),
});

export function buildAdvancedLevels(): LevelDefinition[] {
  return specs.map(finalize);
}
