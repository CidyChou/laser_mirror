import assert from 'node:assert/strict';
import { GameSession } from '../src/gameplay/GameSession';
import { TimeLaserSimulator } from '../src/gameplay/TimeLaserSimulator';
import { computeGeometry } from '../src/gameplay/geometry';
import { laserDistanceAtMs, TIME_BOSS_SPEED_SCALE } from '../src/gameplay/laserTiming';
import type { LevelDefinition } from '../src/gameplay/types';
import { collectorFixture,transportedFixture,mechanismsFixture,chainedFixture } from './fixtures/optics';

const fixture:LevelDefinition={name:'time fixture',chapter:'test',chapterNo:1,rows:8,cols:5,emitter:{side:'W',index:3},targets:[{side:'S',index:3},{side:'N',index:3}],shots:5,
  timeBoss:{adjustmentUses:2,bulletTimeUses:2,rewindUses:2,rewindCells:2,firstFailureFree:true},items:[
    {type:'splitter',x:1,y:3,s:0,fixed:true},
    {type:'mirror',x:1,y:6,s:1,fixed:true},{type:'mirror',x:0,y:6,s:0,fixed:true},
    {type:'mirror',x:0,y:0,s:1,fixed:true},{type:'mirror',x:1,y:0,s:0,fixed:true},
    {type:'mirror',x:3,y:3,s:0},
  ]};
function run(fps:number){
  const s=new GameSession([fixture]);let now=0;
  const advance=(until:number)=>{while(now<until){now=Math.min(until,now+1000/fps);s.update(now);}};
  assert(!s.startBulletTime());s.fire();s.update(0);
  assert(!s.startRewind());advance(2300);
  assert(s.startBulletTime());assert(!s.startRewind());
  s.rotateAt(3,3);assert.equal((s.state.items.at(-1) as any).s,1);
  assert.equal(s.state.timeSkill!.adjustmentUses,1);
  advance(5500);assert.equal(s.state.timeSkill!.phase,'idle');assert(s.state.timeSkill!.canOperate);
  advance(15000);assert(s.state.won);return s.state.result;
}
const gold=run(60);assert.deepEqual(run(30),gold);assert.deepEqual(run(120),gold);

const speedProbe=new TimeLaserSimulator(fixture,structuredClone(fixture.items),computeGeometry(fixture));
speedProbe.advanceTo(800);
assert(Math.abs(speedProbe.distance-laserDistanceAtMs(800,TIME_BOSS_SPEED_SCALE))<1e-6,'chapter challenge speed must be 20% slower than ordinary');

const items=fixture.items.map(i=>({...i}));
const sim=new TimeLaserSimulator(fixture,items,computeGeometry(fixture));
// Anchor the rewind to the second movable-mirror collision. A fixed wall-clock
// time can fall in empty space when a UI layout changes the board's cell size.
const referenceLoop=new TimeLaserSimulator(fixture,structuredClone(items),sim.geometry);
referenceLoop.advanceTo(9000);
const collision=referenceLoop.trace.impactEvents.filter(e=>e.type==='mirror'&&e.x===3&&e.y===3)[1];
assert(collision,'the loop must revisit the movable mirror');
sim.advanceTo(sim.timeAtDistance(collision.at+sim.geometry.cell*.25));
assert(sim.trace.hits[0]);assert(!sim.trace.hits[1]);
const before=sim.trace.impactEvents.length;
sim.rewindTo(sim.timeAtDistance(Math.max(0,sim.distance-sim.geometry.cell*2)));
assert(sim.trace.hits[0]);assert(sim.trace.impactEvents.length<before);
assert(!sim.trace.impactEvents.some(e=>e.type==='mirror'&&e.x===3&&e.y===3&&Math.abs(e.at-collision.at)<1e-6),'the selected collision must be rolled back');
(items.at(-1) as any).s=1;
sim.advanceTo(13000);assert(sim.successful);
assert.equal((items.at(-1) as any).s,1);

const progress={usedFailureProtection:new Set<number>(),seenTutorials:new Set<string>()};
const session=new GameSession([fixture],5,0,progress);
session.fire();session.update(0);session.update(200);session.update(400);session.update(600);
assert(session.startBulletTime());assert.equal(session.state.timeSkill!.tutorial,'bullet');
assert.equal(session.state.timeSkill!.bulletTimeUses,2);
session.update(800);assert.equal(session.state.timeSkill!.remainingMs,0);
session.confirmSkillTutorial();assert.equal(session.state.timeSkill!.bulletTimeUses,1);assert(progress.seenTutorials.has('bullet'));
session.endTimeShot();assert.equal(session.state.hearts,5);assert(progress.usedFailureProtection.has(0));
session.load(0);session.fire();session.endTimeShot();assert.equal(session.state.hearts,4);
const reload=new GameSession([fixture],4,0,progress);reload.fire();reload.endTimeShot();assert.equal(reload.state.hearts,3);

// Roll back across each kind of causal event, then replay to exactly the same
// state. This catches duplicated inputs, ghost split branches and sticky doors.
for(const level of [collectorFixture,transportedFixture,mechanismsFixture,chainedFixture]){
  const reference=new TimeLaserSimulator(level,structuredClone(level.items),computeGeometry(level));
  reference.advanceTo(14000);assert(reference.successful,level.name);
  const types=['switch','door-open','combiner','combiner-fire','portal','splitter','focus','target'];
  for(const type of types){
    const event=reference.trace.impactEvents.find(e=>e.type===type);if(!event)continue;
    const at=reference.timeAtDistance(event.at);
    const actual=new TimeLaserSimulator(level,structuredClone(level.items),computeGeometry(level));
    actual.advanceTo(at+100);actual.rewindTo(Math.max(0,at-100));
    assert(!actual.trace.impactEvents.some(e=>e.type===type&&Math.abs(e.at-event.at)<1e-6),`${type} not rolled back`);
    actual.advanceTo(14000);
    assert.deepEqual(actual.trace,reference.trace,`${level.name}: duplicate or missing ${type} after replay`);
  }
}
console.log('Time core: causal mirror changes, global rollback, retained earlier targets, fixed-step FPS parity, tutorial and skill guards passed.');
