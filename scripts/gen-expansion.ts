import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import classic from '../src/levels/classic.json';
import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { itemKey } from '../src/gameplay/levelAccess';
import type { Direction, LevelDefinition, LevelItem, Orientation, Port } from '../src/gameplay/types';
import { buildAdvancedLevels } from './advanced-levels';

const simulator = new LaserSimulator();
type Extra = { fixed?: true; decoy?: true };
type XY = [number, number];

const m = (x: number, y: number, s: Orientation, extra: Extra = {}): LevelItem => ({ type: 'mirror', x, y, s, ...extra });
const sp = (x: number, y: number, s: Orientation, extra: Extra = {}): LevelItem => ({ type: 'splitter', x, y, s, ...extra });
const wall = (x: number, y: number): LevelItem => ({ type: 'wall', x, y });
const focus = (x: number, y: number, need = 2): LevelItem => ({ type: 'focus', x, y, need });
const comb = (x: number, y: number, dir: Direction, extra: Extra = {}): LevelItem => ({ type: 'combiner', x, y, dir, ...extra });
const sw = (x: number, y: number, id: string): LevelItem => ({ type: 'switch', x, y, id });
const door = (x: number, y: number, id: string, requires: string[]): LevelItem => ({ type: 'door', x, y, id, requires });
const portal = (x: number, y: number, pair: string): LevelItem => ({ type: 'portal', x, y, pair });
const port = (side: Port['side'], index: number): Port => ({ side, index });

function dirOf(x0: number, y0: number, x1: number, y1: number): Direction {
  if (x1 > x0 && y1 === y0) return 0;
  if (y1 > y0 && x1 === x0) return 1;
  if (x1 < x0 && y1 === y0) return 2;
  if (y1 < y0 && x1 === x0) return 3;
  throw new Error(`not orthogonal ${x0},${y0} -> ${x1},${y1}`);
}

function mirrorS(incoming: Direction, outgoing: Direction): Orientation {
  if (([1, 0, 3, 2] as Direction[])[incoming] === outgoing) return 0;
  if (([3, 2, 1, 0] as Direction[])[incoming] === outgoing) return 1;
  throw new Error(`no mirror ${incoming}->${outgoing}`);
}

function expand(points: XY[]): XY[] {
  const out: XY[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    let [x, y] = out[out.length - 1];
    const [tx, ty] = points[i];
    while (x !== tx || y !== ty) {
      if (x !== tx && y !== ty) throw new Error(`diagonal ${x},${y} -> ${tx},${ty}`);
      if (x < tx) x += 1; else if (x > tx) x -= 1;
      else if (y < ty) y += 1; else y -= 1;
      out.push([x, y]);
    }
  }
  return out;
}

function mirrorsOn(points: XY[], extra: Extra = {}, opts?: { startDir?: Direction; endDir?: Direction }): LevelItem[] {
  const cells = expand(points);
  const items: LevelItem[] = [];
  if (opts?.startDir !== undefined && cells.length >= 2) {
    const dOut = dirOf(cells[0][0], cells[0][1], cells[1][0], cells[1][1]);
    if (opts.startDir !== dOut) items.push(m(cells[0][0], cells[0][1], mirrorS(opts.startDir, dOut), extra));
  }
  for (let i = 1; i < cells.length - 1; i++) {
    const [x0, y0] = cells[i - 1];
    const [x1, y1] = cells[i];
    const [x2, y2] = cells[i + 1];
    const dIn = dirOf(x0, y0, x1, y1);
    const dOut = dirOf(x1, y1, x2, y2);
    if (dIn === dOut) continue;
    items.push(m(x1, y1, mirrorS(dIn, dOut), extra));
  }
  if (opts?.endDir !== undefined && cells.length >= 2) {
    const last = cells[cells.length - 1];
    const prev = cells[cells.length - 2];
    const dIn = dirOf(prev[0], prev[1], last[0], last[1]);
    if (dIn !== opts.endDir) items.push(m(last[0], last[1], mirrorS(dIn, opts.endDir), extra));
  }
  return items;
}

function mergeItems(parts: LevelItem[][]): LevelItem[] {
  const byCell = new Map<string, LevelItem>();
  for (const part of parts) {
    for (const item of part) {
      const key = `${item.x},${item.y}`;
      const prev = byCell.get(key);
      if (!prev) { byCell.set(key, item); continue; }
      if (JSON.stringify(prev) === JSON.stringify(item)) continue;
      if (prev.type === item.type && (item.type === 'mirror' || item.type === 'splitter') && prev.type === item.type) {
        const a = prev as Extract<LevelItem, { s: Orientation }>;
        const b = item as Extract<LevelItem, { s: Orientation }>;
        if (a.s !== b.s) throw new Error(`orientation conflict at ${key}`);
        continue;
      }
      throw new Error(`cell conflict at ${key}: ${prev.type} vs ${item.type}`);
    }
  }
  return [...byCell.values()];
}

type Spec = {
  name: string;
  chapter: string;
  chapterNo: number;
  cols: number;
  rows: number;
  emitters: Port[];
  targets: Port[];
  items: LevelItem[];
  hint: string;
  shots?: number;
};

function toLevel(spec: Spec, items: LevelItem[]): LevelDefinition {
  return {
    name: spec.name,
    chapter: spec.chapter,
    chapterNo: spec.chapterNo,
    rows: spec.rows,
    cols: spec.cols,
    emitter: spec.emitters[0],
    emitters: spec.emitters.length > 1 ? spec.emitters : undefined,
    targets: spec.targets,
    items,
    hint: spec.hint,
    shots: spec.shots ?? 3,
  };
}

function solved(level: LevelDefinition, items: LevelItem[]): boolean {
  const trace = simulator.simulate(level, items, computeGeometry(level));
  if (!trace.hits.every(Boolean)) return false;
  return items.every(item => item.type !== 'focus' || !!trace.focusOn[itemKey(item.x, item.y)]);
}

function scrambleFrom(solution: LevelItem[]): LevelItem[] {
  return solution.map(item => {
    if ((item.type === 'mirror' || item.type === 'splitter') && !item.fixed && !item.decoy) {
      return { ...item, s: (item.s ^ 1) as Orientation };
    }
    if (item.type === 'combiner' && !item.fixed) {
      return { ...item, dir: ((item.dir + 1) % 4) as Direction };
    }
    return { ...item };
  }) as LevelItem[];
}

function spec(partial: Omit<Spec, 'items'> & { items: LevelItem[] }): Spec {
  return partial;
}

const ch6 = '双源激光';
const ch7 = '双束终点';
const ch8 = '聚合核心';

const specs: Spec[] = [
  spec({
    name: '双源绕墙', chapter: ch6, chapterNo: 6, cols: 6, rows: 6,
    emitters: [port('W', 1), port('W', 4)],
    targets: [port('E', 1), port('E', 4)],
    hint: '两束光同时出发。中间的墙把直路封死，都得绕。',
    items: mergeItems([
      [wall(2, 1), wall(2, 4)],
      mirrorsOn([[0, 1], [1, 1], [1, 0], [4, 0], [4, 1], [5, 1]]),
      mirrorsOn([[0, 4], [1, 4], [1, 5], [4, 5], [4, 4], [5, 4]]),
      [m(5, 0, 0, { decoy: true }), m(0, 5, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '窄缝双路', chapter: ch6, chapterNo: 6, cols: 6, rows: 6,
    emitters: [port('W', 4), port('W', 0)],
    targets: [port('N', 3), port('E', 5)],
    hint: '墙把棋盘切成窄缝。一束要抬头出北口，一束要绕到底部。',
    items: mergeItems([
      [wall(2, 1), wall(2, 2), wall(2, 3), wall(2, 4)],
      mirrorsOn([[0, 4], [1, 4], [1, 5], [5, 5]]),
      [m(3, 0, 1)],
      [m(5, 1, 1, { decoy: true }), m(5, 2, 0, { decoy: true }), m(0, 3, 0, { decoy: true })],
    ]),
  }),
  spec({
    name: '交叉绕障', chapter: ch6, chapterNo: 6, cols: 6, rows: 6,
    emitters: [port('W', 2), port('S', 2)],
    targets: [port('N', 2), port('E', 2)],
    hint: '一束从西、一束从南。中心那面镜子要同时伺候两个方向。',
    items: mergeItems([
      [wall(3, 1), wall(3, 3), wall(1, 3)],
      mirrorsOn([[0, 2], [1, 2], [1, 1], [2, 1], [2, 0]]),
      mirrorsOn([[2, 5], [4, 5], [4, 2], [5, 2]], {}, { startDir: 3 }),
      [m(0, 0, 0, { decoy: true }), m(5, 5, 1, { decoy: true }), m(5, 0, 0, { fixed: true })],
    ]),
  }),
  spec({
    name: '迷宫双源', chapter: ch6, chapterNo: 6, cols: 6, rows: 6,
    emitters: [port('W', 5)],
    targets: [port('E', 1), port('E', 2)],
    hint: '墙切开中路。分光之后两条支路都要绕上去。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(2, 4), wall(5, 4)],
      [sp(1, 5, 1)],
      mirrorsOn([[0, 5], [1, 5], [4, 5], [4, 2], [5, 2]]),
      mirrorsOn([[1, 5], [1, 1], [5, 1]]),
      [m(0, 0, 0, { decoy: true }), m(4, 0, 0, { decoy: true })],
    ]),
  }),
  spec({
    name: '对向迷宫', chapter: ch6, chapterNo: 6, cols: 6, rows: 6,
    emitters: [port('W', 1), port('E', 4)],
    targets: [port('N', 4), port('S', 1)],
    hint: '左右对打。诱饵镜很显眼，真正的路在墙的另一侧。',
    items: mergeItems([
      [wall(2, 2), wall(2, 3), wall(3, 2)],
      mirrorsOn([[0, 1], [1, 1], [1, 0], [4, 0]], {}, { endDir: 3 }),
      mirrorsOn([[5, 4], [5, 5], [1, 5]], {}, { startDir: 2, endDir: 1 }),
      [m(5, 0, 1, { decoy: true }), m(0, 3, 0, { decoy: true }), m(2, 4, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '分流夹击', chapter: ch6, chapterNo: 6, cols: 7, rows: 6,
    emitters: [port('W', 5), port('W', 1)],
    targets: [port('E', 1), port('E', 4), port('N', 5)],
    hint: '三枚终点。下面那束要分光，上面那束走自己的窄路。',
    items: mergeItems([
      [wall(2, 1), wall(2, 2), wall(3, 3), wall(4, 3)],
      mirrorsOn([[0, 1], [1, 1], [1, 0], [4, 0], [4, 1], [6, 1]]),
      [sp(2, 5, 1)],
      mirrorsOn([[0, 5], [2, 5], [5, 5], [5, 0]]),
      mirrorsOn([[2, 5], [2, 4], [6, 4]]),
      [m(0, 3, 0, { decoy: true }), m(6, 2, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '锁镜双火', chapter: ch6, chapterNo: 6, cols: 6, rows: 6,
    emitters: [port('S', 0), port('W', 2)],
    targets: [port('S', 3), port('E', 2)],
    hint: '带锁的镜子已经定死一段路。不要被右边那两面诱饵带走。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(4, 3), wall(3, 2)],
      [m(0, 4, 1, { fixed: true })],
      mirrorsOn([[0, 5], [0, 4], [1, 4], [1, 5], [3, 5]], {}, { endDir: 1 }),
      mirrorsOn([[0, 2], [2, 2], [2, 1], [4, 1], [4, 2], [5, 2]]),
      [m(5, 0, 0, { decoy: true }), m(4, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '回廊双源', chapter: ch6, chapterNo: 6, cols: 7, rows: 7,
    emitters: [port('W', 6), port('N', 6)],
    targets: [port('E', 1), port('S', 3)],
    hint: '外圈是回廊，中心是死墙。两束光都要贴边走。',
    items: mergeItems([
      [wall(2, 2), wall(3, 2), wall(4, 2), wall(2, 3), wall(4, 3), wall(2, 4), wall(3, 4), wall(4, 4)],
      mirrorsOn([[0, 6], [1, 6], [1, 1], [6, 1]]),
      mirrorsOn([[6, 0], [6, 5], [3, 5], [3, 6]]),
      [m(0, 0, 0, { decoy: true }), m(3, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '三源迷宫', chapter: ch6, chapterNo: 6, cols: 7, rows: 6,
    emitters: [port('W', 1), port('W', 4), port('S', 2)],
    targets: [port('N', 1), port('E', 4), port('E', 2)],
    hint: '三束光、三枚终点。先接通最直的那条，再处理互相打架的两束。',
    items: mergeItems([
      [wall(2, 2), wall(3, 2), wall(3, 3)],
      mirrorsOn([[0, 1], [1, 1], [1, 0]]),
      mirrorsOn([[0, 4], [6, 4]]),
      mirrorsOn([[2, 5], [5, 5], [5, 2], [6, 2]], {}, { startDir: 3 }),
      [m(6, 0, 1, { decoy: true }), m(0, 5, 0, { decoy: true }), m(4, 0, 1, { fixed: true })],
    ]),
  }),
  spec({
    name: '双翼终章', chapter: ch6, chapterNo: 6, cols: 7, rows: 7,
    emitters: [port('W', 5), port('W', 0)],
    targets: [port('E', 1), port('E', 2), port('N', 5)],
    hint: '分光之后两条支路要分别绕过中心墙块。第三束光走外圈。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(3, 4), wall(5, 4)],
      [sp(1, 5, 1)],
      mirrorsOn([[0, 5], [1, 5], [4, 5], [4, 2], [6, 2]]),
      mirrorsOn([[1, 5], [1, 1], [6, 1]]),
      [m(5, 0, 1)],
      [m(6, 6, 0, { decoy: true }), m(3, 6, 1, { decoy: true })],
    ]),
  }),

  spec({
    name: '双束入门', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 1), port('S', 2)],
    targets: [port('E', 4)],
    hint: '金色菱形要从两个方向打中。墙面终点也要亮。',
    items: mergeItems([
      [wall(3, 2), wall(3, 3)],
      [focus(2, 4)],
      [sp(2, 1, 0)],
      mirrorsOn([[0, 1], [2, 1], [4, 1], [4, 4], [5, 4]]),
      mirrorsOn([[2, 1], [2, 4]]),
      mirrorsOn([[2, 5], [2, 4]]),
      [m(0, 0, 0, { decoy: true }), m(5, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '对面汇流', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 1), port('E', 4)],
    targets: [],
    hint: '左右两束都要绕过中墙，从南、北两面打进同一颗晶体。',
    items: mergeItems([
      [wall(2, 2), wall(2, 3), wall(4, 3)],
      [focus(3, 1)],
      mirrorsOn([[0, 1], [1, 1], [1, 0], [3, 0], [3, 1]]),
      mirrorsOn([[5, 4], [3, 4], [3, 1]]),
      [m(0, 5, 0, { decoy: true }), m(5, 0, 1, { decoy: true }), m(5, 5, 0, { decoy: true })],
    ]),
  }),
  spec({
    name: '分光充能', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 5), port('N', 3)],
    targets: [port('E', 5)],
    hint: '分光之后一路去墙面终点。另一路和北面那束一起给晶体充能。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(3, 4), wall(5, 2)],
      [focus(3, 1)],
      [sp(1, 5, 1)],
      mirrorsOn([[0, 5], [1, 5], [4, 5], [5, 5]]),
      mirrorsOn([[1, 5], [1, 1], [3, 1]]),
      mirrorsOn([[3, 0], [3, 1]]),
      [m(0, 0, 0, { decoy: true }), m(2, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '迷宫汇能', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 5), port('N', 1)],
    targets: [port('E', 2)],
    hint: '晶体藏在墙后。两束光要分别从两条走廊挤进去。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(2, 4)],
      [focus(3, 2)],
      [sp(1, 5, 1)],
      mirrorsOn([[0, 5], [1, 5], [4, 5], [4, 2], [5, 2]]),
      mirrorsOn([[1, 5], [1, 2], [3, 2]]),
      mirrorsOn([[1, 0], [1, 1], [3, 1], [3, 2]]),
      [m(5, 5, 1, { decoy: true }), m(0, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '窄路双束', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 4), port('S', 0)],
    targets: [port('N', 4)],
    hint: '竖墙把路挤得很窄。晶体和北侧终点都要亮。',
    items: mergeItems([
      [wall(2, 1), wall(2, 2), wall(2, 3)],
      [focus(4, 2)],
      [sp(1, 4, 1)],
      mirrorsOn([[0, 4], [1, 4], [3, 4], [3, 2], [4, 2]]),
      mirrorsOn([[1, 4], [1, 0], [4, 0]]),
      [m(4, 0, 1)],
      mirrorsOn([[0, 5], [4, 5], [4, 2]], {}, { startDir: 3 }),
      [m(5, 1, 1, { decoy: true }), m(5, 5, 0, { decoy: true })],
    ]),
  }),
  spec({
    name: '双晶迷宫', chapter: ch7, chapterNo: 7, cols: 7, rows: 6,
    emitters: [port('W', 1), port('S', 1), port('W', 4), port('E', 3)],
    targets: [],
    hint: '两颗晶体都要两面充能。别让其中一束误入另一颗。',
    items: mergeItems([
      [wall(3, 1), wall(3, 2), wall(3, 3)],
      [focus(1, 2), focus(5, 3)],
      mirrorsOn([[0, 1], [0, 0], [1, 0], [1, 2]], {}, { startDir: 0 }),
      mirrorsOn([[1, 5], [1, 2]]),
      mirrorsOn([[0, 4], [0, 5], [5, 5], [5, 3]], {}, { startDir: 0 }),
      mirrorsOn([[6, 3], [5, 3]]),
      [m(6, 5, 0, { decoy: true }), m(6, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '交叉充能', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 1), port('N', 4)],
    targets: [port('S', 1)],
    hint: '两束光在晶体处十字相交。转错一面就会把另一条路堵死。',
    items: mergeItems([
      [wall(3, 3), wall(2, 4)],
      [focus(3, 2)],
      [sp(1, 1, 0)],
      mirrorsOn([[0, 1], [1, 1], [3, 1], [3, 2]]),
      mirrorsOn([[1, 1], [1, 5]]),
      mirrorsOn([[4, 0], [4, 2], [3, 2]]),
      [m(0, 0, 1, { decoy: true }), m(5, 5, 0, { decoy: true })],
    ]),
  }),
  spec({
    name: '门后双束', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 1), port('W', 4)],
    targets: [],
    hint: '先用一束点亮开关，另一束穿过光门，两面一起打进晶体。',
    items: mergeItems([
      [wall(2, 2), wall(2, 3)],
      [focus(4, 2)],
      [sw(2, 0, 'A'), door(3, 4, 'D1', ['A'])],
      mirrorsOn([[0, 1], [0, 0], [3, 0], [3, 1], [4, 1], [4, 2]], {}, { startDir: 0 }),
      mirrorsOn([[0, 4], [4, 4], [4, 2]]),
      [m(5, 0, 0, { decoy: true }), m(5, 5, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '三向取二', chapter: ch7, chapterNo: 7, cols: 6, rows: 6,
    emitters: [port('W', 2), port('S', 2), port('N', 4)],
    targets: [port('E', 5)],
    hint: '三束光只有两束能进晶体。西面直路被墙封死，要另找入口。',
    items: mergeItems([
      [wall(1, 2), wall(3, 3)],
      [focus(2, 2)],
      mirrorsOn([[0, 2], [0, 0], [2, 0], [2, 2]], {}, { startDir: 0 }),
      mirrorsOn([[2, 5], [2, 2]]),
      mirrorsOn([[4, 0], [4, 5], [5, 5]]),
      [m(0, 5, 0, { decoy: true }), m(5, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '双核终阵', chapter: ch7, chapterNo: 7, cols: 7, rows: 7,
    emitters: [port('W', 1), port('S', 1), port('W', 5), port('E', 4)],
    targets: [],
    hint: '两颗晶体都要两面充能。中心墙块把走廊隔开。',
    items: mergeItems([
      [wall(2, 2), wall(3, 2), wall(4, 2), wall(2, 4), wall(3, 4), wall(4, 4)],
      [focus(1, 2), focus(5, 4)],
      mirrorsOn([[0, 1], [0, 0], [1, 0], [1, 2]], {}, { startDir: 0 }),
      mirrorsOn([[1, 6], [1, 2]]),
      mirrorsOn([[0, 5], [0, 6], [5, 6], [5, 4]], {}, { startDir: 0 }),
      mirrorsOn([[6, 4], [5, 4]]),
      [m(2, 0, 0, { decoy: true }), m(6, 6, 1, { decoy: true }), m(3, 0, 0, { decoy: true })],
    ]),
  }),

  spec({
    name: '聚合入门', chapter: ch8, chapterNo: 8, cols: 6, rows: 6,
    emitters: [port('W', 1), port('E', 5)],
    targets: [port('E', 4)],
    hint: '紫色聚合点要先吃到两束光，才会朝箭头射出。点按旋转箭头。',
    items: mergeItems([
      [wall(3, 1), wall(3, 2)],
      [comb(2, 4, 0)],
      mirrorsOn([[0, 1], [1, 1], [1, 4], [2, 4]]),
      mirrorsOn([[5, 5], [2, 5], [2, 4]]),
      mirrorsOn([[2, 4], [5, 4]]),
      [m(0, 0, 0, { decoy: true }), m(5, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '转向聚合', chapter: ch8, chapterNo: 8, cols: 6, rows: 6,
    emitters: [port('W', 0), port('W', 5)],
    targets: [port('E', 1)],
    hint: '两束光不在同一行，要先折进聚合点，再把输出对准东边。',
    items: mergeItems([
      [wall(2, 1), wall(2, 2), wall(3, 3)],
      [comb(4, 1, 0)],
      mirrorsOn([[0, 0], [4, 0], [4, 1]]),
      mirrorsOn([[0, 5], [4, 5], [4, 1]]),
      mirrorsOn([[4, 1], [5, 1]]),
      [m(0, 3, 1, { decoy: true }), m(5, 5, 0, { decoy: true })],
    ]),
  }),
  spec({
    name: '聚合迷宫', chapter: ch8, chapterNo: 8, cols: 6, rows: 6,
    emitters: [port('W', 5), port('N', 1)],
    targets: [port('E', 1), port('E', 2)],
    hint: '聚合之后还能再分光。先让聚合点亮起来，再处理菱形。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(2, 4), wall(5, 4)],
      [comb(1, 2, 0)],
      [sp(4, 2, 1)],
      mirrorsOn([[0, 5], [1, 5], [1, 2]]),
      mirrorsOn([[1, 0], [0, 0], [0, 2], [1, 2]]),
      mirrorsOn([[1, 2], [4, 2], [5, 2]]),
      mirrorsOn([[4, 2], [4, 1], [5, 1]]),
      [m(5, 5, 0, { decoy: true }), m(3, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '错位输入', chapter: ch8, chapterNo: 8, cols: 7, rows: 6,
    emitters: [port('W', 0), port('W', 5)],
    targets: [port('E', 2)],
    hint: '两束光分列上下。都要绕到聚合点两侧，输出再钻过中缝。',
    items: mergeItems([
      [wall(4, 1), wall(4, 3), wall(2, 2)],
      [comb(3, 2, 0)],
      mirrorsOn([[0, 0], [3, 0], [3, 2]]),
      mirrorsOn([[0, 5], [3, 5], [3, 2]]),
      mirrorsOn([[3, 2], [6, 2]]),
      [m(0, 3, 0, { decoy: true }), m(6, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '聚合开门', chapter: ch8, chapterNo: 8, cols: 6, rows: 6,
    emitters: [port('W', 0), port('W', 2)],
    targets: [port('E', 4)],
    hint: '聚合后的那一束去点开关。门开了，光才能到达终点。',
    items: mergeItems([
      [wall(2, 3), wall(3, 2)],
      [comb(1, 1, 1)],
      [sw(1, 3, 'A'), door(3, 4, 'D1', ['A'])],
      mirrorsOn([[0, 0], [1, 0], [1, 1]]),
      mirrorsOn([[0, 2], [2, 2], [2, 1], [1, 1]]),
      mirrorsOn([[1, 1], [1, 4], [5, 4]]),
      [m(5, 0, 0, { decoy: true }), m(5, 5, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '双核串联', chapter: ch8, chapterNo: 8, cols: 7, rows: 6,
    emitters: [port('W', 0), port('W', 2), port('S', 5)],
    targets: [port('E', 4)],
    hint: '第一座聚合点的输出，要成为第二座的输入之一。',
    items: mergeItems([
      [wall(2, 2), wall(3, 3), wall(4, 2)],
      [comb(1, 1, 0), comb(5, 4, 0)],
      mirrorsOn([[0, 0], [1, 0], [1, 1]]),
      mirrorsOn([[0, 2], [1, 2], [1, 1]]),
      mirrorsOn([[1, 1], [5, 1], [5, 4]]),
      mirrorsOn([[5, 5], [5, 4]]),
      mirrorsOn([[5, 4], [6, 4]]),
      [m(0, 4, 0, { decoy: true }), m(6, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '窄缝输出', chapter: ch8, chapterNo: 8, cols: 6, rows: 6,
    emitters: [port('W', 1), port('W', 4)],
    targets: [port('E', 2)],
    hint: '终点前只留一格缝。两束光必须先合成一束再穿过去。',
    items: mergeItems([
      [wall(4, 1), wall(4, 3), wall(4, 4)],
      [comb(2, 3, 0)],
      mirrorsOn([[0, 1], [2, 1], [2, 3]]),
      mirrorsOn([[0, 4], [2, 4], [2, 3]]),
      mirrorsOn([[2, 3], [3, 3], [3, 2], [5, 2]]),
      [m(0, 0, 0, { decoy: true }), m(5, 5, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '先聚再充', chapter: ch8, chapterNo: 8, cols: 6, rows: 6,
    emitters: [port('W', 0), port('W', 2), port('N', 4)],
    targets: [],
    hint: '北面那束先打中晶体。再把聚合输出转到东面，补上第二束。',
    items: mergeItems([
      [wall(2, 2), wall(3, 3)],
      [comb(1, 1, 0), focus(4, 1)],
      mirrorsOn([[0, 0], [1, 0], [1, 1]]),
      mirrorsOn([[0, 2], [1, 2], [1, 1]]),
      mirrorsOn([[1, 1], [4, 1]]),
      mirrorsOn([[4, 0], [4, 1]]),
      [m(5, 5, 0, { decoy: true }), m(5, 3, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '跃迁聚合', chapter: ch8, chapterNo: 8, cols: 7, rows: 6,
    emitters: [port('W', 3), port('S', 5)],
    targets: [port('E', 1)],
    hint: '一束光走传送，另一束走迷宫，在左上角聚合后射向终点。',
    items: mergeItems([
      [wall(2, 2), wall(3, 2), wall(3, 4)],
      [portal(5, 5, 'P1'), portal(1, 2, 'P1')],
      [comb(1, 1, 0)],
      mirrorsOn([[0, 3], [0, 0], [1, 0], [1, 1]], {}, { startDir: 0 }),
      mirrorsOn([[1, 1], [6, 1]]),
      [m(6, 5, 0, { decoy: true }), m(3, 0, 1, { decoy: true })],
    ]),
  }),
  spec({
    name: '双源终核', chapter: ch8, chapterNo: 8, cols: 7, rows: 7,
    emitters: [port('W', 5), port('S', 2), port('N', 5)],
    targets: [],
    hint: '聚合、双束晶体、迷宫墙三条线一起做。先让聚合点吃饱。',
    items: mergeItems([
      [wall(2, 3), wall(3, 3), wall(3, 4), wall(5, 2)],
      [comb(2, 5, 0), focus(4, 1)],
      mirrorsOn([[0, 5], [1, 5], [1, 4], [2, 4], [2, 5]]),
      mirrorsOn([[2, 6], [2, 5]]),
      mirrorsOn([[2, 5], [4, 5], [4, 1]]),
      mirrorsOn([[5, 0], [5, 1], [4, 1]]),
      [m(0, 0, 0, { decoy: true }), m(6, 6, 1, { decoy: true }), m(0, 6, 0, { decoy: true })],
    ]),
  }),
];

const out: LevelDefinition[] = [];
const errors: string[] = [];

specs.forEach((spec, index) => {
  const n = 51 + index;
  const solution = toLevel(spec, spec.items);
  if (!solved(solution, spec.items)) {
    const trace = simulator.simulate(solution, spec.items, computeGeometry(solution));
    errors.push(`#${n} ${spec.name} SOLUTION fails hits=${JSON.stringify(trace.hits)} exits=${JSON.stringify(trace.exits)} focus=${JSON.stringify(trace.focusOn)} comb=${JSON.stringify(trace.combinerOn)}`);
    return;
  }
  let startItems = scrambleFrom(spec.items);
  if (solved(toLevel(spec, startItems), startItems)) {
    startItems = scrambleFrom(startItems);
  }
  if (solved(toLevel(spec, startItems), startItems)) {
    errors.push(`#${n} ${spec.name} still solved after scramble`);
    return;
  }
  const rot = spec.items.filter(item =>
    ((item.type === 'mirror' || item.type === 'splitter') && !item.fixed && !item.decoy)
    || (item.type === 'combiner' && !item.fixed),
  ).length;
  console.log(`#${n} ${spec.name} ok core=${rot}`);
  out.push(toLevel(spec, startItems));
});

try {
  out.push(...buildAdvancedLevels());
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const path = fileURLToPath(new URL('../src/levels/expansion.json', import.meta.url));
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
const levelsPath = fileURLToPath(new URL('../src/levels/levels.json', import.meta.url));
const allLevels = [...(classic as LevelDefinition[]), ...out];
writeFileSync(levelsPath, `${JSON.stringify(allLevels, null, 2)}\n`);
console.log(`wrote ${out.length} expansion levels and ${allLevels.length} total levels`);
