import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { itemKey } from '../src/gameplay/levelAccess';
import type { Direction, LevelDefinition, LevelItem, Orientation } from '../src/gameplay/types';

export const simulator = new LaserSimulator();
export const isControl = (i: LevelItem) => !('fixed' in i && i.fixed) && ['mirror','splitter','combiner'].includes(i.type);
export const controlsOf = (items: LevelItem[]) => items.flatMap((item,index) => isControl(item) ? [index] : []);
export const valueOf = (item: LevelItem) => item.type === 'combiner' ? item.dir : item.type === 'mirror' || item.type === 'splitter' ? item.s : 0;
export function setValue(item: LevelItem, value: number) {
  if(item.type==='combiner')item.dir=value as Direction;
  if(item.type==='mirror'||item.type==='splitter')item.s=value as Orientation;
}
export function solved(level: LevelDefinition, items = level.items) {
  const trace = simulator.simulate(level,items,computeGeometry(level));
  return trace.hits.every(Boolean) && items.every(i=>i.type!=='focus'||trace.focusOn[itemKey(i.x,i.y)]);
}
export function seedRandom(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shuffle<T>(values: T[], random: () => number) {
  const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;
}

export function inspectLevel(level: LevelDefinition) {
  const controls=controlsOf(level.items),geometry=computeGeometry(level);
  const bits=controls.reduce((sum,i)=>sum+(level.items[i].type==='combiner'?2:1),0);
  if(bits>20)throw new Error(`${level.name}: ${bits} bits exceeds exact-audit budget`);
  const items=structuredClone(level.items),solutions:number[][]=[];
  let best:LevelItem[]|undefined,minClicks=Infinity;
  const oneGoalMisses:number[][]=[];
  for(let code=0;code<2**bits;code++){
    let rest=code,clicks=0;
    for(const i of controls){const size=items[i].type==='combiner'?4:2,value=rest%size;rest=Math.floor(rest/size);setValue(items[i],value);clicks+=(value-valueOf(level.items[i])+size)%size;}
    const trace=simulator.simulate(level,items,geometry);
    const missing=trace.hits.filter(x=>!x).length+items.filter(i=>i.type==='focus'&&!trace.focusOn[itemKey(i.x,i.y)]).length;
    if(!missing){solutions.push(controls.map(i=>valueOf(items[i])));if(clicks<minClicks){minClicks=clicks;best=structuredClone(items);}}
    else if(missing===1)oneGoalMisses.push(controls.map(i=>valueOf(items[i])));
  }
  const allFlip=structuredClone(level.items),mirrorFlip=structuredClone(level.items);
  for(const i of controls){setValue(allFlip[i],(valueOf(allFlip[i])+1)%(allFlip[i].type==='combiner'?4:2));if(mirrorFlip[i].type==='mirror')setValue(mirrorFlip[i],1-valueOf(mirrorFlip[i]));}
  const trace=best?simulator.simulate(level,best,geometry):null;
  const hitKeys=new Set(trace?.impactEvents.map(e=>itemKey(e.x??-1,e.y??-1)));
  const live=controls.filter(i=>hitKeys.has(itemKey(items[i].x,items[i].y)));
  const wrong=best?live.filter(i=>valueOf(level.items[i])!==valueOf(best![i])).length:0;
  const free=controls.filter((_,index)=>new Set(solutions.map(s=>s[index])).size>1);
  const near=best?oneGoalMisses.filter(state=>state.reduce((sum,v,index)=>sum+(v-valueOf(best![controls[index]])+(items[controls[index]].type==='combiner'?4:2))%(items[controls[index]].type==='combiner'?4:2),0)<=2).length:0;
  const decoys=controls.filter(i=>!live.includes(i));
  const tempting=new Set<number>();
  const bypassableMechanics:string[]=[];
  if(best)for(let index=0;index<best.length;index++){
    const item=best[index];
    if(!['door','combiner','portal'].includes(item.type))continue;
    const blocked=structuredClone(best);
    blocked[index]={type:'wall',x:item.x,y:item.y};
    if(solved(level,blocked))bypassableMechanics.push(`${item.type}:${item.x},${item.y}`);
  }
  if(best)for(const i of live){
    const altered=structuredClone(best);setValue(altered[i],(valueOf(altered[i])+1)%(altered[i].type==='combiner'?4:2));
    const wrongTrace=simulator.simulate(level,altered,geometry);
    for(const d of decoys)if(wrongTrace.impactEvents.some(e=>e.x===altered[d].x&&e.y===altered[d].y))tempting.add(d);
  }
  return {name:level.name,rows:level.rows,cols:level.cols,controls:controls.length,bits,solutions:solutions.length,
    minClicks:Number.isFinite(minClicks)?minClicks:null,live:live.length,correctLive:live.length-wrong,wrongLive:wrong,
    free:free.length,decoys:decoys.length,temptingDecoys:tempting.size,nearMisses:near,bypassableMechanics,
    effectiveBits:solutions.length?Math.round(Math.log2(2**bits/solutions.length)*10)/10:null,
    allFlipWins:solved(level,allFlip),mirrorFlipWins:solved(level,mirrorFlip),startsSolved:solved(level),
    mechanics:[...new Set(level.items.filter(i=>!['mirror','wall'].includes(i.type)).map(i=>i.type))].sort(),
    goals:level.targets.length+level.items.filter(i=>i.type==='focus').length,
    best,states:solutions,controlIndexes:controls,freeIndexes:free,liveIndexes:live};
}

/** Compare geometry under rotations/reflections, ignoring scramble and decorative walls. */
export function layoutSimilarity(a: LevelDefinition,b: LevelDefinition) {
  const signature=(level:LevelDefinition,rotate:number,flip:boolean)=>{
    const n=8,set=new Set<string>();
    for(const item of level.items){
      if(item.type==='wall'||('decoy' in item&&item.decoy))continue;
      let x=item.x,y=item.y;if(flip)x=n-1-x;
      for(let r=0;r<rotate;r++)[x,y]=[n-1-y,x];
      set.add(`${item.type}:${x},${y}`);
    }return set;
  };
  const first=signature(a,0,false);let max=0;
  for(let r=0;r<4;r++)for(const f of [false,true]){
    const second=signature(b,r,f),intersection=[...first].filter(x=>second.has(x)).length;
    max=Math.max(max,intersection/(first.size+second.size-intersection));
  }return max;
}
