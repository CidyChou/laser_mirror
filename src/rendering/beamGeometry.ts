import { borderPoint, portMuzzle, portPosition } from '@/gameplay/geometry';
import { levelEmitters } from '@/gameplay/levelAccess';
import type { BoardGeometry, LaserSegment, LaserTrace, LevelDefinition, Point } from '@/gameplay/types';

/** Extend only the rendered endpoints; puzzle travel distances and timing stay intact. */
export function beamSegments(trace:LaserTrace,level:LevelDefinition,g:BoardGeometry):LaserSegment[]{
  const emitters=levelEmitters(level).map(port=>({edge:borderPoint(g,port),tip:portMuzzle(g,port)}));
  const targets=level.targets.map(port=>({edge:borderPoint(g,port),lens:portPosition(g,port)}));
  const near=(x:number,y:number,p:Point)=>Math.hypot(x-p.x,y-p.y)<.01;
  return trace.segments.map(segment=>{
    const source=segment.startDist===0?emitters.find(p=>near(segment.x1,segment.y1,p.edge)):undefined;
    const target=targets.find(p=>near(segment.x2,segment.y2,p.edge));
    return{...segment,x1:source?.tip.x??segment.x1,y1:source?.tip.y??segment.y1,
      x2:target?.lens.x??segment.x2,y2:target?.lens.y??segment.y2};
  });
}
