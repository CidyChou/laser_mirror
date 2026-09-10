import { computeGeometry } from '../src/gameplay/geometry';
import { itemKey } from '../src/gameplay/levelAccess';
import type { Direction, LaserTrace, LevelDefinition, LevelItem, Port } from '../src/gameplay/types';
import { controlsOf, inspectLevel, isControl, layoutSimilarity, seedRandom, setValue, shuffle, simulator, solved, valueOf } from './level-quality';

export type Recipe={number:number;name:string;hint:string;sources:number;splitters:number;portals?:number;focus?:number[];combiners?:number;chain?:boolean;keys?:number;doors?:number;andLock?:boolean;size?:number;minLive?:number;maxLive?:number;minClicks?:number;fixed?:boolean};
type Cell={x:number;y:number;dirs:Set<number>;wide:boolean};
function crossed(level:LevelDefinition,trace:LaserTrace){
  const g=computeGeometry(level),cells=new Map<string,Cell>();
  for(const s of trace.segments){
    const fx=(s.x2-g.ox)/g.cell-.5,fy=(s.y2-g.oy)/g.cell-.5,x=Math.round(fx),y=Math.round(fy);
    if(Math.abs(fx-x)>.01||Math.abs(fy-y)>.01||x<0||y<0||x>=level.cols||y>=level.rows)continue;
    const dir=s.x2>s.x1?0:s.y2>s.y1?1:s.x2<s.x1?2:3;
    const c=cells.get(itemKey(x,y))??{x,y,dirs:new Set<number>(),wide:false};
    c.dirs.add(dir);c.wide ||= (s.widthScale??1)>1;cells.set(itemKey(x,y),c);
  }return cells;
}
function simulate(level:LevelDefinition){return simulator.simulate(level,level.items,computeGeometry(level));}
const occupied=(level:LevelDefinition,x:number,y:number)=>level.items.some(i=>i.x===x&&i.y===y);

/** Start-state randomness is seeded per level, independent of item order.
 * We evaluate distance to EVERY winning state, including legitimate alternate routes. */
export function scramble(level:LevelDefinition,seed:number,minClicks=4){
  const audit=inspectLevel(level);if(!audit.best)throw new Error(`${level.name} has no solution`);
  const random=seedRandom(seed),controls=audit.controlIndexes;
  const wanted=Math.max(minClicks,Math.min(9,Math.round(audit.live*.53)));
  let selected:LevelItem[]|undefined,lowest=Infinity;
  for(let attempt=0;attempt<500;attempt++){
    const items=structuredClone(audit.best),active=shuffle(audit.liveIndexes,random);
    const count=Math.max(2,Math.min(active.length-2,Math.round(active.length*(.40+random()*.24))));
    for(const i of active.slice(0,count)){const size=items[i].type==='combiner'?4:2;setValue(items[i],(valueOf(items[i])+1+Math.floor(random()*(size-1)))%size);}
    for(const i of controls.filter(i=>!active.includes(i)))setValue(items[i],Math.floor(random()*(items[i].type==='combiner'?4:2)));
    let closest=Infinity,bestState:number[]=[];
    for(const state of audit.states){
      const distance=state.reduce((sum,v,j)=>{const i=controls[j],size=items[i].type==='combiner'?4:2;return sum+(v-valueOf(items[i])+size)%size;},0);
      if(distance<closest){closest=distance;bestState=state;}
    }
    if(closest<minClicks)continue;
    const retained=audit.liveIndexes.filter(i=>valueOf(items[i])===bestState[controls.indexOf(i)]).length;
    if(retained<Math.min(3,Math.floor(active.length/3)))continue;
    const flipped=structuredClone(items),mirrors=structuredClone(items);
    for(const i of controls){setValue(flipped[i],(valueOf(flipped[i])+1)%(flipped[i].type==='combiner'?4:2));if(mirrors[i].type==='mirror')setValue(mirrors[i],1-valueOf(mirrors[i]));}
    if(solved(level,flipped)||solved(level,mirrors))continue;
    const score=Math.abs(closest-wanted)+random()*.2;
    if(score<lowest){selected=items;lowest=score;}
    if(lowest<.05)break;
  }
  if(!selected)throw new Error(`${level.name}: no mixed scramble at ${minClicks}+ clicks`);
  return {...level,items:shuffle(selected,random)};
}

export function forge(recipe:Recipe,others:LevelDefinition[]){
  const random=seedRandom(recipe.number*8191+20260906),n=recipe.size??8;
  const minLive=recipe.minLive??9;
  for(let attempt=0;attempt<16000;attempt++){
    const cells=shuffle(Array.from({length:n*n},(_,i)=>({x:i%n,y:Math.floor(i/n)})),random);
    const ports=shuffle((['N','E','S','W'] as const).flatMap(side=>Array.from({length:n},(_,index)=>({side,index}))),random);
    const emitters=ports.slice(0,recipe.sources),items:LevelItem[]=[];
    const controlCount=Math.min(n*n-8,18+recipe.splitters);
    for(let i=0;i<controlCount;i++)items.push({type:i<recipe.splitters?'splitter':'mirror',...cells[i],s:random()<.5?0:1});
    const level:LevelDefinition={name:recipe.name,chapter:recipe.number<=110?'岔路迷阵':recipe.number<=120?'机关织网':'光路博弈',chapterNo:Math.ceil(recipe.number/10),rows:n,cols:n,emitter:emitters[0],emitters,targets:[],shots:3,hint:recipe.hint,items};
    if(recipe.number>100)level.mode='challenge';
    let trace=simulate(level),failed=false;
    for(let p=0;p<(recipe.portals??0);p++){
      const live=shuffle([...crossed(level,trace).values()].filter(c=>!occupied(level,c.x,c.y)),random);
      const vacant=shuffle(cells.filter(c=>!occupied(level,c.x,c.y)),random);
      const first=live[0],other=vacant.find(c=>first&&Math.abs(c.x-first.x)+Math.abs(c.y-first.y)>=4);
      if(!first||!other){failed=true;break;}
      items.push({type:'portal',x:first.x,y:first.y,pair:`P${p+1}`},{type:'portal',x:other.x,y:other.y,pair:`P${p+1}`});trace=simulate(level);
    }
    if(failed)continue;
    for(let k=0;k<(recipe.combiners??0);k++){
      const junction=shuffle([...crossed(level,trace).values()].filter(c=>c.dirs.size>=2&&!occupied(level,c.x,c.y)&&(!recipe.chain||k===0||c.wide)),random)[0];
      if(!junction){failed=true;break;}
      const dirs=shuffle([0,1,2,3] as Direction[],random);
      let accepted=false;
      for(const dir of dirs){
        const item:LevelItem={type:'combiner',x:junction.x,y:junction.y,dir,need:2};items.push(item);
        const next=simulate(level);
        if(Object.values(next.combinerOn).filter(Boolean).length===k+1&&next.exits.length){trace=next;accepted=true;break;}
        items.pop();
      }
      if(!accepted){failed=true;break;}
    }
    if(failed)continue;
    for(const need of recipe.focus??[]){
      const junction=shuffle([...crossed(level,trace).values()].filter(c=>c.dirs.size>=need&&!occupied(level,c.x,c.y)),random)[0];
      if(!junction){failed=true;break;}
      items.push({type:'focus',x:junction.x,y:junction.y,need});trace=simulate(level);
      if(!Object.values(trace.focusOn).every(Boolean)){failed=true;break;}
    }
    if(failed)continue;
    if(recipe.keys){
      const available=shuffle([...crossed(level,trace).values()].filter(c=>!occupied(level,c.x,c.y)),random);
      const needed=recipe.keys+(recipe.doors??1);if(available.length<needed)continue;
      for(let k=0;k<recipe.keys;k++)items.push({type:'switch',x:available[k].x,y:available[k].y,id:String.fromCharCode(65+k)});
      for(let d=0;d<(recipe.doors??1);d++){
        const c=available[recipe.keys+d],requires=recipe.andLock?Array.from({length:recipe.keys},(_,i)=>String.fromCharCode(65+i)):[String.fromCharCode(65+d%recipe.keys)];
        items.push({type:'door',x:c.x,y:c.y,id:`D${d+1}`,requires});
      }
      trace=simulate(level);
      if(!Object.values(trace.doorStates).every(Boolean))continue;
    }
    const sourceKeys=new Set(emitters.map(p=>`${p.side}:${p.index}`));
    const unique=new Map(trace.exits.map(p=>[`${p.side}:${p.index}`,p]));
    level.targets=[...unique.entries()].filter(([key])=>!sourceKeys.has(key)).map(([,p])=>p);
    if(level.targets.length+(recipe.focus?.length??0)<2||level.targets.length>6)continue;
    if(!solved(level))continue;
    const hits=new Set(trace.impactEvents.map(e=>itemKey(e.x??-1,e.y??-1)));
    level.items=items.filter(i=>!isControl(i)||hits.has(itemKey(i.x,i.y)));
    const controls=controlsOf(level.items),bits=controls.reduce((s,i)=>s+(level.items[i].type==='combiner'?2:1),0);
    if(controls.length<minLive||controls.length>(recipe.maxLive??13)||bits>13)continue;
    if(level.items.filter(i=>i.type==='splitter').length<Math.min(2,recipe.splitters))continue;
    if(level.items.filter(i=>i.type==='portal').some(i=>!trace.impactEvents.some(e=>e.type==='portal'&&e.pair===i.pair)))continue;
    if(recipe.combiners&&Object.values(trace.combinerOn).filter(Boolean).length!==recipe.combiners)continue;
    const used=crossed(level,trace);
    const temptations=new Map<string,{x:number;y:number}>();
    for(const i of controls){
      const alternate=structuredClone(level);setValue(alternate.items[i],(valueOf(alternate.items[i])+1)%(alternate.items[i].type==='combiner'?4:2));
      for(const cell of crossed(alternate,simulate(alternate)).values()){
        if(!used.has(itemKey(cell.x,cell.y))&&!occupied(level,cell.x,cell.y))temptations.set(itemKey(cell.x,cell.y),{x:cell.x,y:cell.y});
      }
    }
    const candidates=shuffle([...temptations.values()],random);
    if(candidates.length<2)continue;
    for(const cell of candidates.slice(0,2))level.items.push({type:'mirror',...cell,s:random()<.5?0:1,decoy:true});
    const walls=shuffle(cells.filter(c=>!used.has(itemKey(c.x,c.y))&&!occupied(level,c.x,c.y)),random);
    for(const cell of walls.slice(0,3+Math.floor(random()*4)))level.items.push({type:'wall',...cell});
    if(recipe.fixed){const mirror=shuffle(level.items.filter(i=>i.type==='mirror'&&!i.decoy),random)[0];if(mirror&&mirror.type==='mirror')mirror.fixed=true;}
    if(others.some(other=>layoutSimilarity(level,other)>.48))continue;
    const audit=inspectLevel(level);
    if(!audit.best||audit.live<minLive-(recipe.fixed?1:0)||audit.temptingDecoys<1||audit.solutions>32||(audit.effectiveBits??0)<minLive-2||audit.bypassableMechanics.length)continue;
    try{
      const result=scramble(level,recipe.number*65537,recipe.minClicks??5);
      const final=inspectLevel(result);
      if(final.bypassableMechanics.length||final.temptingDecoys<1)continue;
      console.log(`Forged #${recipe.number} ${recipe.name}, attempts=${attempt+1}, live=${audit.live}, decoys=${audit.temptingDecoys}, solutions=${audit.solutions}`);
      return result;
    }catch{continue;}
  }
  throw new Error(`Unable to forge #${recipe.number} ${recipe.name}`);
}
