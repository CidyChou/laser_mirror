import assert from 'node:assert/strict';
import { computeGeometry, portPosition, portSize, portMuzzle, portClearance, borderPoint } from '../src/gameplay/geometry';
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
    const port:Port={side,index:0},position=portPosition(g,port,true),muzzle=portMuzzle(g,port),edge=borderPoint(g,port);
    const halfDepth=size*.16,halfLength=size*.42;
    const rx=side==='W'||side==='E'?halfDepth:halfLength,ry=side==='N'||side==='S'?halfDepth:halfLength;
    assert(position.x-rx>=0&&position.x+rx<=DESIGN_WIDTH,`${cols}×${rows} ${side}: port clipped horizontally`);
    assert(position.y-ry>=STAGE_TOP&&position.y+ry<=STAGE_TOP+STAGE_HEIGHT,`${cols}×${rows} ${side}: port clipped vertically`);
    // Check the full new bitmap footprint, including the emitter's muzzle,
    // against the stage edges at both small and large cell sizes.
    for(const emitter of [true,false]){
      const artPosition=portPosition(g,port,emitter);
      const artHeight=g.cell*.94,artWidth=emitter?g.cell*.4:artHeight*125/512;
      const centerX=emitter?size*.25-artWidth/2:0;
      for(const x of [centerX-artWidth/2,centerX+artWidth/2])for(const y of [-artHeight/2,artHeight/2]){
        const point=side==='W'?{x:artPosition.x+x,y:artPosition.y+y}
          :side==='E'?{x:artPosition.x-x,y:artPosition.y-y}
          :side==='N'?{x:artPosition.x-y,y:artPosition.y+x}
          :{x:artPosition.x+y,y:artPosition.y-x};
        assert(point.x>=0&&point.x<=DESIGN_WIDTH&&point.y>=STAGE_TOP&&point.y<=STAGE_TOP+STAGE_HEIGHT,
          `${cols}×${rows} ${side}: ${emitter?'emitter':'receiver'} artwork clipped`);
      }
    }
    assert(Math.abs(Math.hypot(muzzle.x-edge.x,muzzle.y-edge.y)-portClearance(g.cell))<1e-7);
    assert(portClearance(g.cell)-10>=14,'Emitter must clear the outer board frame by at least 14 design pixels');
    const receiver=portPosition(g,port);
    assert(Math.abs(Math.hypot(receiver.x-edge.x,receiver.y-edge.y)-(size*.25+9))<1e-7,'Receiver must keep its original spacing');
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
