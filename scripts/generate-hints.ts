import { writeFile } from 'node:fs/promises';
import { LevelRepository } from '../src/levels/LevelRepository';
import { stageId } from '../src/levels/campaign';
import { controlValue, hintSignature, type HintSolution } from '../src/gameplay/hints';
import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { itemKey } from '../src/gameplay/levelAccess';
import type { Direction, Orientation } from '../src/gameplay/types';

const simulator = new LaserSimulator();
const hints: Record<string, HintSolution> = {};
for (const [index, level] of new LevelRepository().levels.entries()) {
  if (level.timeBoss) continue;
  const controls = level.items.filter(item => ['mirror', 'splitter', 'combiner'].includes(item.type));
  const count = controls.reduce((total, item) => total * (item.type === 'combiner' ? 4 : 2), 1);
  const items = level.items.map(item => ({ ...item }));
  const rotating = items.filter(item => ['mirror', 'splitter', 'combiner'].includes(item.type));
  const geometry = computeGeometry(level);
  let found = false;
  for (let code = 0; code < count; code++) {
    let rest = code;
    for (const item of rotating) {
      const size = item.type === 'combiner' ? 4 : 2;
      const value = rest % size;
      rest = Math.floor(rest / size);
      if (item.type === 'combiner') item.dir = value as Direction;
      if (item.type === 'mirror' || item.type === 'splitter') item.s = value as Orientation;
    }
    const trace = simulator.simulate(level, items, geometry);
    if (!trace.hits.every(Boolean) || items.some(item => item.type === 'focus' && !trace.focusOn[itemKey(item.x, item.y)])) continue;
    const activeCells = new Set(trace.impactEvents.filter(event => event.x !== undefined && event.y !== undefined)
      .map(event => itemKey(event.x!, event.y!)));
    hints[stageId(level, index)] = { signature: hintSignature(level),
      controls: rotating.filter(item => activeCells.has(itemKey(item.x, item.y)))
        .map(item => ({ x: item.x, y: item.y, value: controlValue(item) })) };
    found = true;
    break;
  }
  if (!found) throw new Error(`No hint solution for ${stageId(level, index)}`);
}
await writeFile('src/levels/hints.json', JSON.stringify(hints) + '\n');
console.log(`Generated ${Object.keys(hints).length} verified puzzle hints.`);
