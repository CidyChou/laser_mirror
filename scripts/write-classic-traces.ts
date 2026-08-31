import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import classic from '../src/levels/classic.json';
import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import type { LevelDefinition, LevelItem } from '../src/gameplay/types';

const simulator = new LaserSimulator();
const traces = (classic as LevelDefinition[]).map((level, index) => {
  const trace = simulator.simulate(level, level.items as LevelItem[], computeGeometry(level));
  return {
    n: index + 1,
    hits: trace.hits,
    switches: [...trace.switches].sort(),
    exits: trace.exits.map(exit => `${exit.side}${exit.index}`),
    doors: trace.doorStates,
  };
});
const out = fileURLToPath(new URL('../src/levels/classic-traces.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(traces, null, 2)}\n`);
console.log('wrote', out);
