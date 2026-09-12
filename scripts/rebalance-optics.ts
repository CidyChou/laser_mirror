import { readFileSync, writeFileSync } from 'node:fs';
import { forge } from './puzzle-foundry';
import { opticalRecipes } from './optical-recipes';
import { inspectLevel, valueOf } from './level-quality';
import type { LevelDefinition } from '../src/gameplay/types';

// Reviewed replacements are persisted so retries and future generation agree.
const read = (name:string) => JSON.parse(readFileSync(`src/levels/${name}.json`, 'utf8'));
const levels = read('levels') as LevelDefinition[];
if(levels.length!==130)throw new Error('Historical 130-level revision script. Edit the expanded campaign in GM instead.');
const revisions = read('revisions') as Record<string,LevelDefinition>;
const saved = process.argv.includes('--resume') ? JSON.parse(readFileSync('src/levels/optical-revisions.json','utf8')) as Record<string,LevelDefinition> : {};
for (const recipe of opticalRecipes) {
  const number=recipe.number;
  if (saved[number]) continue;
  const board=forge(recipe,[...levels.filter((_,i)=>i!==number-1),...Object.values(saved)]);
  board.chapter=levels[number-1].chapter;board.chapterNo=levels[number-1].chapterNo;
  saved[number]=board;
  writeFileSync('src/levels/optical-revisions.json',JSON.stringify(saved,null,2)+'\n');
}
for(const [number,board] of Object.entries(saved)){levels[Number(number)-1]=board;if(Number(number)<=100)revisions[number]=board;}
// The first chapter still peaks before its gentle dynamic tutorial.
if(!saved[10]){
  const board=levels[9],audit=inspectLevel(board);
  if(audit.best){
    let changed=0;
    board.items=structuredClone(audit.best);
    for(const i of audit.liveIndexes){const item=board.items[i];if(changed<4&&item.type==='mirror'){item.s=(1-valueOf(item)) as 0|1;changed++;}}
    revisions[10]=board;
  }
}
for(const [name,data] of Object.entries({levels,revisions,challenge:levels.slice(100),expansion:levels.slice(50)}))writeFileSync(`src/levels/${name}.json`,JSON.stringify(data,null,2)+'\n');
console.log(`Applied ${Object.keys(saved).length} optical revisions.`);
