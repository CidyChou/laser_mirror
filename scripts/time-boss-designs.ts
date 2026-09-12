import type { LevelDefinition, LevelItem, Port, TimeBossRules } from '../src/gameplay/types';
import { computeGeometry } from '../src/gameplay/geometry';
import { TimeLaserSimulator } from '../src/gameplay/TimeLaserSimulator';

const mirror=(x:number,y:number,s:0|1,fixed=true):LevelItem=>({type:'mirror',x,y,s,fixed});
const split=(x:number,y:number,s:0|1):LevelItem=>({type:'splitter',x,y,s,fixed:true});
const rules=(adjustmentUses:number,lifetimeMs:number):TimeBossRules=>({adjustmentUses,bulletTimeUses:0,lifetimeMs,firstFailureFree:true});
export type BossAction={at:number;skill:'adjust';rotate:Array<[number,number]>};
export type BossDesign={level:LevelDefinition;actions:BossAction[]};

/** Pulses revisit shared controls; each control must serve both directions.
 * Additional sources charge indispensable collectors on the output branches. */
export function designBoss(number:number,original:LevelDefinition):BossDesign {
  const chapter=number/10,stages=chapter===1?1:chapter<8?2:chapter<13?3:4;
  const names=['镜阵·换轨','双源·接棒','三源·合流','聚能·双钥','跃迁·汇流','双核·分工','三向·聚能','聚合·三换轨','晶核·交响','跃迁·三幕','双核·错峰','三核·接力','光路终局·合奏'];
  const level:LevelDefinition={...original,mode:'challenge',rows:8,cols:chapter===1?5:8,emitter:{side:'W',index:3},emitters:undefined,
    targets:[{side:'N',index:3},{side:'S',index:3}],
    items:[split(1,3,0),mirror(1,6,1),mirror(0,6,0),mirror(0,0,1),mirror(1,0,0),mirror(3,3,chapter===1?0:1,false)],
    timeBoss:rules(chapter===1?2:stages,chapter===1?16000:stages===2?20000:24000),name:names[chapter-1],
    hint:'先让第一束光通过中央镜，再旋转一次，接住回环返回的光。激光缩短至消失时失败。'};
  const sources:Port[]=[level.emitter];
  const collect=(x:number,y:number,dir:0|1|2|3,source:Port,need=2)=>{
    level.items.push({type:'combiner',x,y,dir,need,fixed:true});sources.push(source);
  };
  if(stages>=2){
    level.targets=[{side:'N',index:3},{side:'W',index:4},{side:'E',index:4}];
    level.items.push(mirror(3,6,0),mirror(5,6,1),mirror(5,4,0,false));
    collect(3,1,3,{side:'E',index:1});
    level.hint='横向光源先为核心充能。中央镜先向上、再向下；右侧镜先向左、再向右，两次换向都要等前一束通过。';
  }
  if(chapter===3||chapter===6||chapter===7){
    collect(7,4,0,{side:'N',index:7},chapter===7?3:2);
    if(chapter===7)sources.push({side:'S',index:7});
  }
  if(chapter===4){
    level.items.push({type:'switch',x:3,y:2,id:'A'},{type:'switch',x:2,y:4,id:'B'},{type:'door',x:6,y:4,id:'AB',requires:['A','B']});
    level.hint='聚合上行光取得 A，左行光取得 B，最后才把右行光送过双钥门。';
  }
  if(chapter===5||chapter===10){
    level.items.push({type:'portal',x:0,y:chapter===10?2:5,pair:'loop'},{type:'portal',x:0,y:chapter===10?1:2,pair:'loop'});
    level.hint='传送让回环光更快返回。先完成上行聚合，再依次切换下方的出口。';
  }
  if(chapter===6){
    level.items.push({type:'switch',x:2,y:4,id:'A'},{type:'door',x:6,y:4,id:'A',requires:['A']});
  }
  if(stages>=3){
    level.targets=[{side:'N',index:3},{side:'W',index:4},{side:'W',index:5},{side:'E',index:5}];
    level.items.push(mirror(7,4,0),mirror(7,6,1),mirror(6,6,0),mirror(6,5,0,false));
    collect(2,5,2,{side:'S',index:2});
    level.hint='三面可动镜依次换向。保留每次第一束的路线，最后让粗光束接通左下出口。';
  }
  if(chapter===9){
    level.targets=level.targets.filter(p=>!(p.side==='W'&&p.index===4));
    level.items.push({type:'focus',x:2,y:4,need:2});sources.push({side:'N',index:2});
    level.items.push({type:'switch',x:3,y:2,id:'A'},{type:'door',x:6,y:4,id:'A',requires:['A']});
  }
  if(chapter===11){
    level.items.push({type:'portal',x:4,y:6,pair:'relay'},{type:'portal',x:4,y:7,pair:'relay'});
    level.items=level.items.filter(i=>!(i.x===5&&i.y===6));level.items.push(mirror(5,7,1));
  }
  if(chapter===12){
    collect(2,4,2,{side:'N',index:2});
    level.items.push({type:'switch',x:3,y:2,id:'A'},{type:'door',x:6,y:4,id:'A',requires:['A']});
    level.hint='三座核心各有独立输入。依次完成上方、左侧和左下聚合，再给最终出口换向。';
  }
  if(stages===4){
    (level.items.find(i=>i.x===6&&i.y===5) as Extract<LevelItem,{type:'mirror'}>).s=1;
    level.items=level.items.filter(i=>!((i.x===3&&i.y===1)||(i.x===2&&i.y===5)));
    sources.splice(1);
    level.targets=[{side:'N',index:3},{side:'W',index:4},{side:'E',index:5},{side:'N',index:4}];
    level.items.push(mirror(2,5,0),mirror(2,1,1),mirror(4,1,0,false),{type:'focus',x:4,y:3,need:2});
    collect(4,0,3,{side:'E',index:0});sources.push({side:'E',index:3});
    collect(4,4,2,{side:'S',index:4});
    level.items.push({type:'switch',x:3,y:2,id:'A'},{type:'switch',x:5,y:5,id:'B'},{type:'door',x:6,y:4,id:'AB',requires:['A','B']});
    level.hint='四次换向依次服务不同目标；先给晶体补光，再让最后一束上行光完成顶端聚合。';
  }
  if(sources.length>1)level.emitters=sources;
  return {level,actions:planActions(level)};
}

/** A review/playback solution, derived from causal collision times rather than
 * layout-sensitive hardcoded wall-clock guesses. Never used by the game. */
function planActions(level:LevelDefinition):BossAction[]{
  const items=structuredClone(level.items),sim=new TimeLaserSimulator(level,items,computeGeometry(level));
  const controls=items.filter(i=>i.type==='mirror'&&!i.fixed);
  const planned=new Set<string>(),actions:BossAction[]=[];
  for(let at=10;at<level.timeBoss!.lifetimeMs&&!sim.successful;at+=10){
    sim.advanceTo(at);
    for(const control of controls){
      if(control.type!=='mirror')continue;
      const key=`${control.x},${control.y}`;
      const hit=sim.trace.impactEvents.find(e=>e.type==='mirror'&&e.x===control.x&&e.y===control.y);
      if(!planned.has(key)&&hit&&at>=sim.timeAtDistance(hit.at)+350){
        control.s=control.s===0?1:0;planned.add(key);
        actions.push({at,skill:'adjust',rotate:[[control.x,control.y]]});
      }
    }
  }
  if(!sim.successful)throw new Error(`${level.name}: forward-only design is unsolved (${JSON.stringify({hits:sim.trace.hits,cores:sim.trace.combinerHits,actions,mirrors:sim.trace.impactEvents.filter(e=>e.type==='mirror'&&((e.x===6&&e.y===5)||(e.x===5&&e.y===4))).slice(0,12)})})`);
  return actions;
}
