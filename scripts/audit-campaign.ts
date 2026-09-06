import { readFileSync,writeFileSync } from 'node:fs';
import { inspectLevel,layoutSimilarity } from './level-quality';
import type { LevelDefinition } from '../src/gameplay/types';

const args=process.argv.slice(2),source=args[0]??'src/levels/levels.json',out=args[1]??'docs/level-audit.json';
const levels=JSON.parse(readFileSync(source,'utf8')) as LevelDefinition[];
const report=levels.map((level,index)=>{
  const {best,states,controlIndexes,freeIndexes,liveIndexes,...metrics}=inspectLevel(level);
  const similar=levels.flatMap((other,j)=>j===index?[]:[{number:j+1,similarity:layoutSimilarity(level,other)}]).sort((a,b)=>b.similarity-a.similarity)[0];
  const row={number:index+1,...metrics,mostSimilar:similar};
  console.log(`#${index+1} ${level.name}: clicks=${metrics.minClicks} live=${metrics.live} keep=${metrics.correctLive} decoys=${metrics.decoys}/${metrics.temptingDecoys} sol=${metrics.solutions} flip=${metrics.allFlipWins||metrics.mirrorFlipWins} similar=#${similar.number}/${similar.similarity.toFixed(2)}`);
  return row;
});
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
