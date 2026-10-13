import assert from 'node:assert/strict';
import { LevelRepository } from '../src/levels/LevelRepository';
import { GameSession } from '../src/gameplay/GameSession';
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
assert(!isLevelUnlocked(1,repo.levels,freshCompleted));
assert.equal(firstIncompleteLevel(repo.levels.length,freshCompleted),0);
for(let index=0;index<10;index+=1)freshCompleted.add(index);
saveCompletedLevels(fresh,freshCompleted,repo.levels);
assert.equal(repo.levels[firstIncompleteLevel(repo.levels.length,freshCompleted)].campaign?.id,'boss:1');
assert(isLevelUnlocked(10,repo.levels,freshCompleted),'Chapter 1 challenge remains optional and playable');
assert(isLevelUnlocked(11,repo.levels,freshCompleted),'Level 10 must unlock level 11 without the challenge');
assert(!isLevelUnlocked(12,repo.levels,freshCompleted),'Level 12 must stay locked');
freshCompleted.add(10);
assert.equal(repo.levels[firstIncompleteLevel(repo.levels.length,freshCompleted)].campaign?.id,'level:11');
saveCurrentLevel(fresh,10,repo.levels);
assert.equal(loadCurrentLevel(fresh,repo.levels,freshCompleted),10);

// Chapter transitions still visit challenges, but challenges never gate the main campaign.
const mainCompleted=new Set<number>();
const chapterSession=new GameSession(repo.levels);
for(let index=0;index<repo.levels.length;index+=1){
  const level=repo.levels[index];
  if(level.campaign?.kind==='boss')continue;
  mainCompleted.add(index);
  if(level.campaign!.displayNumber%10!==0)continue;
  assert(isLevelUnlocked(index+1,repo.levels,mainCompleted),'Chapter challenge must unlock');
  assert(!mainCompleted.has(index+1),'Optional challenge must remain uncompleted');
  chapterSession.load(index);
  chapterSession.next();
  assert.equal(chapterSession.state.level.campaign?.kind,'boss','Next must still enter the chapter challenge');
  if(index+2<repo.levels.length){
    assert(isLevelUnlocked(index+2,repo.levels,mainCompleted),'Next chapter must unlock without completing a challenge');
    assert(!isLevelUnlocked(index+3,repo.levels,mainCompleted),'Later main levels must stay locked');
    chapterSession.next();
    assert.equal(chapterSession.state.levelIndex,index+2);
  }
}

// Existing saves stopped at the first challenge gain access to level 11 without completing it.
const atChallenge=memoryPlatform({
  'laser-mirror-completed-stages-v2':JSON.stringify(Array.from({length:10},(_,index)=>`level:${index+1}`)),
  'laser-mirror-current-stage-v2':'boss:1',
  'laser-mirror-campaign-access-200':'boss:1',
});
const challengeProgress=loadCompletedLevels(atChallenge,repo.levels);
const challengeAccess=loadCampaignAccess(atChallenge,repo.levels,challengeProgress);
assert(isLevelUnlocked(11,repo.levels,challengeProgress,false,challengeAccess));
assert(!challengeProgress.has(10));
assert.equal(loadCurrentLevel(atChallenge,repo.levels,challengeProgress),10,'Keep the current challenge on restart');
saveCurrentLevel(atChallenge,11,repo.levels);
assert.equal(loadCurrentLevel(atChallenge,repo.levels,challengeProgress),11,'Skipped challenge must not invalidate the selected main level');

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
assert(isLevelUnlocked(current,repo.levels,restored,false,access));
assert(!isLevelUnlocked(current+1,repo.levels,restored,false,access));
const added=repo.levels.findIndex(l=>l.stageKey==='flow:1');
assert(!restored.has(added),'New content must not be marked completed');
assert(isLevelUnlocked(added,repo.levels,restored,false,access));
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
