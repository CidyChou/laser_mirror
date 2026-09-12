import assert from 'node:assert/strict';
import { LevelRepository } from '../src/levels/LevelRepository';
import {
  firstIncompleteLevel,
  loadCompletedLevels,
  loadCampaignAccess,
  isLevelUnlocked,
  clearLevelProgress,
  loadCurrentLevel,
  saveCompletedLevels,
  saveCurrentLevel,
} from '../src/progression/levelProgress';
import type { IPlatform } from '../src/platform/IPlatform';
import oldBosses from './fixtures/bosses-13.json';
import type { LevelDefinition } from '../src/gameplay/types';
import { hydrateLevels,toGameLevel,cloneLevel } from '../tools/gm/schema';

function memoryPlatform(seed:Record<string,string>={}):IPlatform{
  const data=new Map(Object.entries(seed));
  return {
    kind:'web',viewport:()=>({width:375,height:812,pixelRatio:1}),attachCanvas:()=>{},onResize:()=>()=>{},safeTop:()=>0,
    vibrate:()=>{},storage:{get:key=>data.get(key)??null,set:(key,value)=>{data.set(key,value);}},
    saveImageToAlbum:async()=>({ok:true,message:''}),
  };
}

const repo=new LevelRepository();
assert.equal(repo.normalLevels.length,200);
assert.equal(repo.timeBosses.length,20);
assert.equal(repo.levels.length,220);
assert.equal(new Set(repo.levels.map(l=>l.campaign!.id)).size,220);
assert(repo.normalLevels.every(level=>!level.timeBoss),'ordinary levels must remain classic');
assert(repo.timeBosses.every(level=>level.timeBoss),'every special stage needs time rules');

for(let chapter=1;chapter<=20;chapter+=1){
  const normalNumber=chapter*10;
  const bossIndex=normalNumber+chapter-1;
  assert.equal(repo.levels[bossIndex-1].campaign?.displayNumber,normalNumber);
  assert.equal(repo.levels[bossIndex].campaign?.id,`boss:${chapter}`);
  if(normalNumber<200)assert.equal(repo.levels[bossIndex+1].campaign?.displayNumber,normalNumber+1);
}
const oldIds=repo.normalLevels.map(l=>l.campaign!.id).filter(id=>id.startsWith('level:'));
assert.deepEqual(oldIds,Array.from({length:130},(_,i)=>`level:${i+1}`),'Original ordering changed');
assert.equal(repo.normalLevels.filter(l=>l.stageKey?.startsWith('flow:')).length,70);
const boardOnly=({stageKey,campaign,chapter,chapterNo,...board}:LevelDefinition)=>JSON.parse(JSON.stringify(board));
for(const [index,boss]of oldBosses.entries())assert.deepEqual(boardOnly(repo.timeBosses[index]),boardOnly(boss as LevelDefinition),'An existing challenge was changed');

const fresh=memoryPlatform();
const freshCompleted=loadCompletedLevels(fresh,repo.levels);
assert.equal(loadCampaignAccess(fresh,repo.levels,freshCompleted),0);
assert(!isLevelUnlocked(1,220,freshCompleted));
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

// A player at old #43 keeps both the board and access after inserted puzzles.
const savedIds=Array.from({length:42},(_,i)=>`level:${i+1}`);
for(let chapter=1;chapter<=4;chapter++)savedIds.push(`boss:${chapter}`);
const returning=memoryPlatform({'laser-mirror-completed-stages-v2':JSON.stringify(savedIds),'laser-mirror-current-stage-v2':'level:43'});
const restored=loadCompletedLevels(returning,repo.levels),access=loadCampaignAccess(returning,repo.levels,restored);
const current=loadCurrentLevel(returning,repo.levels,restored);
assert.equal(repo.levels[current].campaign?.id,'level:43');
assert(isLevelUnlocked(current,220,restored,false,access));
assert(!isLevelUnlocked(current+1,220,restored,false,access));
const added=repo.levels.findIndex(l=>l.stageKey==='flow:1');
assert(!restored.has(added),'New content must not be marked completed');
assert(isLevelUnlocked(added,220,restored,false,access));
saveCompletedLevels(returning,restored,repo.levels);
assert.deepEqual(loadCompletedLevels(returning,repo.levels),restored);
const numeric=memoryPlatform({'laser-mirror-completed-levels':JSON.stringify(Array.from({length:42},(_,i)=>i)),'laser-mirror-current-level':'42'});
const numericProgress=loadCompletedLevels(numeric,repo.levels);
assert.deepEqual(numericProgress,restored,'Numeric saves must map original identities, not shifted display numbers');
assert.equal(repo.levels[loadCurrentLevel(numeric,repo.levels,numericProgress)].campaign?.id,'level:43');
clearLevelProgress(returning);
assert.equal(loadCampaignAccess(returning,repo.levels,loadCompletedLevels(returning,repo.levels)),0);
assert.equal(loadCurrentLevel(returning,repo.levels,new Set()),0);

const gm=hydrateLevels(repo.normalLevels);
assert.deepEqual(gm.map(l=>toGameLevel(l).stageKey),repo.normalLevels.map(l=>l.stageKey),'GM export lost stable board identities');
assert.notEqual(cloneLevel(gm[0]).stageKey,gm[0].stageKey,'A duplicate needs its own save identity');
console.log('Campaign verified: 200 main + 20 challenges, 130 originals and 13 challenge boards preserved, stable saves/access/numeric migration, new content uncompleted, reset and GM round-trip.');
