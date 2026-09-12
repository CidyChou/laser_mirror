import assert from 'node:assert/strict';
import levelsRaw from '../src/levels/levels.json';
import bossesRaw from '../src/levels/time-bosses.json';
import { GameSession } from '../src/gameplay/GameSession';
import { TimeLaserSimulator } from '../src/gameplay/TimeLaserSimulator';
import { computeGeometry } from '../src/gameplay/geometry';
import { inspectLevel } from './level-quality';
import { designBoss, type BossDesign } from './time-boss-designs';
import type { LevelDefinition } from '../src/gameplay/types';

export function replayBoss(design:BossDesign,fps=60,expectWin=true){
  const session=new GameSession([design.level]);
  let lastTrace=session.state.result;
  session.on(e=>{if(e.type==='state'&&session.state.result)lastTrace=session.state.result;});
  let next=0,rotation:Array<[number,number]>|null=null,now=0;
  session.fire();session.update(0);
  while(session.state.firing&&now<180000){
    now+=1000/fps;session.update(now);
    const skill=session.state.timeSkill!,clock=session.state.shotElapsedMs-480;
    if(rotation&&skill.canOperate){for(const[x,y]of rotation)session.rotateAt(x,y);rotation=null;}
    const action=design.actions[next];
    if(action&&clock>=action.at&&skill.phase==='idle'){
      const ok=skill.canOperate;
      assert(ok,`${design.level.name}: action ${next} rejected at ${clock}`);
      rotation=action.rotate;next++;
      if(skill.canOperate){for(const[x,y]of rotation)session.rotateAt(x,y);rotation=null;}
    }
  }
  assert.equal(session.state.won,expectWin,`${design.level.name}: dynamic solution failed (actions=${next}, focuses=${JSON.stringify(lastTrace?.focusHits)}, hits=${JSON.stringify(lastTrace?.hits)})`);
  return session;
}

export function verifyTimeBoss(original:LevelDefinition,number:number,candidates=false){
  const design=designBoss(number,original);
  if(!candidates){
    const stored=(bossesRaw as LevelDefinition[])[number/10-1];
    assert(stored?.timeBoss,`Challenge after #${number}: missing dynamic rules`);
    assert.deepEqual(stored,JSON.parse(JSON.stringify(design.level)),`#${number}: stored board drifted from reviewed design`);
    design.level=stored;
  }
  const metrics=inspectLevel(design.level);
  assert.equal(metrics.solutions,0,`#${number}: a static shortcut exists`);
  // The dynamic engine must also reject every frozen configuration: its causal
  // gates and repeated pulses differ intentionally from the classic solver.
  const controls=design.level.items.filter(i=>['mirror','splitter','combiner'].includes(i.type)&&!('fixed'in i&&i.fixed));
  const sizes=controls.map(i=>i.type==='combiner'?4:2);
  for(let code=0;code<sizes.reduce((a,b)=>a*b,1);code++){
    const items=structuredClone(design.level.items);let n=code;
    controls.forEach((c,i)=>{const item=items.find(x=>x.x===c.x&&x.y===c.y)!;const v=n%sizes[i];n=Math.floor(n/sizes[i]);if(item.type==='mirror'||item.type==='splitter')item.s=v as 0|1;else if(item.type==='combiner')item.dir=v as 0|1|2|3;});
    const sim=new TimeLaserSimulator(design.level,items,computeGeometry(design.level));sim.advanceTo(60000);
    assert(!sim.successful,`#${number}: causal static shortcut ${code}`);
  }
  if(number>10){
    assert((design.level.emitters?.length??1)>=2,`#${number}: requires multiple sources`);
    assert(design.actions.length>=2,`#${number}: requires multiple timed adjustments`);
    assert(design.level.items.some(i=>i.type==='combiner'),`#${number}: requires aggregation`);
  }
  for(let omitted=0;omitted<design.actions.length;omitted++){
    replayBoss({...design,actions:design.actions.filter((_,i)=>i!==omitted)},60,false);
  }
  for(const core of design.level.items.filter(i=>i.type==='combiner')){
    const blocked=structuredClone(design.level);
    blocked.items=blocked.items.map(i=>i.x===core.x&&i.y===core.y?{type:'wall',x:i.x,y:i.y}:i);
    // Test the causal engine directly; a blocked core can terminate a pulse
    // before later scripted rotations, which is an expected failure.
    const sim=new TimeLaserSimulator(blocked,blocked.items,computeGeometry(blocked));
    for(const action of design.actions){sim.advanceTo(action.at);for(const[x,y]of action.rotate){const item=blocked.items.find(i=>i.x===x&&i.y===y);if(item?.type==='mirror')item.s=item.s===0?1:0;}}
    sim.advanceTo(blocked.timeBoss!.lifetimeMs);
    assert(!sim.successful,`#${number}: collector ${core.x},${core.y} can be bypassed`);
  }
  const s=replayBoss(design);
  for(const fps of [30,120]){
    const alternate=replayBoss(design,fps);
    assert.deepEqual(alternate.state.targets.map(t=>t.hit),s.state.targets.map(t=>t.hit),`#${number}: FPS-dependent targets`);
    assert.deepEqual(alternate.state.focusHits,s.state.focusHits,`#${number}: FPS-dependent charge`);
  }
  for(const offset of [-50,50])replayBoss({...design,actions:design.actions.map(a=>({...a,at:a.at+offset}))});
  const hits=s.state.result!.impactEvents.filter(e=>e.type==='mirror');
  assert(controls.some(c=>new Set(hits.filter(e=>e.x===c.x&&e.y===c.y).map(e=>e.outgoingDirs?.join(','))).size>=2),`#${number}: no effective mirror reuse`);
  console.log(`#${number} ${design.level.name}: static=0, dynamic=win, adjustments=${design.actions.length}`);
  return {number,name:design.level.name,mode:'time-boss',solutions:0,dynamicActions:design.actions.length};
}
if(process.argv[1]?.endsWith('verify-time-bosses.ts')){
  const candidates=process.argv.includes('--candidates');
  assert.equal(levelsRaw.length,130,'The ordinary campaign must keep all 130 levels');
  assert.equal(bossesRaw.length,13,'Expected one challenge after each chapter');
  for(let number=10;number<=130;number+=10)verifyTimeBoss(levelsRaw[number-1] as LevelDefinition,number,candidates);
}
