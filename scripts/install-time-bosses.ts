import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { designBoss } from './time-boss-designs';
import type { LevelDefinition } from '../src/gameplay/types';

// Emits a reviewable patch for the separate boss file. The 130 numbered
// campaign levels are inputs only and are never replaced.
const file=resolve('src/levels/levels.json');
const levels=JSON.parse(readFileSync(file,'utf8')) as LevelDefinition[];
if(levels.length!==130)throw new Error('Expected 130 campaign levels');
const bosses=Array.from({length:13},(_,index)=>designBoss((index+1)*10,levels[index*10+9]).level);
console.log(JSON.stringify(bosses,null,2));
