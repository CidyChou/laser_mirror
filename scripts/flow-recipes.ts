import type { Recipe } from './puzzle-foundry';

// Keep the first twenty introductions intact, then alternate old puzzles and
// new medium-length routes. Original boards retain their order and identity.
export const flowPlan:Array<{old:number}|{flow:number;after:number}>=[];
let inserted=0;
for(let old=1;old<=130;old++){
  const wanted=Math.max(0,Math.floor((old-20)*70/110));
  while(inserted<wanted)flowPlan.push({flow:++inserted,after:old-1});
  flowPlan.push({old});
}

const families=[
  ['汇流','先接齐核心的两路输入，再沿粗光束安排出口。'],
  ['流光','沿固定镜分配支路，让几个终点接连亮起。'],
  ['跃迁','同色传送保持方向，把远处的光送回核心。'],
  ['启门','一条支路取钥，另一条完成聚合，再穿过光门。'],
  ['接棒','前一座核心的粗光束，接着为下一座核心供光。'],
  ['晶光','为晶体补齐方向，再把剩下的光送往出口。'],
  ['远送','先确认传送出口，再沿分光支路接通各个终点。'],
  ['双钥','找齐两枚钥匙，再接通门后的聚合光路。'],
  ['合奏','几束光各有去处，先保留已经接通的部分。'],
  ['回响','顺着固定镜的线索，让聚合光转过最后几个弯。'],
];
const places=['晴湾','竹径','云阶','星桥','长廊','月庭','虹港'];
export const flowRecipes=flowPlan.flatMap(entry=>{
  if(!('flow'in entry))return [];
  const {flow,after}=entry,index=(flow-1)%10;
  const recipe:Recipe={number:1000+flow,name:`${places[Math.floor((flow-1)/10)]}·${families[index][0]}`,hint:families[index][1],
    sources:3,splitters:2,combiners:1,size:after<31?7:8,
    minLive:9,maxLive:12,minClicks:flow<7?4:5,maxClicks:6,fixedCount:2,decoys:1};
  if(index===1){delete recipe.combiners;recipe.sources=2;recipe.splitters=3;}
  if(index===2&&after>=41)recipe.portals=1;
  if(index===3&&after>=31){recipe.keys=1;recipe.doors=1;}
  if(index===4&&after>=71){recipe.combiners=2;recipe.chain=true;recipe.sources=4;recipe.splitters=3;}
  if(index===5&&after>=61){recipe.focus=[2];recipe.sources=4;}
  if(index===6){delete recipe.combiners;if(after>=41)recipe.portals=1;}
  if(index===7&&after>=35){recipe.keys=2;recipe.doors=1;recipe.andLock=true;}
  if(index===8){recipe.sources=4;if(after>=61)recipe.focus=[2];}
  if(index===9){recipe.splitters=3;recipe.sources=2;}
  if(flow%5===0&&after>50)recipe.minClicks=6;
  // Early variants use only mechanics already introduced in the old campaign.
  const rename=(suffix:string,hint:string)=>{recipe.name=`${places[Math.floor((flow-1)/10)]}·${suffix}`;recipe.hint=hint;};
  if(index===2&&!recipe.portals)rename('折返',families[0][1]);
  if(index===3&&!recipe.keys)rename('交织',families[0][1]);
  if(index===4&&!recipe.chain)rename('双翼',families[0][1]);
  if(index===5&&!recipe.focus)rename('合光',families[0][1]);
  if(index===6&&!recipe.portals)rename('分送',families[1][1]);
  if(index===7&&!recipe.keys)rename('合流',families[0][1]);
  return [{id:flow,recipe}];
});
