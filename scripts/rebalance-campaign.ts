import { readFileSync, writeFileSync } from 'node:fs';
import type { LevelDefinition } from '../src/gameplay/types';
import { inspectLevel } from './level-quality';
import { scramble } from './puzzle-foundry';
import { newRecipes, repairRecipes } from './campaign-recipes';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const levels = read('src/levels/levels.json').slice(0, 100) as LevelDefinition[];
const revisions = read('src/levels/revisions.json') as Record<string, LevelDefinition>;
const handcrafted = read('src/levels/handcrafted.json') as Record<string, LevelDefinition>;
for (const recipe of repairRecipes) {
  if (revisions[recipe.number]) Object.assign(revisions[recipe.number], { name: recipe.name, hint: recipe.hint });
}
const tutorials = new Set([1, 2, 5, 11, 31, 41, 61, 71]);
for (let index = 0; index < levels.length; index++) {
  const number = index + 1;
  if (handcrafted[number]) { levels[index] = handcrafted[number]; continue; }
  if (revisions[number]) { levels[index] = revisions[number]; continue; }
  if (tutorials.has(number)) continue;
  const audit = inspectLevel(levels[index]);
  if (audit.live < 4 || (!audit.allFlipWins && !audit.mirrorFlipWins && audit.correctLive >= 2)) continue;
  levels[index] = scramble(levels[index], number * 130003, audit.live < 6 ? 2 : number < 51 ? 3 : 4);
  console.log(`Mixed start #${number}: ${audit.live} live controls`);
}
const challenges = read('src/levels/challenge.json') as LevelDefinition[];
for (const recipe of newRecipes) Object.assign(challenges[recipe.number - 101], { name: recipe.name, hint: recipe.hint });
const campaign = [...levels, ...challenges];
writeFileSync('src/levels/challenge.json', JSON.stringify(challenges, null, 2) + '\n');
writeFileSync('src/levels/revisions.json', JSON.stringify(revisions, null, 2) + '\n');
writeFileSync('src/levels/levels.json', JSON.stringify(campaign, null, 2) + '\n');
writeFileSync('src/levels/expansion.json', JSON.stringify(campaign.slice(50), null, 2) + '\n');
console.log(`Saved ${campaign.length} levels; handcrafted boards preserved.`);
