import type { LevelDefinition, LevelItem, TimeBossRules } from '../src/gameplay/types';
import { computeGeometry } from '../src/gameplay/geometry';
import { laserMsAtDistance, TIME_BOSS_SPEED_SCALE } from '../src/gameplay/laserTiming';

const mirror=(x:number,y:number,s:0|1,fixed=true):LevelItem=>({type:'mirror',x,y,s,fixed});
const split=(x:number,y:number,s:0|1):LevelItem=>({type:'splitter',x,y,s,fixed:true});
const rules=(adjustmentUses:number,rewindUses=0,rewindCells:2|3|4=2):TimeBossRules=>({adjustmentUses,bulletTimeUses:0,rewindUses,...(rewindUses?{rewindCells}:{}),firstFailureFree:true});
export type BossAction={at:number;skill:'adjust'|'rewind';rotate:Array<[number,number]>};
export type BossDesign={level:LevelDefinition;actions:BossAction[]};

/** Reviewed circuit primitives. The loop feeds separate pulses to the same
 * entry side of the movable optic; its two outputs cannot coexist statically. */
export function designBoss(number:number,original:LevelDefinition):BossDesign {
  const level:LevelDefinition={...original,rows:8,cols:8,emitter:{side:'W',index:3},emitters:undefined,
    targets:[{side:'S',index:3},{side:'N',index:3}],
    items:[split(1,3,0),mirror(1,6,1),mirror(0,6,0),mirror(0,0,1),mirror(1,0,0),mirror(3,3,0,false)],
    timeBoss:rules(number<=20?2:1),hint:'先点亮一端，再使用技能旋转中央镜，让下一批光束照亮另一端。'};
  let actions:BossAction[]=[{at:4500,skill:'adjust',rotate:[[3,3]]}];
  const names=['镜阵·换轨','双翼·错拍','逆行回廊','三相·延时门','光域·跃迁回环','双翼·错峰','双核·交叉充能','聚合·二次点火','机关交响·变奏','终极光域·三幕','汇流岔道·三换轨','三向合璧·时序','光路终局·时间闭环'];
  level.name=names[number/10-1];
  if(number===10){level.cols=5;}
  if(number===20){
    level.items.push(mirror(3,1,1),mirror(6,1,0));
    level.targets=[{side:'S',index:3},{side:'S',index:6}];
  }
  if(number===30){level.timeBoss=rules(2,2,2);actions=[{at:9000,skill:'rewind',rotate:[[3,3]]}];}
  if(number===40){
    level.items.push({type:'switch',x:3,y:5,id:'A'},{type:'door',x:3,y:1,id:'A',requires:['A']});
    level.hint='先让下行光束打开 A 门；后续光束需要转向门后的终点。';
  }
  if(number===50){
    level.items.push({type:'portal',x:0,y:5,pair:'time'},{type:'portal',x:0,y:2,pair:'time'});
    level.hint='回环中的传送门缩短了间隔。先让第一束通过，再为返回的光换向。';
  }
  if(number===60){
    level.emitters=[level.emitter,{side:'S',index:0}];
    level.hint='两束输入汇入同一条回路。保留第一次反射，再为后续光束换向。';
  }
  if(number===70||number===80){
    level.targets=[];
    level.items.push(mirror(3,1,1),mirror(5,1,0),mirror(3,5,0));
    if(number===70)level.items.push({type:'focus',x:5,y:5,need:2});
    else{
      level.items.push({type:'combiner',x:5,y:5,need:2,dir:0,fixed:true});
      level.targets=[{side:'E',index:5}];level.timeBoss=rules(1,1,2);
      actions=[{at:9000,skill:'rewind',rotate:[[3,3]]}];
    }
    level.hint='中央镜要分别服务两批光，从左侧和上方为核心提供不同方向的输入。';
  }
  if(number>=90){
    level.targets=[{side:'N',index:3},{side:'W',index:4},{side:'E',index:4}];
    (level.items.at(-1) as Extract<LevelItem,{type:'mirror'}>).s=1;
    level.items.push(mirror(3,6,0),mirror(5,6,1),mirror(5,4,0,false));
    level.timeBoss=number===90?rules(2,1,3):number===110?rules(2):number===130?rules(4,2,4):number===120?rules(3,1,4):rules(3,1,3);
    actions=[{at:4500,skill:'adjust',rotate:[[3,3]]},{at:21000,skill:number===110?'adjust':'rewind',rotate:[[5,4]]}];
    level.hint='先完成上方目标，再把后续光束交给右侧镜面；右侧镜面也需要分两次服务出口。';
    if(number===90||number===130){
      level.items.push({type:'switch',x:3,y:1,id:'A'},{type:'door',x:6,y:4,id:'A',requires:['A']});
    }
    if(number===90){
      level.targets=[{side:'W',index:4},{side:'E',index:4}];
      level.emitters=[level.emitter,{side:'E',index:0},{side:'N',index:7}];
      level.items.push({type:'focus',x:3,y:0,need:2},{type:'combiner',x:7,y:4,need:2,dir:0,fixed:true},
        {type:'portal',x:0,y:5,pair:'time'},{type:'portal',x:0,y:2,pair:'time'});
    }
    if(number===100||number===130){
      level.items.push({type:'portal',x:4,y:6,pair:'relay'},{type:'portal',x:4,y:7,pair:'relay'});
      // Redirect the lower relay onto the displaced portal exit row.
      level.items=level.items.filter(i=>!(i.x===5&&i.y===6));
      level.items.push(mirror(5,7,1));
    }
    if(number===100||number===120||number===130){
      level.targets=[{side:'N',index:3},{side:'W',index:4},{side:'W',index:5},{side:'E',index:5}];
      // Six cells separate the last controls: a recovery window cannot service
      // both consecutive collisions and silently replace two intended skills.
      level.items.push(mirror(7,4,0),mirror(7,6,1),mirror(6,6,0),mirror(6,5,0,false));
      actions=[{at:4500,skill:'adjust',rotate:[[3,3]]},{at:15500,skill:'adjust',rotate:[[5,4]]},{at:30000,skill:'rewind',rotate:[[6,5]]}];
    }
    if(number===120){
      level.targets=[{side:'W',index:4}];
      level.items=level.items.filter(i=>!((i.x===7&&[4,6].includes(i.y))||(i.x===6&&i.y===6)));
      level.items.push(mirror(7,4,1),mirror(7,1,0),mirror(6,1,1),mirror(3,0,1),mirror(4,0,0),mirror(2,5,0),mirror(2,2,1),mirror(7,5,0),mirror(7,7,1),mirror(4,7,0),{type:'focus',x:4,y:2,need:3});
      level.hint='先从上方为三向晶体充能，再完成左侧出口；最后两批光需要从晶体左侧、右侧分别进入。';
    }
    if(number===130){
      level.targets=[{side:'N',index:3},{side:'W',index:4},{side:'E',index:5},{side:'N',index:4}];
      (level.items.find(i=>i.x===6&&i.y===5) as Extract<LevelItem,{type:'mirror'}>).s=1;
      level.items.push(mirror(2,5,0),mirror(2,1,1),mirror(4,1,0,false),{type:'focus',x:4,y:3,need:2});
      actions.push({at:42000,skill:'rewind',rotate:[[4,1]]});
    }
    if(number===100){
      level.emitters=[level.emitter,{side:'N',index:2}];
      level.items.push({type:'combiner',x:2,y:5,need:2,dir:2,fixed:true});
    }
    if(number===130){
      level.emitters=[level.emitter,{side:'E',index:0},{side:'E',index:3}];
      level.items.push({type:'combiner',x:4,y:0,need:2,dir:3,fixed:true},{type:'switch',x:3,y:2,id:'B'});
      (level.items.find(i=>i.type==='door') as Extract<LevelItem,{type:'door'}>).requires=['A','B'];
    }
  }
  const legacySpeed=computeGeometry(level).cell*.002;
  actions=actions.map(action=>({...action,at:laserMsAtDistance(action.at*legacySpeed,TIME_BOSS_SPEED_SCALE)}));
  // The accelerated curve plus optical pause distances shifts the final
  // rewind window slightly on the two longest multi-stage boards.
  if(number===120)actions[actions.length-1].at+=175;
  if(number===130)actions[actions.length-1].at+=450;
  return{level,actions};
}
