import { existsSync, readFileSync,writeFileSync } from 'node:fs';
import type { LevelDefinition } from '../src/gameplay/types';
import { forge } from './puzzle-foundry';
import { repairRecipes } from './campaign-recipes';

const original=JSON.parse(readFileSync('src/levels/levels.json','utf8')) as LevelDefinition[];
const challenges=JSON.parse(readFileSync('src/levels/challenge.json','utf8')) as LevelDefinition[];
const file='src/levels/revisions.json';
const repairs:Record<number,LevelDefinition>=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
for(const recipe of repairRecipes){
  if(repairs[recipe.number])continue;
  const old=original[recipe.number-1];
  const layout=forge(recipe,[...original.slice(0,100),...challenges,...Object.values(repairs)]);
  repairs[recipe.number]={...layout,chapter:old.chapter,chapterNo:old.chapterNo};
  writeFileSync(file,JSON.stringify(repairs,null,2)+'\n');
}
console.log(`Saved ${Object.keys(repairs).length} redesigned early boards.`);
