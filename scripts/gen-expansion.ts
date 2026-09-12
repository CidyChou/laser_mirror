import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { LevelDefinition } from '../src/gameplay/types';

// Assemble reviewed designs. Never rebuild the campaign from the historical
// classic archive, which would silently discard edits made in the GM.
const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/levels/${name}.json`, import.meta.url), 'utf8'));
const current = read('levels') as LevelDefinition[];
const handcrafted = read('handcrafted') as Record<string, LevelDefinition>;
const levels = current;
assert.equal(levels.length, 200,'Synchronize the current 200-level campaign; never truncate GM edits');
const boardOnly=({stageKey,chapter,chapterNo,...board}:LevelDefinition)=>board;
for (const [number, level] of Object.entries(handcrafted)) assert.deepEqual(boardOnly(levels.find(l=>l.stageKey===`level:${number}`)!), boardOnly(level));
for (const level of levels) assert(level.rows <= 8 && level.cols <= 8, `${level.name} exceeds 8 × 8`);
for (const [name, data] of [['levels', levels], ['expansion', levels.slice(50)]] as const) {
  writeFileSync(new URL(`../src/levels/${name}.json`, import.meta.url), JSON.stringify(data, null, 2) + '\n');
}
console.log('Synchronized 200 reviewed levels; preserved campaign order, stable identities and GM edits.');
