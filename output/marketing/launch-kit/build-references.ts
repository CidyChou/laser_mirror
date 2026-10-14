import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { LaserSimulator } from '../../../src/gameplay/LaserSimulator';
import type { LevelDefinition, LevelItem } from '../../../src/gameplay/types';

const levels = JSON.parse(readFileSync('src/levels/levels.json', 'utf8')) as LevelDefinition[];
const simulator = new LaserSimulator();
mkdirSync('output/marketing/launch-kit/references', { recursive: true });
for (const number of [1, 3, 54]) {
  const level = levels[number - 1];
  const g = { cell: 100, ox: 140, oy: 140, boardW: level.cols * 100, boardH: level.rows * 100, wall: 20 };
  const knobs = level.items.map((item, index) => ({ item, index })).filter(({ item }) => item.type === 'mirror' && !item.fixed && !item.decoy);
  let solution: LevelItem[] | undefined;
  let solvedTrace: ReturnType<LaserSimulator['simulate']> | undefined;
  for (let code = 0; code < 2 ** knobs.length; code++) {
    const items = level.items.map(item => ({ ...item })) as LevelItem[];
    knobs.forEach(({ index }, k) => { const item = items[index]; if (item.type === 'mirror') item.s = ((code >> k) & 1) as 0 | 1; });
    const trace = simulator.simulate(level, items, g);
    if (trace.hits.length && trace.hits.every(Boolean) && Object.values(trace.focusOn).every(Boolean)) { solution = items; solvedTrace = trace; break; }
  }
  if (!solution || !solvedTrace) throw new Error(`No solution for ${number}`);
  const record = { number, level: { ...level, items: solution }, geometry: g, trace: { ...solvedTrace, switches: [...solvedTrace.switches] }, orientation: { '0': '\\', '1': '/' } };
  writeFileSync(`output/marketing/launch-kit/references/level-${number}.json`, JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ number, name: level.name, hits: solvedTrace.hits, items: solution, interactions: solvedTrace.impactEvents.map(e => ({ type: e.type, x: e.x, y: e.y, in: e.incomingDir, out: e.outgoingDirs, toX: e.toX, toY: e.toY })) }));
}
