import { GameConfig } from '@/config/GameConfig';
import { laserDistanceAtMs, laserMsAtDistance } from './laserTiming';
import { borderPoint, cellCenter, samePort } from './geometry';
import { combinerNeed, focusNeed, itemKey, levelEmitters, startStateFromPort } from './levelAccess';
import type { BoardGeometry, CombinerPulse, Direction, ImpactEvent, LaserSegment, LaserTrace, LevelDefinition, LevelItem, Orientation, Port } from './types';

const DIRS: Record<Direction, {x:number;y:number}> = {
  0: { x: 1, y: 0 }, 1: { x: 0, y: 1 }, 2: { x: -1, y: 0 }, 3: { x: 0, y: -1 },
};

function reflect(dir: Direction, s: Orientation): Direction {
  return (s === 0 ? [1, 0, 3, 2] : [3, 2, 1, 0])[dir] as Direction;
}

function exitPort(level: LevelDefinition, x: number, y: number): Port {
  if (x < 0) return { side: 'W', index: y };
  if (x >= level.cols) return { side: 'E', index: y };
  if (y < 0) return { side: 'N', index: x };
  return { side: 'S', index: x };
}

function sameRecord(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!!a[key] !== !!b[key]) return false;
  return true;
}

export class LaserSimulator {
  simulate(level: LevelDefinition, items: LevelItem[], geometry: BoardGeometry): LaserTrace {
    let doorStates: Record<string, boolean> = {};
    for (const item of items) if (item.type === 'door') doorStates[item.id] = false;
    let combinerOn: Record<string, boolean> = {};
    let combinerReadyAt: Record<string, number> = {};
    for (const item of items) if (item.type === 'combiner') combinerOn[itemKey(item.x, item.y)] = false;

    let pass = this.simulatePass(level, items, geometry, doorStates, combinerOn, combinerReadyAt);
    for (let i = 0; i < Math.max(12,items.length*2); i++) {
      const nextDoors: Record<string, boolean> = {};
      for (const item of items) {
        if (item.type === 'door') nextDoors[item.id] = item.requires.every(id => pass.switches.has(id));
      }
      const nextCombiners: Record<string, boolean> = {};
      const nextReady: Record<string, number> = {};
      for (const item of items) {
        if (item.type !== 'combiner') continue;
        const key = itemKey(item.x, item.y);
        const need = combinerNeed(item);
        const ats = [...(pass.combinerHitAt[key] ?? [])].sort((a, b) => a - b);
        const on = ats.length >= need;
        nextCombiners[key] = on;
        if (on) nextReady[key] = ats[need - 1];
      }
      if (sameRecord(nextDoors, doorStates) && sameRecord(nextCombiners, combinerOn)
        && Object.keys(nextReady).every(key=>Math.abs(nextReady[key]-(combinerReadyAt[key]??-1))<.001)) break;
      doorStates = nextDoors;
      combinerOn = nextCombiners;
      combinerReadyAt = nextReady;
      pass = this.simulatePass(level, items, geometry, doorStates, combinerOn, combinerReadyAt);
    }

    pass = this.simulatePass(level, items, geometry, doorStates, combinerOn, combinerReadyAt);
    const hits = level.targets.map(target => pass.exits.some(exit => samePort(exit, target)));
    const focusOn: Record<string, boolean> = {};
    for (const item of items) {
      if (item.type !== 'focus') continue;
      const key = itemKey(item.x, item.y);
      focusOn[key] = (pass.focusHits[key] ?? 0) >= focusNeed(item);
    }
    return { ...pass, doorStates, combinerOn, hits, focusOn };
  }

  private simulatePass(
    level: LevelDefinition,
    items: LevelItem[],
    g: BoardGeometry,
    doorStates: Record<string, boolean>,
    combinerOn: Record<string, boolean>,
    combinerReadyAt: Record<string, number>,
  ) {
    const byCell = new Map<string, LevelItem>();
    const portals = new Map<string, Extract<LevelItem, {type:'portal'}>[]>();
    for (const item of items) {
      byCell.set(itemKey(item.x, item.y), item);
      if (item.type === 'portal') {
        const pair = portals.get(item.pair) ?? [];
        pair.push(item); portals.set(item.pair, pair);
      }
    }

    const switches = new Set<string>();
    const exits: Port[] = [];
    const segments: LaserSegment[] = [];
    const impacts: ImpactEvent[] = [];
    const combinerHits: Record<string, number> = {};
    const combinerHitAt: Record<string, number[]> = {};
    const combinerPulses: Record<string, CombinerPulse> = {};
    const focusHits: Record<string, number> = {};
    const queue: Array<{x:number;y:number;dir:Direction;px:number;py:number;travel:number;branch:number;widthScale:number}> = [];

    const emitters = levelEmitters(level);
    emitters.forEach((port, index) => {
      const start = startStateFromPort(level, port);
      const p = borderPoint(g, port);
      queue.push({ ...start, px: p.x, py: p.y, travel: 0, branch: index, widthScale:1 });
    });
    let branchSeq = Math.max(emitters.length, 1);

    for (const item of items) {
      if (item.type !== 'combiner') continue;
      const key = itemKey(item.x, item.y);
      if (!combinerOn[key] || combinerReadyAt[key] === undefined) continue;
      const oc = cellCenter(g, item.x, item.y);
      const readyMs=laserMsAtDistance(combinerReadyAt[key]);
      const launchMs=readyMs+GameConfig.laser.combinerChargeMs;
      const launchDist=laserDistanceAtMs(launchMs);
      combinerPulses[key]={readyMs,launchMs,launchDist};
      impacts.push({type:'combiner-fire',x:item.x,y:item.y,px:oc.x,py:oc.y,at:launchDist,outgoingDirs:[item.dir]});
      queue.push({
        x: item.x, y: item.y, dir: item.dir,
        px: oc.x, py: oc.y,
        travel: launchDist, widthScale:GameConfig.laser.combinedWidthScale,
        branch: branchSeq++,
      });
    }

    const seen = new Set<string>();
    let maxTravel = 0;

    while (queue.length) {
      const seed = queue.shift()!;
      let { x, y, dir, px, py, travel, branch, widthScale } = seed;
      maxTravel=Math.max(maxTravel,travel);
      for (let step = 0; step < 180; step++) {
        const openDoors = Object.keys(doorStates).filter(k => doorStates[k]).sort().join('|');
        const stateKey = `${x},${y},${dir},${openDoors},${widthScale}`;
        if (seen.has(stateKey)) break;
        seen.add(stateKey);

        const d = DIRS[dir]; x += d.x; y += d.y;
        if (x < 0 || x >= level.cols || y < 0 || y >= level.rows) {
          const port = exitPort(level, x, y);
          const out = borderPoint(g, port);
          const len = Math.hypot(out.x - px, out.y - py);
          segments.push({ x1:px, y1:py, x2:out.x, y2:out.y, startDist:travel, endDist:travel+len, branch, widthScale });
          travel += len; maxTravel = Math.max(maxTravel, travel); exits.push(port);
          level.targets.forEach((target, targetIndex) => {
            if (samePort(port, target)) impacts.push({ type:'target', targetIndex, px:out.x, py:out.y, at:travel, incomingDir:dir });
          });
          break;
        }

        const c = cellCenter(g, x, y);
        const len = Math.hypot(c.x - px, c.y - py);
        segments.push({ x1:px, y1:py, x2:c.x, y2:c.y, startDist:travel, endDist:travel+len, branch, widthScale });
        travel += len; maxTravel = Math.max(maxTravel, travel); px = c.x; py = c.y;
        const item = byCell.get(itemKey(x, y));
        if (!item) continue;

        if (item.type === 'wall') { impacts.push({type:'wall', x,y,px,py,at:travel,incomingDir:dir}); break; }
        if (item.type === 'door' && !doorStates[item.id]) { impacts.push({type:'door',x,y,px,py,at:travel,id:item.id,incomingDir:dir}); break; }
        if (item.type === 'focus') {
          const key = itemKey(x, y);
          focusHits[key] = (focusHits[key] ?? 0) + 1;
          impacts.push({type:'focus',x,y,px,py,at:travel,incomingDir:dir});
          break;
        }
        if (item.type === 'combiner') {
          const key = itemKey(x, y);
          combinerHits[key] = (combinerHits[key] ?? 0) + 1;
          (combinerHitAt[key] ??= []).push(travel);
          impacts.push({type:'combiner',x,y,px,py,at:travel,incomingDir:dir,outgoingDirs:[]});
          break;
        }
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
          queue.push({x,y,dir:reflected,px,py,travel:resume,branch:branchSeq++,widthScale});
          travel = resume; maxTravel = Math.max(maxTravel, travel); continue;
        }
        if (item.type === 'portal') {
          const pair = portals.get(item.pair) ?? [];
          if (pair.length === 2) {
            const other = pair[0] === item ? pair[1] : pair[0];
            const oc = cellCenter(g, other.x, other.y);
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
      const key = `${e.type}:${e.targetIndex ?? ''}:${e.x ?? ''}:${e.y ?? ''}:${e.incomingDir ?? ''}:${Math.round(e.at)}`;
      if (!keys.has(key)) { keys.add(key); deduped.push(e); }
    }
    return { switches, exits, segments, impactEvents:deduped, maxTravel, combinerHits, combinerHitAt, combinerPulses, focusHits };
  }
}
