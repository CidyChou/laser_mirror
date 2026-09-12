import type { Recipe } from './puzzle-foundry';

export const opticalRevisions = [18,20,28,30,38,40,48,50,58,60,68,70,82,88,92,99,104,108,112,118,124,128];
const names = ['双源汇光','汇光折返','交叉汇流','汇光迷阵','聚能取钥','双钥汇核','跃迁汇光','远端聚能','双翼汇流','错峰合光','晶核协作','双晶汇核','双核接力','聚光暗巷','汇光联锁','光域合奏','三岔汇核','跃迁接棒','分光汇阵','门锁晶核','异钥聚光','四路汇核'];
export const opticalRecipes: Recipe[] = opticalRevisions.map((number,index)=>{
  const early=number<31,late=number>100;
  const recipe:Recipe={number,name:names[index],hint:'先确认每座核心的不同方向输入，再沿粗光束检查输出与出口。',sources:early?2:3,splitters:early?1:2,combiners:1,size:early?7:8,minLive:early?7:late?9:8,maxLive:early?9:11,minClicks:early?4:5};
  if([38,40,92,99,118,124].includes(number)){recipe.keys=[40,92,124].includes(number)?2:1;recipe.doors=1;recipe.andLock=true;recipe.hint='聚合输入与钥匙支路都要接通，再追踪门后的粗光束。';}
  if([48,50,108].includes(number)){recipe.portals=1;recipe.hint='传送前后的方向保持不变，把缺少的一束光送入核心。';}
  if([68,70,104,118].includes(number)){recipe.focus=[2];recipe.sources=4;recipe.hint='聚合核心负责出光，晶体负责充能，两边都需要不同方向的输入。';}
  if(number===82){recipe.combiners=2;recipe.chain=true;recipe.sources=4;recipe.splitters=3;recipe.hint='第一座核心输出的粗光束，是第二座核心缺少的一路输入。';}
  return recipe;
});
