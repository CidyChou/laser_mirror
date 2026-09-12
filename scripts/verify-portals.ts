import assert from 'node:assert/strict';
import { GameConfig } from '../src/config/GameConfig';
import { GameSession } from '../src/gameplay/GameSession';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { TimeLaserSimulator } from '../src/gameplay/TimeLaserSimulator';
import { cellCenter,computeGeometry } from '../src/gameplay/geometry';
import { laserDistanceAtMs,laserMsAtDistance,TIME_BOSS_SPEED_SCALE } from '../src/gameplay/laserTiming';
import type { ImpactEvent,LevelDefinition } from '../src/gameplay/types';
import { transportedFixture } from './fixtures/optics';

const portal:LevelDefinition={name:'portal relay',chapter:'test',chapterNo:1,rows:4,cols:6,shots:5,
  emitter:{side:'W',index:1},targets:[{side:'E',index:2}],
  items:[{type:'portal',x:1,y:1,pair:'A'},{type:'portal',x:4,y:2,pair:'A'}]};
const simulator=new LaserSimulator();
for(const level of [portal,{...portal,cols:8,rows:8},transportedFixture]){
  const g=computeGeometry(level);
  for(const dynamic of [false,true]){
    const speed=dynamic?TIME_BOSS_SPEED_SCALE:1;
    const sim=dynamic?new TimeLaserSimulator(level,structuredClone(level.items),g):null;
    if(sim)sim.advanceTo(18000);
    const trace=sim?.trace??simulator.simulate(level,level.items,g);
    const enters=trace.impactEvents.filter(e=>e.type==='portal');
    const exits=trace.impactEvents.filter(e=>e.type==='portal-exit');
    assert(enters.length>0);assert.equal(exits.length,enters.length);
    for(const entry of enters){
      const when=laserMsAtDistance(entry.at,speed)+GameConfig.laser.portalTransitMs;
      const exit=exits.find(e=>e.pair===entry.pair&&Math.abs(laserMsAtDistance(e.at,speed)-when)<.001);
      assert(exit,`${level.name}: missing delayed release`);
      assert.equal(exit.incomingDir,entry.incomingDir);assert.deepEqual(exit.outgoingDirs,[entry.incomingDir]);
      assert.deepEqual([exit.px,exit.py],[entry.toX,entry.toY]);
      assert.deepEqual([exit.px,exit.py],Object.values(cellCenter(g,exit.x!,exit.y!)));
      const output=trace.segments.filter(s=>s.x1===exit.px&&s.y1===exit.py);
      // Dynamic traces prune old segments after the flight; inspect the live pause separately below.
      if(!dynamic){assert(output.length);assert(output.every(s=>s.startDist>=exit.at-.001));}
    }
    assert(trace.hits.every(Boolean));
  }
}
const g=computeGeometry(portal),dynamic=new TimeLaserSimulator(portal,structuredClone(portal.items),g);
const reference=new TimeLaserSimulator(portal,structuredClone(portal.items),g);reference.advanceTo(10000);
const enter=reference.trace.impactEvents.find(e=>e.type==='portal')!;
const entryMs=laserMsAtDistance(enter.at,TIME_BOSS_SPEED_SCALE),exitMs=entryMs+GameConfig.laser.portalTransitMs;
dynamic.advanceTo(entryMs+GameConfig.laser.portalTransitMs/2);
assert(!dynamic.finished,'A pulse in transit must stay alive');
assert(!dynamic.trace.impactEvents.some(e=>e.type==='portal-exit'));
assert(!dynamic.trace.segments.some(s=>s.x1===enter.toX&&s.y1===enter.toY),'No beam may leave during the pause');
dynamic.advanceTo(exitMs);assert.equal(dynamic.trace.impactEvents.filter(e=>e.type==='portal-exit').length,1);
assert(dynamic.trace.segments.some(s=>Math.abs(s.startDist-laserDistanceAtMs(exitMs,TIME_BOSS_SPEED_SCALE))<.001));

for(const timed of [false,true])for(const fps of [30,60,120]){
  const level={...portal,...(timed?{timeBoss:{adjustmentUses:2,bulletTimeUses:0,lifetimeMs:20000,firstFailureFree:true as const}}:{})};
  const session=new GameSession([level]);const events:{e:ImpactEvent;ms:number}[]=[];
  session.on(event=>{if(event.type==='impact')events.push({e:event.impact,ms:session.state.shotElapsedMs});});
  session.fire();session.update(0);
  for(let ms=1000/fps;ms<10000&&session.state.firing;ms+=1000/fps)session.update(ms);
  assert(session.state.won);
  const input=events.find(({e})=>e.type==='portal')!,output=events.find(({e})=>e.type==='portal-exit')!;
  assert(Math.abs(output.ms-input.ms-GameConfig.laser.portalTransitMs)<=1000/fps+10);
}
// Cancelling during transit must not emit a delayed exit into the next board.
for(const timed of [false,true]){
  const level={...portal,...(timed?{timeBoss:{adjustmentUses:2,bulletTimeUses:0,lifetimeMs:20000,firstFailureFree:true as const}}:{})};
  const session=new GameSession([level]);let exitCount=0;
  session.on(event=>{if(event.type==='impact'&&event.impact.type==='portal-exit')exitCount++;});
  session.fire();session.update(0);
  const clock=GameConfig.laser.chargeMs+(timed?entryMs:laserMsAtDistance(simulator.simulate(portal,portal.items,g).impactEvents[0].at))+200;
  for(let ms=10;ms<clock;ms+=10)session.update(ms);
  session.reset();for(let ms=clock;ms<clock+2000;ms+=10)session.update(ms);
  assert.equal(exitCount,0);assert.equal(session.state.result,null);
}
console.log('Portals verified: 520ms delay at both speeds and board sizes, no premature exit, matching coordinates/directions, transported wide beam, FPS parity and cancellation.');
