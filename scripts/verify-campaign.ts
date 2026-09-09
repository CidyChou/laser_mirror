import assert from 'node:assert/strict';
import { LevelRepository } from '../src/levels/LevelRepository';
import {
  firstIncompleteLevel,
  loadCompletedLevels,
  loadCurrentLevel,
  saveCompletedLevels,
  saveCurrentLevel,
} from '../src/progression/levelProgress';
import type { IPlatform } from '../src/platform/IPlatform';

function memoryPlatform(seed:Record<string,string>={}):IPlatform{
  const data=new Map(Object.entries(seed));
  return {
    kind:'web',viewport:()=>({width:375,height:812,pixelRatio:1}),attachCanvas:()=>{},onResize:()=>()=>{},safeTop:()=>0,
    vibrate:()=>{},storage:{get:key=>data.get(key)??null,set:(key,value)=>{data.set(key,value);}},
    saveImageToAlbum:async()=>({ok:true,message:''}),
  };
}

const repo=new LevelRepository();
assert.equal(repo.normalLevels.length,130);
assert.equal(repo.timeBosses.length,13);
assert.equal(repo.levels.length,143);
assert(repo.normalLevels.every(level=>!level.timeBoss),'ordinary levels must remain classic');
assert(repo.timeBosses.every(level=>level.timeBoss),'every special stage needs time rules');

for(let chapter=1;chapter<=13;chapter+=1){
  const normalNumber=chapter*10;
  const bossIndex=normalNumber+chapter-1;
  assert.equal(repo.levels[bossIndex-1].campaign?.id,`level:${normalNumber}`);
  assert.equal(repo.levels[bossIndex].campaign?.id,`boss:${chapter}`);
  if(normalNumber<130)assert.equal(repo.levels[bossIndex+1].campaign?.id,`level:${normalNumber+1}`);
}

const fresh=memoryPlatform();
const freshCompleted=loadCompletedLevels(fresh,repo.levels);
assert.equal(firstIncompleteLevel(repo.levels.length,freshCompleted),0);
for(let index=0;index<10;index+=1)freshCompleted.add(index);
saveCompletedLevels(fresh,freshCompleted,repo.levels);
assert.equal(repo.levels[firstIncompleteLevel(repo.levels.length,freshCompleted)].campaign?.id,'boss:1');
freshCompleted.add(10);
assert.equal(repo.levels[firstIncompleteLevel(repo.levels.length,freshCompleted)].campaign?.id,'level:11');
saveCurrentLevel(fresh,10,repo.levels);
assert.equal(loadCurrentLevel(fresh,repo.levels,freshCompleted),10);

const legacy=memoryPlatform({
  'laser-mirror-completed-levels':JSON.stringify(Array.from({length:10},(_,index)=>index)),
  'laser-mirror-current-level':'10',
});
const migrated=loadCompletedLevels(legacy,repo.levels);
assert(migrated.has(9),'legacy level 10 completion was lost');
assert(migrated.has(10),'legacy progress should not be relocked by the new boss');
assert.equal(repo.levels[loadCurrentLevel(legacy,repo.levels,migrated)].campaign?.id,'level:11');

console.log('Campaign order OK: 130 original levels + 13 separate challenges; legacy progress migration OK.');
