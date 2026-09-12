import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import originals from './fixtures/campaign-130.json';
import { CHAPTER_NAMES } from '../src/levels/chapters';
import type { LevelDefinition } from '../src/gameplay/types';
import { forge } from './puzzle-foundry';
import { flowPlan,flowRecipes } from './flow-recipes';
import { designBoss } from './time-boss-designs';

const baseline=originals as LevelDefinition[];
const path='src/levels/flow-levels.json';
const additions:LevelDefinition[]=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];
const write=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data,null,2)+'\n');
for(const {id,recipe}of flowRecipes){
  const existing=additions.find(l=>l.stageKey===`flow:${id}`);
  if(existing){existing.name=recipe.name;existing.hint=recipe.hint;continue;}
  const board=forge(recipe,[...baseline,...additions]);
  board.stageKey=`flow:${id}`;board.mode='campaign';
  additions.push(board);write(path,additions);
}
additions.sort((a,b)=>Number(a.stageKey!.slice(5))-Number(b.stageKey!.slice(5)));write(path,additions);
if(process.argv.includes('--generate-only'))process.exit(0);
// Installation is explicit so a resumed design run cannot replace GM edits.
if(!process.argv.includes('--install'))throw new Error('Designs saved. Use --install to assemble the reviewed 200-level campaign.');
const levels=flowPlan.map((entry,index)=>{
  const chapterNo=Math.floor(index/10)+1;
  const board='old'in entry?{...baseline[entry.old-1],stageKey:`level:${entry.old}`}:
    additions.find(l=>l.stageKey===`flow:${entry.flow}`)!;
  return {...board,chapterNo,chapter:CHAPTER_NAMES[chapterNo-1]};
});
const bosses=CHAPTER_NAMES.map((_,index)=>designBoss((index+1)*10,levels[index*10+9]).level);
write('src/levels/levels.json',levels);write('src/levels/time-bosses.json',bosses);
write('src/levels/expansion.json',levels.slice(50));
write('docs/campaign-order.json',levels.map((level,index)=>({number:index+1,id:level.stageKey,name:level.name})));
console.log(`Installed ${levels.length} main levels (${additions.length} new) and ${bosses.length} chapter challenges.`);
