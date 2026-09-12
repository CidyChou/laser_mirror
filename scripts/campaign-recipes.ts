import type { Recipe } from './puzzle-foundry';
import { opticalRecipes } from './optical-recipes';

// Different objectives/branches/source counts are intentional; no level is a
// rotated copy or an added entry corridor around a previous board.
const originalNewRecipes:Recipe[]=[
  {number:101,name:'岔口留镜',hint:'先追两条出口，再决定哪些镜面应当保留。',sources:2,splitters:2,fixed:true},
  {number:102,name:'隔墙取钥',hint:'开门的支路藏在墙的另一边。',sources:2,splitters:2,keys:2,doors:2},
  {number:103,name:'折返航道',hint:'跃迁前后的光仍然沿同一方向行进。',sources:2,splitters:2,portals:1},
  {number:104,name:'三岔晶阵',hint:'晶体需要不同方向的光，其余支路继续寻找出口。',sources:3,splitters:2,focus:[2]},
  {number:105,name:'借光开门',hint:'先找聚合点的输入，再核对门锁需要的供能。',sources:3,splitters:2,combiners:1,keys:1,doors:1},
  {number:106,name:'真假近路',hint:'靠近终点的镜子不一定在正确路线上。',sources:1,splitters:3,size:7},
  {number:107,name:'双钥同锁',hint:'两枚钥匙都要接通，门前的光可以等待。',sources:2,splitters:3,keys:2,doors:1,andLock:true},
  {number:108,name:'交叉跃迁',hint:'先用颜色配对，再追踪每一束光的去向。',sources:2,splitters:2,portals:2},
  {number:109,name:'双晶分账',hint:'分配两颗晶体的入射方向，别把光浪费在同一路上。',sources:4,splitters:3,focus:[2,2]},
  {number:110,name:'汇流岔道',hint:'聚合之前凑齐输入，聚合之后仍要选路。',sources:3,splitters:3,combiners:1},
  {number:111,name:'远端回钥',hint:'别漏掉远端的钥匙，按颜色追踪传送前后的方向。',sources:2,splitters:2,portals:1,keys:2,doors:2},
  {number:112,name:'分光暗巷',hint:'有些镜子只会把你引进死路。',sources:1,splitters:4,fixed:true},
  {number:113,name:'跃迁补光',hint:'借助跃迁，从另一个方向补足晶体。',sources:3,splitters:2,portals:1,focus:[2]},
  {number:114,name:'三钥密室',hint:'逐一追踪三枚钥匙，主路最后才能贯通。',sources:3,splitters:3,keys:3,doors:1,andLock:true},
  {number:115,name:'双核接棒',hint:'前一座核心的输出，成为后一座核心的输入。',sources:4,splitters:3,combiners:2,chain:true},
  {number:116,name:'四向折返',hint:'四束光共享镜阵，转动一面镜子可能改变另一条路。',sources:4,splitters:1,size:7},
  {number:117,name:'三色迷航',hint:'三组传送各有目的地，颜色相同才是一对。',sources:3,splitters:2,portals:3},
  {number:118,name:'门锁双晶',hint:'门锁与双晶都要顾及，先追踪两颗晶体的入射方向。',sources:4,splitters:3,focus:[2,2],keys:1,doors:1},
  {number:119,name:'汇核远送',hint:'聚合输出与传送支路都要找到去向，别把出射方向弄反。',sources:3,splitters:2,combiners:1,portals:1},
  {number:120,name:'三向合璧',hint:'三束不同方向的入射，才能把这颗晶体充满。',sources:4,splitters:3,focus:[3]},
  {number:121,name:'镜中旁路',hint:'把已接通的部分留下，寻找真正缺失的转折。',sources:2,splitters:3,fixed:true},
  {number:122,name:'双域取钥',hint:'两组跃迁与两枚钥匙共同决定门后的路线。',sources:3,splitters:2,portals:2,keys:2,doors:1,andLock:true},
  {number:123,name:'晶核分工',hint:'聚合点负责输出，晶体负责收集，不要混淆两者的任务。',sources:4,splitters:3,combiners:1,focus:[2]},
  {number:124,name:'多门异钥',hint:'看清每扇门的字母，再为对应的开关接光。',sources:3,splitters:3,keys:3,doors:3},
  {number:125,name:'环路分流',hint:'一次分光能打开更多路，也可能把光带回原处。',sources:1,splitters:4,portals:1},
  {number:126,name:'双核异向',hint:'两座聚合点分别承担自己的出光方向。',sources:4,splitters:3,combiners:2},
  {number:127,name:'双晶换位',hint:'传送改变位置，为两颗晶体补上不同方向的光。',sources:4,splitters:3,portals:1,focus:[2,2]},
  {number:128,name:'四出口博弈',hint:'从出口反推镜面，把看似合理的岔路排除。',sources:2,splitters:4},
  {number:129,name:'三域联锁',hint:'先追踪三组颜色，再完成多条件门锁。',sources:3,splitters:3,portals:3,keys:2,doors:1,andLock:true},
  {number:130,name:'光路终局',hint:'取钥、聚合与晶体充能，三件事需要同时成立。',sources:4,splitters:3,combiners:1,focus:[2],keys:2,doors:1,andLock:true},
];

const originalRepairRecipes:Recipe[]=[
  {number:12,name:'照亮两边',hint:'先找公共路段，再分配两条出口。',sources:1,splitters:1,size:6,minLive:5,maxLive:7,minClicks:3},
  {number:13,name:'固定分支',hint:'固定镜提供线索，可动镜仍需要取舍。',sources:1,splitters:1,size:6,minLive:6,maxLive:8,minClicks:3,fixed:true},
  {number:32,name:'保持通电',hint:'保留供能支路，同时寻找门后的出口。',sources:1,splitters:1,size:6,minLive:5,maxLive:7,minClicks:3,keys:1,doors:1},
  {number:33,name:'双重验证',hint:'两枚开关都要供能，主路才会畅通。',sources:1,splitters:2,size:6,minLive:6,maxLive:8,minClicks:3,keys:2,doors:1,andLock:true},
  {number:34,name:'连锁门',hint:'门锁有不同的钥匙，逐一追踪供能来源。',sources:1,splitters:2,size:7,minLive:7,maxLive:9,minClicks:4,keys:2,doors:2},
  {number:37,name:'旁路供能',hint:'绕行的光既要触发机关，也要保住出口。',sources:1,splitters:2,size:7,minLive:7,maxLive:9,minClicks:4,keys:1,doors:1},
  {number:38,name:'双节点认证',hint:'两条支路各有职责，不要只顾其中一枚钥匙。',sources:1,splitters:2,size:7,minLive:7,maxLive:10,minClicks:4,keys:2,doors:1,andLock:true},
  {number:39,name:'双门回路',hint:'认清开关字母，先找两扇门之间的联系。',sources:1,splitters:2,minLive:8,maxLive:10,minClicks:4,keys:2,doors:2},
  {number:40,name:'三相供能',hint:'三路供能需要兼顾，只有出口亮起还不够。',sources:1,splitters:3,minLive:8,maxLive:11,minClicks:4,keys:3,doors:1,andLock:true},
  {number:42,name:'跃迁之后',hint:'用同色传送门把前后两段光路连起来。',sources:1,splitters:1,size:6,minLive:5,maxLive:7,minClicks:3,portals:1},
  {number:43,name:'穿过封锁',hint:'墙挡住的方向，可能需要从传送出口重新抵达。',sources:1,splitters:1,size:7,minLive:6,maxLive:8,minClicks:3,portals:1},
  {number:44,name:'分流跃迁',hint:'分出去的光也有出口，先按颜色追踪去向。',sources:1,splitters:2,size:7,minLive:7,maxLive:9,minClicks:4,portals:1},
  {number:45,name:'光之网络',hint:'跃迁把供能和主路连成一个整体。',sources:1,splitters:2,minLive:8,maxLive:10,minClicks:4,portals:1,keys:1,doors:2},
  {number:50,name:'光域核心',hint:'双重跃迁与门锁共用光路，逐个确认关键分支。',sources:2,splitters:2,portals:2,keys:2,doors:2},
  {number:52,name:'窄缝双路',hint:'两束光共享窄缝，先排除会走入死路的镜面。',sources:2,splitters:1,size:6,minLive:6,maxLive:8,minClicks:3},
  {number:54,name:'迷宫双源',hint:'两束光要分别找到出路，也可能共用一段走廊。',sources:2,splitters:1,size:7,minLive:7,maxLive:9,minClicks:4},
  {number:58,name:'回廊双源',hint:'折回来的光不一定走错，看看它是否通往另一个出口。',sources:2,splitters:2,size:7,minLive:7,maxLive:10,minClicks:4},
  {number:59,name:'三源迷宫',hint:'三束输入穿过不同的窄路，保留已经对齐的部分。',sources:3,splitters:1,size:7,minLive:7,maxLive:10,minClicks:4},
  {number:60,name:'双翼终章',hint:'出口分布在不同方向，不能只按一条光路调整。',sources:2,splitters:2,minLive:8,maxLive:11,minClicks:4},
  {number:63,name:'分光充能',hint:'分光以后分别寻找晶体的两个入射方向。',sources:2,splitters:2,size:7,minLive:6,maxLive:8,minClicks:3,focus:[2]},
  {number:67,name:'交叉充能',hint:'同一片镜阵同时承担晶体充能和出口任务。',sources:3,splitters:1,size:7,minLive:7,maxLive:10,minClicks:4,focus:[2]},
  {number:72,name:'转向聚合',hint:'输入凑齐之后，输出箭头还要对准真正的目标。',sources:3,splitters:1,size:7,minLive:6,maxLive:8,minClicks:3,combiners:1},
  {number:74,name:'错位输入',hint:'两条输入从不同方向抵达，别把输出当成输入。',sources:3,splitters:1,minLive:7,maxLive:10,minClicks:4,combiners:1},
  {number:78,name:'晶核交错',hint:'同时检查聚合点的输入和晶体的入射方向。',sources:4,splitters:2,minLive:8,maxLive:11,minClicks:4,combiners:1,focus:[2]},
  {number:92,name:'双门互锁',hint:'两条供能路线控制不同的门，先确认字母配对。',sources:2,splitters:3,keys:2,doors:2},
  {number:96,name:'四源矩阵',hint:'四束输入分担聚合与双晶充能，先确认各自的去向。',sources:4,splitters:2,combiners:1,focus:[2,2]},
  {number:98,name:'双分光回路',hint:'分光把供能和出口连成回路，每条支路都要考虑。',sources:3,splitters:3,combiners:1,keys:1,doors:1},
  {number:99,name:'光域迷城',hint:'跃迁、取钥和充能交织在同一片紧凑镜阵中。',sources:3,splitters:2,portals:2,focus:[2],keys:2,doors:1,andLock:true},
  {number:100,name:'终极光域',hint:'两座核心共享支路，最终还要把晶体充满。',sources:4,splitters:3,combiners:2,focus:[2]},
];

const updated = new Map(opticalRecipes.map(recipe=>[recipe.number,recipe]));
export const newRecipes = originalNewRecipes.map(recipe=>updated.get(recipe.number)??recipe);
export const repairRecipes = [...originalRepairRecipes.filter(recipe=>!updated.has(recipe.number)),...opticalRecipes.filter(recipe=>recipe.number<=100)].sort((a,b)=>a.number-b.number);
