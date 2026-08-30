import { GameConfig } from '@/config/GameConfig';
import { borderPoint, cellCenter, samePort } from './geometry';
import type { BoardGeometry, Direction, ImpactEvent, LaserSegment, LaserTrace, LevelDefinition, LevelItem, Orientation, Port } from './types';

const DIRS: Record<Direction, {x:number;y:number}> = {
  0: { x: 1, y: 0 }, 1: { x: 0, y: 1 }, 2: { x: -1, y: 0 }, 3: { x: 0, y: -1 },
};

function reflect(dir: Direction, s: Orientation): Direction {
  return (s === 0 ? [1, 0, 3, 2] : [3, 2, 1, 0])[dir] as Direction;
}

function startState(level: LevelDefinition): {x:number;y:number;dir:Direction} {
  const i = level.emitter.index;
  if (level.emitter.side === 'W') return { x: -1, y: i, dir: 0 };
  if (level.emitter.side === 'E') return { x: level.cols, y: i, dir: 2 };
  if (level.emitter.side === 'N') return { x: i, y: -1, dir: 1 };
  return { x: i, y: level.rows, dir: 3 };
}

function exitPort(level: LevelDefinition, x: number, y: number): Port {
  if (x < 0) return { side: 'W', index: y };
  if (x >= level.cols) return { side: 'E', index: y };
  if (y < 0) return { side: 'N', index: x };
  return { side: 'S', index: x };
}

export class LaserSimulator {
  simulate(level: LevelDefinition, items: LevelItem[], geometry: BoardGeometry): LaserTrace {
    let doorStates: Record<string, boolean> = {};
    for (const item of items) if (item.type === 'door') doorStates[item.id] = false;

    let pass = this.simulatePass(level, items, geometry, doorStates);
    for (let i = 0; i < 10; i++) {
      const next: Record<string, boolean> = {};
      for (const item of items) {
        if (item.type === 'door') next[item.id] = item.requires.every(id => pass.switches.has(id));
      }
      if (sameDoorStates(next, doorStates)) break;
      doorStates = next;
      pass = this.simulatePass(level, items, geometry, doorStates);
    }

    pass = this.simulatePass(level, items, geometry, doorStates);
    const hits = level.targets.map(target => pass.exits.some(exit => samePort(exit, target)));
    return { ...pass, doorStates, hits };
  }

  private simulatePass(level: LevelDefinition, items: LevelItem[], g: BoardGeometry, doorStates: Record<string, boolean>) {
    const byCell = new Map<string, LevelItem>();
    const portals = new Map<string, Extract<LevelItem, {type:'portal'}>[]>();
    for (const item of items) {
      byCell.set(`${item.x},${item.y}`, item);
      if (item.type === 'portal') {
        const pair = portals.get(item.pair) ?? [];
        pair.push(item); portals.set(item.pair, pair);
      }
    }

    const switches = new Set<string>();
    const exits: Port[] = [];
    const segments: LaserSegment[] = [];
    const impacts: ImpactEvent[] = [];
    const queue: Array<{x:number;y:number;dir:Direction;px:number;py:number;travel:number;branch:number}> = [];
    const start = startState(level);
    const p = borderPoint(g, level.emitter);
    queue.push({ ...start, px: p.x, py: p.y, travel: 0, branch: 0 });

    const seen = new Set<string>();
    const openDoors = Object.keys(doorStates).filter(k => doorStates[k]).sort().join('|');
    let maxTravel = 0;
    let branchSeq = 1;
    let visits = 0;

    while (queue.length && visits < MAX_VISITS && segments.length < MAX_SEGMENTS) {
      const seed = queue.shift()!;
      visits++;
      let { x, y, dir, px, py, travel, branch } = seed;
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(travel)) continue;
      for (let step = 0; step < 180; step++) {
        const stateKey = `${x},${y},${dir},${openDoors}`;
        if (seen.has(stateKey)) break;
        seen.add(stateKey);

        const d = DIRS[dir];
        if (!d) break;
        x += d.x; y += d.y;
        if (x < 0 || x >= level.cols || y < 0 || y >= level.rows) {
          const port = exitPort(level, x, y);
          const out = borderPoint(g, port);
          const len = Math.hypot(out.x - px, out.y - py);
          if (!Number.isFinite(len)) break;
          segments.push({ x1:px, y1:py, x2:out.x, y2:out.y, startDist:travel, endDist:travel+len, branch });
          travel += len; maxTravel = Math.max(maxTravel, travel); exits.push(port);
          level.targets.forEach((target, targetIndex) => {
            if (samePort(port, target)) impacts.push({ type:'target', targetIndex, px:out.x, py:out.y, at:travel, incomingDir:dir });
          });
          break;
        }

        const c = cellCenter(g, x, y);
        const len = Math.hypot(c.x - px, c.y - py);
        if (!Number.isFinite(len)) break;
        segments.push({ x1:px, y1:py, x2:c.x, y2:c.y, startDist:travel, endDist:travel+len, branch });
        travel += len; maxTravel = Math.max(maxTravel, travel); px = c.x; py = c.y;
        const item = byCell.get(`${x},${y}`);
        if (!item) continue;

        if (item.type === 'wall') { impacts.push({type:'wall', x,y,px,py,at:travel,incomingDir:dir}); break; }
        if (item.type === 'door' && !doorStates[item.id]) { impacts.push({type:'door',x,y,px,py,at:travel,id:item.id,incomingDir:dir}); break; }
        if (item.type === 'switch') { switches.add(item.id); impacts.push({type:'switch',x,y,px,py,at:travel,id:item.id,incomingDir:dir,outgoingDirs:[dir]}); continue; }
        if (item.type === 'mirror') {
          const incomingDir=dir;
          dir=reflect(dir,item.s);
          impacts.push({type:'mirror',x,y,px,py,at:travel,incomingDir,outgoingDirs:[dir]});
          travel += GameConfig.laser.mirrorPauseDistance; maxTravel = Math.max(maxTravel, travel); continue;
        }
        if (item.type === 'splitter') {
          const reflected=reflect(dir,item.s);
          impacts.push({type:'splitter',x,y,px,py,at:travel,incomingDir:dir,outgoingDirs:[dir,reflected]});
          const resume = travel + GameConfig.laser.mirrorPauseDistance;
          if (queue.length < MAX_QUEUE) queue.push({x,y,dir:reflected,px,py,travel:resume,branch:branchSeq++});
          travel = resume; maxTravel = Math.max(maxTravel, travel); continue;
        }
        if (item.type === 'portal') {
          const pair = portals.get(item.pair) ?? [];
          if (pair.length === 2) {
            const other = pair[0] === item ? pair[1] : pair[0];
            const oc = cellCenter(g, other.x, other.y);
            if (!Number.isFinite(oc.x) || !Number.isFinite(oc.y)) break;
            impacts.push({type:'portal',x,y,px,py,at:travel,pair:item.pair,toX:oc.x,toY:oc.y,incomingDir:dir,outgoingDirs:[dir]});
            travel += GameConfig.laser.portalPauseDistance; maxTravel = Math.max(maxTravel, travel);
            x = other.x; y = other.y; px = oc.x; py = oc.y;
          }
        }
      }
    }

    const deduped: ImpactEvent[] = [];
    const keys = new Set<string>();
    for (const e of impacts.sort((a,b)=>a.at-b.at)) {
      const key = `${e.type}:${e.targetIndex ?? ''}:${e.x ?? ''}:${e.y ?? ''}:${Math.round(e.at)}`;
      if (!keys.has(key)) { keys.add(key); deduped.push(e); }
    }
    return { switches, exits, segments, impactEvents:deduped, maxTravel: Number.isFinite(maxTravel) ? maxTravel : 0 };
  }
}

const MAX_QUEUE = 256;
const MAX_VISITS = 512;
const MAX_SEGMENTS = 1500;

function sameDoorStates(a: Record<string, boolean>, b: Record<string, boolean>) {
  for (const key in a) if (Boolean(a[key]) !== Boolean(b[key])) return false;
  for (const key in b) if (Boolean(a[key]) !== Boolean(b[key])) return false;
  return true;
}
