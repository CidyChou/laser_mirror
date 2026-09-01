import type { LevelDefinition } from '../../src/gameplay/types';

const base={chapter:'光学效果校验',chapterNo:1,shots:5};
export const collectorFixture:LevelDefinition={...base,name:'收集 · 蓄力 · 释放',rows:6,cols:6,
  emitter:{side:'W',index:3},emitters:[{side:'W',index:3},{side:'N',index:2}],targets:[{side:'E',index:3}],
  items:[{type:'combiner',x:2,y:3,dir:0}]};
export const chainedFixture:LevelDefinition={...base,name:'两个集光器串联',rows:6,cols:6,
  emitter:{side:'W',index:1},emitters:[{side:'W',index:1},{side:'N',index:2},{side:'W',index:4}],targets:[{side:'E',index:4}],
  items:[{type:'combiner',x:2,y:1,dir:1},{type:'combiner',x:2,y:4,dir:0}]};
export const transportedFixture:LevelDefinition={...base,name:'强光 · 反射 · 传送 · 分光',rows:6,cols:7,
  emitter:{side:'W',index:1},emitters:[{side:'W',index:1},{side:'N',index:1}],targets:[{side:'E',index:4},{side:'S',index:5}],
  items:[{type:'combiner',x:1,y:1,dir:0},{type:'mirror',x:3,y:1,s:0},
    {type:'portal',x:3,y:2,pair:'P1'},{type:'portal',x:5,y:2,pair:'P1'},{type:'splitter',x:5,y:4,s:0}]};
export const boardFixture:LevelDefinition={...base,name:'棋盘与镜面',rows:6,cols:6,
  emitter:{side:'W',index:5},targets:[{side:'N',index:5}],
  items:[{type:'mirror',x:1,y:1,s:0},{type:'mirror',x:4,y:1,s:1},{type:'mirror',x:0,y:2,s:1},
    {type:'mirror',x:3,y:3,s:0},{type:'mirror',x:4,y:4,s:0},{type:'mirror',x:5,y:4,s:0},
    {type:'mirror',x:1,y:5,s:0},{type:'mirror',x:5,y:5,s:1}]};
