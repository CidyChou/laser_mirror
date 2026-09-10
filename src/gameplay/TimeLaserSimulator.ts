import { GameConfig } from '@/config/GameConfig';
import { laserDistanceAtMs, laserMsAtDistance, TIME_BOSS_SPEED_SCALE } from './laserTiming';
import { borderPoint, cellCenter, samePort } from './geometry';
import { combinerNeed, focusNeed, itemKey, levelEmitters, startStateFromPort } from './levelAccess';
import type { BoardGeometry, Direction, ImpactEvent, LaserTrace, LevelDefinition, LevelItem } from './types';

const vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const reflected = (dir: Direction, s: number) => (s === 0 ? [1, 0, 3, 2] : [3, 2, 1, 0])[dir] as Direction;
type Head = { x: number; y: number; dir: Direction; branch: number; width: number; at: number; kind: 'arrive' | 'door' | 'release' };
type World = {
  heads: Head[];
  trace: LaserTrace;
  focusDirections: Record<string, Direction[]>;
  combinerDirections: Record<string, Direction[]>;
  doorsReady: Record<string, number>;
  nextBranch: number;
};
type Snapshot = { at: number; world: World; impactCount: number };
const copy = <T>(value: T): T => {
  // Mini-game runtimes do not consistently provide structuredClone.
  if (value instanceof Set) return new Set(value) as T;
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) as T;
  return value;
};

/** Event-driven pulse simulation. Mirror settings deliberately live outside history.
 * Time uses the same accelerated travel curve as ordinary levels.
 */
export class TimeLaserSimulator {
  time = 0;
  private world: World;
  /** Append-only event log; snapshots store only a length, not a full copy. */
  private eventLog: ImpactEvent[] = [];
  private history: Snapshot[] = [];
  private revision = 0;
  private cachedRevision = -1;
  private cachedTrace!: LaserTrace;
  private eventCount = 0;

  constructor(readonly level: LevelDefinition, private readonly items: LevelItem[], readonly geometry: BoardGeometry) {
    this.world = {
      heads: [], focusDirections: {}, combinerDirections: {}, doorsReady: {}, nextBranch: 0,
      trace: { switches: new Set(), exits: [], segments: [], impactEvents: this.eventLog, maxTravel: 0, doorStates: {}, hits: level.targets.map(() => false), focusHits: {}, focusOn: {}, combinerHits: {}, combinerOn: {}, combinerPulses: {} },
    };
    for (const item of items) if (item.type === 'door') this.world.trace.doorStates[item.id] = false;
    for (const port of levelEmitters(level)) {
      const start = startStateFromPort(level, port);
      this.depart({ ...start, branch: this.world.nextBranch++, width: 1, at: 0, kind: 'arrive' }, borderPoint(geometry, port));
    }
    this.save();
  }

  get distance() { return laserDistanceAtMs(this.time, TIME_BOSS_SPEED_SCALE); }
  timeAtDistance(distance:number) { return laserMsAtDistance(distance, TIME_BOSS_SPEED_SCALE); }
  get finished() { return this.world.heads.every(h => h.kind === 'door') && !Object.values(this.world.doorsReady).some(t => t > this.time); }
  get exhausted() { return this.eventCount >= 4096 || this.time >= 120000; }
  get successful() {
    return this.world.trace.hits.every(Boolean) && this.items.every(i => i.type !== 'focus' || !!this.world.trace.focusOn[itemKey(i.x, i.y)]);
  }
  get trace(): LaserTrace {
    // Stable identity between events avoids rebuilding beam geometry every frame.
    // The event log is shared read-only; copying it here was the main source of
    // dropped frames once a looping challenge had accumulated many impacts.
    if (this.cachedRevision !== this.revision) {
      const trace=this.world.trace;
      this.cachedTrace = {
        ...trace,
        switches:new Set(trace.switches),
        exits:trace.exits.slice(),
        segments:trace.segments.slice(),
        impactEvents:trace.impactEvents,
        doorStates:{...trace.doorStates},
        hits:trace.hits.slice(),
        focusHits:{...trace.focusHits},
        focusOn:{...trace.focusOn},
        combinerHits:{...trace.combinerHits},
        combinerOn:{...trace.combinerOn},
        combinerPulses:{...trace.combinerPulses},
        ...(trace.doorReadyMs?{doorReadyMs:{...trace.doorReadyMs}}:{}),
      };
      this.cachedRevision = this.revision;
    }
    return this.cachedTrace;
  }

  private save() {
    // Keep the visible six-cell tail plus four cells needed by rewind.
    const cutoff=this.distance-this.geometry.cell*10;
    this.world.trace.segments=this.world.trace.segments.filter(segment=>segment.endDist>=cutoff);
    // Do not deep-copy the append-only impact log on every collision. The
    // snapshot restores its prefix by length during rewind.
    const snapshotWorld=copy({...this.world,trace:{...this.world.trace,impactEvents:[]}});
    this.history.push({ at: this.time, world: snapshotWorld, impactCount:this.eventLog.length });
    // Only four cells of history can be requested, plus one preceding checkpoint.
    const oldestDistance = this.distance - this.geometry.cell * 4;
    while (this.history.length > 2 && laserDistanceAtMs(this.history[1].at, TIME_BOSS_SPEED_SCALE) < oldestDistance) this.history.shift();
    this.revision++;
  }

  /** Restore all causally later events, including unborn split/aggregate branches. */
  rewindTo(time: number) {
    const target = Math.max(0, Math.min(time, this.time));
    let index = this.history.length - 1;
    while(index >= 0 && this.history[index].at > target + 1e-7) index--;
    if (index < 0) throw new Error('Requested rewind is outside retained history');
    this.eventLog.length=this.history[index].impactCount;
    this.world = copy(this.history[index].world);
    this.world.trace.impactEvents=this.eventLog;
    this.history.length = index + 1;
    this.time = target;
    this.revision++;
  }

  advanceTo(target: number): ImpactEvent[] {
    const emitted: ImpactEvent[] = [];
    while (!this.exhausted) {
      const headAt = Math.min(...this.world.heads.map(h => h.at));
      const doorAt = Math.min(...Object.values(this.world.doorsReady).filter(t => t > this.time + 1e-7));
      const at = Math.min(headAt, doorAt);
      if (!Number.isFinite(at) || at > target + 1e-7) break;
      this.time = at;
      for (const item of this.items) if (item.type === 'door' && this.world.doorsReady[item.id] <= at && !this.world.trace.doorStates[item.id]) {
        this.world.trace.doorStates[item.id] = true;
        this.impact({ type: 'door-open', id: item.id, x: item.x, y: item.y }, cellCenter(this.geometry, item.x, item.y), emitted);
      }
      const due = this.world.heads.filter(h => h.at <= at + 1e-7);
      this.world.heads = this.world.heads.filter(h => h.at > at + 1e-7);
      for (const head of due) { this.arrive(head, emitted); this.eventCount++; }
      this.save();
    }
    const nextHead=Math.min(...this.world.heads.map(h=>h.at));
    const nextDoor=Math.min(...Object.values(this.world.doorsReady).filter(t=>t>this.time+1e-7));
    if(Number.isFinite(Math.min(nextHead,nextDoor)))this.time=Math.min(target,120000);
    return emitted;
  }

  private impact(event: Omit<ImpactEvent, 'at' | 'px' | 'py'>, p: { x: number; y: number }, emitted: ImpactEvent[]) {
    const full = { ...event, px: p.x, py: p.y, at: this.distance };
    this.eventLog.push(full);
    emitted.push(full);
  }

  private depart(head: Head, origin = cellCenter(this.geometry, head.x, head.y)) {
    const [dx, dy] = vectors[head.dir];
    const x = head.x + dx, y = head.y + dy;
    const outside = x < 0 || y < 0 || x >= this.level.cols || y >= this.level.rows;
    const p = outside ? borderPoint(this.geometry, this.port(x, y)) : cellCenter(this.geometry, x, y);
    const startDist=laserDistanceAtMs(head.at, TIME_BOSS_SPEED_SCALE);
    const endDist=startDist+Math.hypot(p.x-origin.x,p.y-origin.y);
    const end=laserMsAtDistance(endDist, TIME_BOSS_SPEED_SCALE);
    this.world.trace.segments.push({ x1: origin.x, y1: origin.y, x2: p.x, y2: p.y, startDist, endDist, branch: head.branch, widthScale: head.width });
    this.world.trace.maxTravel = Math.max(this.world.trace.maxTravel, endDist);
    this.world.heads.push({ ...head, x, y, at: end, kind: 'arrive' });
  }

  private port(x: number, y: number) {
    return x < 0 ? { side: 'W' as const, index: y } : x >= this.level.cols ? { side: 'E' as const, index: y } : y < 0 ? { side: 'N' as const, index: x } : { side: 'S' as const, index: x };
  }

  private arrive(head: Head, emitted: ImpactEvent[]) {
    const { x, y, dir } = head;
    const w = this.world, trace = w.trace;
    if (x < 0 || y < 0 || x >= this.level.cols || y >= this.level.rows) {
      const port = this.port(x, y), p = borderPoint(this.geometry, port);
      trace.exits.push(port);
      this.level.targets.forEach((t, targetIndex) => {
        if (!samePort(t, port)) return;
        trace.hits[targetIndex] = true;
        this.impact({ type: 'target', targetIndex, incomingDir: dir }, p, emitted);
      });
      return;
    }
    const p = cellCenter(this.geometry, x, y);
    const item = this.items.find(i => i.x === x && i.y === y);
    const event = (type: ImpactEvent['type'], extra: Partial<ImpactEvent> = {}) => this.impact({ type, x, y, incomingDir: dir, ...extra }, p, emitted);
    if (!item) { this.depart(head); return; }
    const key = itemKey(x, y);
    if (head.kind === 'release' && item.type === 'combiner') {
      trace.combinerOn[key] = true;
      event('combiner-fire', { outgoingDirs: [item.dir] });
      this.depart({ ...head, kind: 'arrive', dir: item.dir, width: GameConfig.laser.combinedWidthScale, branch: w.nextBranch++ });
      return;
    }
    if (item.type === 'wall') { event('wall'); return; }
    if (item.type === 'door') {
      if (trace.doorStates[item.id]) { this.depart(head); return; }
      // Wait for future causal activation; never predict a switch hit.
      if (head.kind !== 'door') event('door', { id: item.id });
      w.heads.push({ ...head, kind: 'door', at: w.doorsReady[item.id] > this.time ? w.doorsReady[item.id] : this.time + 100 });
      return;
    }
    if (item.type === 'switch') {
      if (!trace.switches.has(item.id)) {
        trace.switches.add(item.id); event('switch', { id: item.id });
        for (const door of this.items) if (door.type === 'door' && w.doorsReady[door.id] === undefined && door.requires.every(id => trace.switches.has(id))) {
          w.doorsReady[door.id] = this.time + GameConfig.laser.doorSignalMs + GameConfig.laser.doorOpenMs;
          (trace.doorReadyMs??={})[door.id]=w.doorsReady[door.id];
        }
      }
      this.depart(head); return;
    }
    if (item.type === 'mirror' || item.type === 'splitter') {
      const next = reflected(dir, item.s);
      event(item.type, { outgoingDirs: item.type === 'mirror' ? [next] : [dir, next] });
      const resume=laserMsAtDistance(this.distance+GameConfig.laser.mirrorPauseDistance, TIME_BOSS_SPEED_SCALE);
      if (item.type === 'splitter') this.depart({ ...head, at:resume, branch: w.nextBranch++ });
      this.depart({ ...head, at:resume, dir: next }); return;
    }
    if (item.type === 'portal') {
      const other = this.items.find(i => i.type === 'portal' && i.pair === item.pair && i !== item);
      if (other) {
        event('portal', { pair: item.pair, toX: other.x, toY: other.y });
        const resume=laserMsAtDistance(this.distance+GameConfig.laser.portalPauseDistance, TIME_BOSS_SPEED_SCALE);
        this.depart({ ...head, at:resume, x: other.x, y: other.y });
      }
      return;
    }
    const directions = item.type === 'focus' ? w.focusDirections : w.combinerDirections;
    const hits = directions[key] ??= [];
    if (hits.includes(dir)) return;
    hits.push(dir);
    if (item.type === 'focus') {
      trace.focusHits[key] = hits.length;
      trace.focusOn[key] = hits.length >= focusNeed(item);
      event('focus');
    } else if (item.type === 'combiner') {
      trace.combinerHits[key] = hits.length;
      event('combiner');
      if (hits.length >= combinerNeed(item) && !trace.combinerPulses[key]) {
        const launch = this.time + GameConfig.laser.combinerChargeMs;
        trace.combinerPulses[key] = { readyMs: this.time, launchMs: launch, launchDist: laserDistanceAtMs(launch, TIME_BOSS_SPEED_SCALE) };
        w.heads.push({ ...head, at: launch, kind: 'release' });
      }
    }
  }
}
