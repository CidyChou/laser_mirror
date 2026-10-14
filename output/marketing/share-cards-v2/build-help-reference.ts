import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { LaserSimulator } from '../../../src/gameplay/LaserSimulator';

const data = JSON.parse(readFileSync('output/marketing/launch-kit/references/level-1.json', 'utf8'));
data.level.items[0].s = 0;
const trace = new LaserSimulator().simulate(data.level, data.level.items, data.geometry);
if (trace.hits.some(Boolean)) throw new Error('The help card must show an unfinished route');
data.trace = { ...trace, switches: [...trace.switches] };
mkdirSync('output/marketing/share-cards-v2/references', { recursive: true });
writeFileSync('output/marketing/share-cards-v2/references/level-1-unsolved.json', JSON.stringify(data, null, 2));
console.log(JSON.stringify({ mirror: '\\', exits: trace.exits, targetsHit: trace.hits }));
