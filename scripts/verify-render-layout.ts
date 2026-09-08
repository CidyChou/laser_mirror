import assert from 'node:assert/strict';
import { computeGeometry, portPosition, portSize, portMuzzle, borderPoint } from '../src/gameplay/geometry';
import { DESIGN_WIDTH, STAGE_TOP, STAGE_HEIGHT } from '../src/config/GameConfig';
import { beamSegments } from '../src/rendering/beamGeometry';
import solutions from '../tools/visual/campaign-solutions.json';
import { focusNeed } from '../src/gameplay/levelAccess';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import type { LevelDefinition, Port } from '../src/gameplay/types';

const sim=new LaserSimulator();
let cases=0;
for(const cols of [3,4,6,8,9,12])for(const rows of [3,6,9,12]){
  const level:LevelDefinition={name:'layout',chapter:'test',chapterNo:1,cols,rows,shots:5,emitter:{side:'W',index:0},targets:[],items:[]};
  const g=computeGeometry(level),size=portSize(g.cell);
  for(const side of ['W','E','N','S'] as const){
    const port:Port={side,index:0},position=portPosition(g,port),muzzle=portMuzzle(g,port),edge=borderPoint(g,port);
    const halfDepth=size*.16,halfLength=size*.42;
    const rx=side==='W'||side==='E'?halfDepth:halfLength,ry=side==='N'||side==='S'?halfDepth:halfLength;
    assert(position.x-rx>=0&&position.x+rx<=DESIGN_WIDTH,`${cols}×${rows} ${side}: port clipped horizontally`);
    assert(position.y-ry>=STAGE_TOP&&position.y+ry<=STAGE_TOP+STAGE_HEIGHT,`${cols}×${rows} ${side}: port clipped vertically`);
    assert(Math.abs(Math.hypot(muzzle.x-edge.x,muzzle.y-edge.y)-9)<1e-7);
    // The nozzle's tip is the innermost point of both port silhouettes.
    assert(side==='W'?muzzle.x<g.ox:side==='E'?muzzle.x>g.ox+g.boardW:side==='N'?muzzle.y<g.oy:muzzle.y>g.oy+g.boardH);
    level.emitter=port;level.targets=[{side:({W:'E',E:'W',N:'S',S:'N'} as const)[side],index:0}];
    const trace=sim.simulate(level,[],g),before=JSON.stringify(trace.segments),render=beamSegments(trace,level,g);
    assert.equal(JSON.stringify(trace.segments),before,'Presentation must not mutate simulation segments');
    assert.deepEqual({x:render[0].x1,y:render[0].y1},muzzle);
    const last=render.at(-1)!;assert.deepEqual({x:last.x2,y:last.y2},portPosition(g,level.targets[0]));
    assert.deepEqual(render.map(s=>[s.startDist,s.endDist,s.branch,s.widthScale]),trace.segments.map(s=>[s.startDist,s.endDist,s.branch,s.widthScale]));
    cases++;
  }
}
console.log(`Render layout verified: ${cases} board/port combinations; all ports outside cells and inside stage, beam endpoints connected, simulation traces untouched.`);

for(const [number,level] of Object.entries(solutions)){
  const fixture=level as LevelDefinition,trace=sim.simulate(fixture,fixture.items,computeGeometry(fixture));
  assert(trace.hits.every(Boolean),`Level ${number}: target outcome changed after layout adjustment`);
  for(const item of fixture.items)if(item.type==='focus')assert((trace.focusHits[`${item.x},${item.y}`]??0)>=focusNeed(item),`Level ${number}: focus outcome changed`);
}
console.log(`Campaign layout verified: all ${Object.keys(solutions).length} solved levels still connect.`);
