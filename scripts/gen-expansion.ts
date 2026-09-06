import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { LevelDefinition } from '../src/gameplay/types';

// Assemble reviewed designs. Never rebuild the campaign from the historical
// classic archive, which would silently discard edits made in the GM.
const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/levels/${name}.json`, import.meta.url), 'utf8'));
const current = read('levels') as LevelDefinition[];
const challenges = read('challenge') as LevelDefinition[];
const handcrafted = read('handcrafted') as Record<string, LevelDefinition>;
assert.equal(challenges.length, 30);
const levels = current.length === 130 ? current : [...current.slice(0, 100), ...challenges];
assert.equal(levels.length, 130);
for (const [number, level] of Object.entries(handcrafted)) assert.deepEqual(levels[Number(number) - 1], level);
for (const level of levels) assert(level.rows <= 8 && level.cols <= 8, `${level.name} exceeds 8 × 8`);
for (const [name, data] of [['levels', levels], ['expansion', levels.slice(50)]] as const) {
  writeFileSync(new URL(`../src/levels/${name}.json`, import.meta.url), JSON.stringify(data, null, 2) + '\n');
}
console.log('Assembled 130 reviewed levels; preserved current campaign edits.');
