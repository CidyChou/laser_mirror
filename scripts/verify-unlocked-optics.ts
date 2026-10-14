import assert from 'node:assert/strict';
import { GameSession } from '../src/gameplay/GameSession';
import { LevelRepository } from '../src/levels/LevelRepository';
import { tutorialLessonIds } from '../src/gameplay/tutorial';
import { toGameItem } from '../tools/gm/schema';
import type { LevelDefinition } from '../src/gameplay/types';
import { replayBoss } from './verify-time-bosses';
import { designBoss } from './time-boss-designs';

let unlocked=0;
const repo=new LevelRepository();
for(const level of repo.levels){
  const session=new GameSession([level]);
  assert(session.state.items.every(item=>!('fixed' in item)),`${level.name}: legacy lock survived loading`);
  assert(!tutorialLessonIds(level).some(id=>id.startsWith('fixed-')));
  for(const authored of level.items){
    if(!('fixed' in authored)||!authored.fixed)continue;
    assert(!('fixed' in toGameItem(authored)),'GM export must not create locked optics');
    const item=session.state.items.find(i=>i.x===authored.x&&i.y===authored.y)!;
    const before=item.type==='combiner'?item.dir:'s' in item?item.s:undefined;
    session.rotateAt(item.x,item.y);
    const after=item.type==='combiner'?item.dir:'s' in item?item.s:undefined;
    assert.notEqual(after,before,`${level.name}: old locked optic did not rotate`);
    unlocked++;
  }
  session.reset();
  assert.deepEqual(session.state.items.map(i=>'s' in i?i.s:i.type==='combiner'?i.dir:null),level.items.map(i=>'s' in i?i.s:i.type==='combiner'?i.dir:null));
}
const timed:LevelDefinition={name:'Unlocked timed mirror',chapter:'test',chapterNo:1,rows:3,cols:3,shots:3,
  emitter:{side:'W',index:1},targets:[{side:'S',index:1}],items:[{type:'mirror',x:1,y:1,s:0,fixed:true}],
  timeBoss:{adjustmentUses:2,bulletTimeUses:0,lifetimeMs:20000,firstFailureFree:true}};
const session=new GameSession([timed]);session.fire(true);
session.rotateAt(1,1);assert.equal(session.state.timeSkill!.adjustmentUses,1);
session.rotateAt(1,1);assert.equal(session.state.timeSkill!.adjustmentUses,0);
session.rotateAt(1,1);assert.equal(session.state.items[0].type==='mirror'&&session.state.items[0].s,0,'Exhausted challenge adjustments still prevent further turns');
for(let chapter=1;chapter<=20;chapter++){
  const design=designBoss(chapter*10,repo.normalLevels[chapter*10-1]);
  design.level=repo.timeBosses[chapter-1];
  for(const fps of [30,60,120])replayBoss(design,fps);
}
console.log(`Unlocked optics verified: ${unlocked} legacy locks rotate across all 220 stages, reset preserves initial directions, tutorials/export omit locks, timed adjustments still apply, all 20 original challenge paths win at 30/60/120 FPS.`);
