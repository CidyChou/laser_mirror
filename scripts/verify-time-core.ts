import assert from 'node:assert/strict';
import { GameConfig } from '../src/config/GameConfig';
import { GameSession } from '../src/gameplay/GameSession';
import { TimeLaserSimulator } from '../src/gameplay/TimeLaserSimulator';
import { computeGeometry } from '../src/gameplay/geometry';
import { laserDistanceAtMs, TIME_BOSS_SPEED_SCALE } from '../src/gameplay/laserTiming';
import type { LevelDefinition } from '../src/gameplay/types';
import { collectorFixture,transportedFixture,mechanismsFixture,chainedFixture } from './fixtures/optics';

const fixture:LevelDefinition={name:'time fixture',chapter:'test',chapterNo:1,rows:8,cols:5,emitter:{side:'W',index:3},targets:[{side:'S',index:3},{side:'N',index:3}],shots:5,
  timeBoss:{adjustmentUses:2,bulletTimeUses:2,lifetimeMs:20000,firstFailureFree:true},items:[
    {type:'splitter',x:1,y:3,s:0,fixed:true},
    {type:'mirror',x:1,y:6,s:1,fixed:true},{type:'mirror',x:0,y:6,s:0,fixed:true},
    {type:'mirror',x:0,y:0,s:1,fixed:true},{type:'mirror',x:1,y:0,s:0,fixed:true},
    {type:'mirror',x:3,y:3,s:0},
  ]};
function clock(session:GameSession,fps=60){
  let now=0;session.update(now);
  return (until:number)=>{while(now<until){now=Math.min(until,now+1000/fps);session.update(now);}};
}
function run(fps:number){
  const s=new GameSession([fixture]);assert(!s.startBulletTime());s.fire();const advance=clock(s,fps);
  assert(!s.startBulletTime());advance(2300);
  assert(s.startBulletTime());assert(!s.startBulletTime());
  s.rotateAt(3,3);assert.equal((s.state.items.at(-1) as any).s,1);
  assert.equal(s.state.timeSkill!.adjustmentUses,1);
  advance(5500);assert.equal(s.state.timeSkill!.phase,'idle');assert(s.state.timeSkill!.canOperate);
  advance(15000);assert(s.state.won);return s.state.result;
}
const gold=run(60);assert.deepEqual(run(30),gold);assert.deepEqual(run(120),gold);
const speedProbe=new TimeLaserSimulator(fixture,structuredClone(fixture.items),computeGeometry(fixture));
speedProbe.advanceTo(800);
assert(Math.abs(speedProbe.distance-laserDistanceAtMs(800,TIME_BOSS_SPEED_SCALE))<1e-6);

// A completed UI hold hands the session a fully charged shot: launch is
// immediate and the old muzzle delay is not replayed.
for(const level of [fixture,collectorFixture]){
  const precharged=new GameSession([level]);let launches=0;
  precharged.on(event=>{if(event.type==='laser-launch')launches++;});
  precharged.fire(true);
  assert.equal(launches,1);assert.equal(precharged.state.shotElapsedMs,GameConfig.laser.chargeMs);
  precharged.update(0);precharged.update(10);
  assert(precharged.state.beamDistance>0,`${level.name}: precharged beam did not move immediately`);
}

// Exhausting rotations must end a live infinite loop, with a visible decreasing
// tail and exactly one failed shot; invalid clicks cannot consume adjustments.
for(const fps of [30,60,120]){
  const s=new GameSession([fixture],1,0,{usedFailureProtection:new Set([0])});
  let failures=0,defeats=0;s.on(e=>{if(e.type==='shot-end'&&!e.success)failures++;if(e.type==='defeat')defeats++;});
  s.fire();const advance=clock(s,fps);advance(600);
  s.rotateAt(0,0);s.rotateAt(2,2);assert.equal(s.state.timeSkill!.adjustmentUses,2);
  s.rotateAt(3,3);s.rotateAt(3,3);assert.equal(s.state.timeSkill!.adjustmentUses,0);
  s.rotateAt(3,3);assert.equal((s.state.items.at(-1) as any).s,0);
  const life=s.state.timeSkill!.beamLife;advance(3600);
  assert(s.state.firing);assert(s.state.timeSkill!.beamLife>0&&s.state.timeSkill!.beamLife<life*.6);
  advance(6600);assert(!s.state.firing);assert(!s.state.won);assert.equal(s.state.timeSkill!.beamLife,0);
  assert.equal(s.state.hearts,0);advance(10000);assert.equal(failures,1);assert.equal(defeats,1);
  s.restoreHearts(3);s.fire();assert.equal(s.state.timeSkill!.adjustmentUses,2);assert.equal(s.state.timeSkill!.beamLife,1);
}
// Retaining adjustments cannot keep a looping shot alive indefinitely.
const held=new GameSession([fixture]);held.fire();const heldClock=clock(held);heldClock(20000);
assert(held.state.firing);heldClock(20480);assert(!held.state.firing);assert.equal(held.state.timeSkill!.beamLife,0);

// Background gaps and emitter charging do not silently eat the lifetime.
const suspended=new GameSession([fixture]);suspended.fire();suspended.update(0);suspended.update(200);
assert.equal(suspended.state.timeSkill!.lifetimeRemainingMs,20000);
suspended.update(10000);assert.equal(suspended.state.timeSkill!.lifetimeRemainingMs,20000);
suspended.update(10200);suspended.update(10400);assert.equal(suspended.state.timeSkill!.lifetimeRemainingMs,19880);
suspended.reset();assert.equal(suspended.state.timeSkill!.beamLife,1);assert(!suspended.state.firing);

const progress={usedFailureProtection:new Set<number>(),seenTutorials:new Set<string>()};
const session=new GameSession([fixture],5,0,progress);
session.fire();const advance=clock(session);advance(600);
assert(session.startBulletTime());assert.equal(session.state.timeSkill!.tutorial,'bullet');
assert.equal(session.state.timeSkill!.bulletTimeUses,2);const remaining=session.state.timeSkill!.lifetimeRemainingMs;
advance(800);assert.equal(session.state.timeSkill!.lifetimeRemainingMs,remaining);
session.confirmSkillTutorial();assert.equal(session.state.timeSkill!.bulletTimeUses,1);assert(progress.seenTutorials.has('bullet'));
session.endTimeShot();assert.equal(session.state.hearts,5);assert(progress.usedFailureProtection.has(0));
session.load(0);session.fire();session.endTimeShot();assert.equal(session.state.hearts,4);
const reload=new GameSession([fixture],4,0,progress);reload.fire();reload.endTimeShot();assert.equal(reload.state.hearts,3);

// Stepping over charge, door and split events must match one forward pass.
for(const level of [collectorFixture,transportedFixture,mechanismsFixture,chainedFixture]){
  const reference=new TimeLaserSimulator(level,structuredClone(level.items),computeGeometry(level));
  reference.advanceTo(14000);assert(reference.successful,level.name);
  const actual=new TimeLaserSimulator(level,structuredClone(level.items),computeGeometry(level));
  for(let at=10;at<=14000;at+=10)actual.advanceTo(at);
  assert.deepEqual(actual.trace,reference.trace,`${level.name}: causal events changed with step size`);
}
// A dead pulse fades promptly instead of waiting for the entire lifetime.
const dead={...fixture,items:[{type:'wall' as const,x:0,y:3}]};
const stopped=new GameSession([dead]);stopped.fire();const stoppedClock=clock(stopped);stoppedClock(800);
assert(stopped.state.firing);assert(stopped.state.timeSkill!.lifetimeRemainingMs<=GameConfig.laser.stoppedBeamFadeMs);
stoppedClock(2500);assert(!stopped.state.firing);assert.equal(stopped.state.timeSkill!.beamLife,0);
console.log('Time core: forward-only optics, FPS parity, finite loop lifetime, spent-adjustment fade, dead pulse fade, retries, foreground clock and protection passed.');
