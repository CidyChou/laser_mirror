import assert from 'node:assert/strict';
import { GameConfig } from '../src/config/GameConfig';
import { GameSession } from '../src/gameplay/GameSession';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { computeGeometry, cellCenter } from '../src/gameplay/geometry';
import { laserMsAtDistance } from '../src/gameplay/laserTiming';
import type { LevelDefinition, LevelItem } from '../src/gameplay/types';
import { mechanismIdentities } from '../src/rendering/mechanismIdentity';
import { mechanismsFixture } from './fixtures/optics';

const sim=new LaserSimulator();
const trace=(level:LevelDefinition)=>sim.simulate(level,level.items,computeGeometry(level));
const result=trace(mechanismsFixture);
assert(result.hits.every(Boolean));assert(result.focusOn['6,6']);
for(const door of mechanismsFixture.items){
  if(door.type!=='door')continue;
  const lastSwitch=Math.max(...door.requires.map(id=>Math.min(...result.impactEvents
    .filter(e=>e.type==='switch'&&e.id===id).map(e=>laserMsAtDistance(e.at)))));
  const opening=result.impactEvents.filter(e=>e.type==='door-open'&&e.id===door.id);
  assert.equal(opening.length,1);
  const open=opening[0],openMs=laserMsAtDistance(open.at);
  assert(Math.abs(openMs-lastSwitch-GameConfig.laser.doorSignalMs-GameConfig.laser.doorOpenMs)<.01);
  const center=cellCenter(computeGeometry(mechanismsFixture),door.x,door.y);
  assert(result.segments.filter(s=>s.x1===center.x&&s.y1===center.y).every(s=>s.startDist>=open.at));
}
const session=new GameSession([mechanismsFixture]);
session.fire();session.update(0);
let sawSignal=false,sawOpening=false;
for(let ms=10;ms<15000&&session.state.firing;ms+=10){
  session.update(ms);
  for(const e of result.impactEvents.filter(e=>e.type==='door-open')){
    const until=GameConfig.laser.chargeMs+laserMsAtDistance(e.at)-ms;
    if(until>0)assert(!session.state.activeDoorStates[e.id!]);
    if(until>GameConfig.laser.doorOpenMs&&until<GameConfig.laser.doorOpenMs+GameConfig.laser.doorSignalMs)sawSignal=true;
    if(until>0&&until<GameConfig.laser.doorOpenMs)sawOpening=true;
    if(until<=0)assert(session.state.activeDoorStates[e.id!]);
  }
}
assert(sawSignal&&sawOpening);assert(session.state.won);
session.reset();assert.deepEqual(session.state.activeDoorStates,{});assert.equal(session.state.activeSwitches.size,0);
session.fire();session.update(0);session.update(100);session.abortFire();
assert.equal(session.state.result,null);assert.deepEqual(session.state.activeDoorStates,{});

// A missing key never opens the multi-key door; an independent single-key door still works.
const missing=structuredClone(mechanismsFixture);
missing.items=missing.items.filter(i=>i.type!=='switch'||i.id!=='B');
const blocked=trace(missing);assert(!blocked.doorStates.ABC);assert(blocked.doorStates['A-only']);
assert(!blocked.impactEvents.some(e=>e.type==='door-open'&&e.id==='ABC'));

// One gate's released beam supplies the next key. Neither gate can release early.
const chain:LevelDefinition={name:'门锁接力',chapter:'校验',chapterNo:1,shots:3,rows:3,cols:8,
  emitter:{side:'W',index:1},targets:[{side:'E',index:1}],
  items:[{type:'switch',x:0,y:1,id:'A'},{type:'door',x:1,y:1,id:'DA',requires:['A']},
    {type:'switch',x:2,y:1,id:'B'},{type:'door',x:3,y:1,id:'DB',requires:['B']}]};
const chained=trace(chain);assert(chained.hits[0]);
const opening=chained.impactEvents.filter(e=>e.type==='door-open');
assert.equal(opening.length,2);assert(opening[1].at>opening[0].at);
const noKey=structuredClone(chain);noKey.items=noKey.items.filter(i=>i.type!=='switch'||i.id!=='A');
assert(!trace(noKey).hits[0]);

// Six real pairs and a stress case have no duplicate colors or labels; order is irrelevant.
const pairs:LevelItem[]=Array.from({length:48},(_,index)=>({type:'portal',x:index%8,y:Math.floor(index/8),pair:`pair-${index}`}));
for(const items of [mechanismsFixture.items,pairs]){
  const ids=mechanismIdentities(items,'portal');
  assert.equal(new Set([...ids.values()].map(x=>x.color)).size,ids.size);
  assert.equal(new Set([...ids.values()].map(x=>x.label)).size,ids.size);
  assert.deepEqual(ids,mechanismIdentities([...items].reverse(),'portal'));
}
console.log('Mechanisms verified: delayed signal/open, beams wait, multi-key and chained doors, missing key, victory, reset/abort, and unique stable portal identities.');
