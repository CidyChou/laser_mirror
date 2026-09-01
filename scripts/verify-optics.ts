import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameConfig } from '../src/config/GameConfig';
import { GameSession } from '../src/gameplay/GameSession';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { computeGeometry } from '../src/gameplay/geometry';
import { laserDistanceAtMs,laserMsAtDistance } from '../src/gameplay/laserTiming';
import type { LevelDefinition } from '../src/gameplay/types';
import { collectorFixture,chainedFixture,transportedFixture } from './fixtures/optics';

const sim=new LaserSimulator();
const trace=(level:LevelDefinition)=>sim.simulate(level,level.items,computeGeometry(level));
const t=trace(collectorFixture),pulse=t.combinerPulses['2,3'];
assert(pulse);assert.equal(pulse.launchMs-pulse.readyMs,1500);
assert(Math.abs(laserMsAtDistance(pulse.launchDist)-pulse.launchMs)<.0001);
assert(t.segments.filter(s=>(s.widthScale??1)>1).every(s=>s.startDist>=pulse.launchDist));
assert(t.hits.every(Boolean));
for(const ms of [0,100,500,1033,1500,5000,15000])assert(Math.abs(laserMsAtDistance(laserDistanceAtMs(ms))-ms)<.0001);

const session=new GameSession([collectorFixture]);
const fireTimes:number[]=[];
session.on(e=>{if(e.type==='impact'&&e.impact.type==='combiner-fire')fireTimes.push(session.state.shotElapsedMs)});
session.fire();session.update(0);
const ready=GameConfig.laser.chargeMs+pulse.readyMs,launch=GameConfig.laser.chargeMs+pulse.launchMs;
let sawPartial=false,sawCharge=false;
for(let ms=10;ms<15000&&session.state.firing;ms+=10){
  session.update(ms);
  if(session.state.combinerHits['2,3']===1)sawPartial=true;
  if(ms>ready+100&&ms<launch-100){
    sawCharge=true;assert.equal(session.state.combinerHits['2,3'],2);
    assert(!session.state.combinerOn['2,3']);
    assert(!t.segments.some(s=>(s.widthScale??1)>1&&s.startDist<session.state.beamDistance));
  }
}
assert(sawPartial&&sawCharge);assert.equal(fireTimes.length,1);
assert(Math.abs(fireTimes[0]-launch)<11);assert(session.state.won);
session.reset();assert.equal(session.state.shotElapsedMs,0);assert.deepEqual(session.state.combinerOn,{});assert.equal(session.state.result,null);
session.fire();session.update(20000);
for(let ms=10;ms<ready+500;ms+=10)session.update(20000+ms);
session.abortFire();assert.equal(session.state.result,null);assert.deepEqual(session.state.combinerHits,{});assert.deepEqual(session.state.combinerOn,{});

const weak=structuredClone(collectorFixture);weak.emitters=[weak.emitter];
const insufficient=trace(weak);assert.deepEqual(insufficient.combinerPulses,{});assert(!insufficient.segments.some(s=>(s.widthScale??1)>1));
const chain=trace(chainedFixture);
assert(chain.hits.every(Boolean));assert.equal(Object.keys(chain.combinerPulses).length,2);
const a=chain.combinerPulses['2,1'],b=chain.combinerPulses['2,4'];
assert(b.readyMs>a.launchMs);assert.equal(b.launchMs-b.readyMs,1500);
const carried=trace(transportedFixture);assert(carried.hits.every(Boolean));
assert(carried.impactEvents.some(e=>e.type==='portal'));assert(carried.impactEvents.some(e=>e.type==='splitter'));
const wide=carried.segments.filter(s=>(s.widthScale??1)>1);
assert(wide.length>5);assert(wide.every(s=>s.widthScale===3));assert(new Set(wide.map(s=>s.branch)).size>=2);

// Reaching a separate easy target must not cut off a collector's charging stage.
const early=structuredClone(collectorFixture);early.emitters!.push({side:'W',index:0});early.targets=[{side:'E',index:0}];
const earlySession=new GameSession([early]);earlySession.fire();earlySession.update(0);
for(let ms=10;ms<launch-100;ms+=10)earlySession.update(ms);
assert(earlySession.state.targets[0].hit);assert(earlySession.state.firing);assert(!earlySession.state.won);

// Frozen classic levels must keep the same functional outcomes.
const classic=JSON.parse(readFileSync(new URL('../src/levels/classic.json',import.meta.url),'utf8')) as LevelDefinition[];
const expected=JSON.parse(readFileSync(new URL('../src/levels/classic-traces.json',import.meta.url),'utf8'));
classic.forEach((level,index)=>{const r=trace(level);assert.deepEqual({n:index+1,hits:r.hits,switches:[...r.switches].sort(),exits:r.exits.map(p=>`${p.side}${p.index}`),doors:r.doorStates},expected[index])});
console.log('Optics verified: staged collection, 1500 ms charge, single release, 3× transported beam, chaining, insufficient input, abort/reset, no premature victory; 50 classic outcomes unchanged.');
