import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { LevelDefinition } from '../src/gameplay/types';
import { forge } from './puzzle-foundry';
import { newRecipes } from './campaign-recipes';

const path='src/levels/challenge.json';
const prefix=(JSON.parse(readFileSync('src/levels/levels.json','utf8')) as LevelDefinition[]).slice(0,100);
const output:LevelDefinition[]=process.argv.includes('--resume')&&existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];
const limit=Number(process.argv.find(arg=>arg.startsWith('--through='))?.split('=')[1]??130);
const replace=new Set((process.argv.find(arg=>arg.startsWith('--replace='))?.split('=')[1]??'').split(',').map(Number));
for(const recipe of newRecipes){
  if(recipe.number>limit)break;
  if(output[recipe.number-101]?.name===recipe.name&&!replace.has(recipe.number))continue;
  const level=forge(recipe,[...prefix,...output.filter((_,index)=>index!==recipe.number-101)]);
  output[recipe.number-101]=level;
  writeFileSync(path,JSON.stringify(output,null,2)+'\n');
}
console.log(`Saved ${output.length} independently generated challenge boards.`);
