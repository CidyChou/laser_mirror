import { GameConfig } from '@/config/GameConfig';
import { laserDistanceAtMs, laserMsAtDistance } from './laserTiming';
import { computeGeometry } from './geometry';
import { LaserSimulator } from './LaserSimulator';
import { COMBO_VISIBLE_FROM, MAX_COMBO_COUNT } from './combo';
import { focusNeed, itemKey, nextCombinerDir } from './levelAccess';
import type { Direction, GameState, ImpactEvent, LevelDefinition, LevelItem } from './types';

export type GameEvent =
  | { type:'state' }
  | { type:'level' }
  | { type:'rotate'; x:number; y:number; s:0|1; dir?: Direction }
  | { type:'impact'; impact:ImpactEvent }
  | { type:'toast'; text:string }
  | { type:'shot-start' }
  | { type:'laser-launch' }
  | { type:'shot-end'; success:boolean; aborted?:boolean }
  | { type:'victory' }
  | { type:'defeat' }
  | { type:'combo'; count:number };

type Listener = (event: GameEvent) => void;

export class GameSession {
  private readonly simulator = new LaserSimulator();
  private readonly listeners = new Set<Listener>();
  private triggered = new Set<string>();
  private launchTriggered = false;
  private comboEmitted = new Set<number>();
  private finishAt = 0;
  private shotClockArmed = false;
  private simNow = 0;
  state: GameState;

  constructor(private readonly levels: readonly LevelDefinition[], initialHearts = 3, initialLevelIndex = 0) {
    const safe = Math.max(0, Math.min(levels.length - 1, Math.floor(initialLevelIndex)));
    this.state = this.createState(safe, initialHearts);
  }

  on(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: GameEvent) {
    for (const listener of this.listeners) {
      try { listener(event); }
      catch (error) { console.warn('[session] listener failed', error); }
    }
  }

  private createState(index: number, hearts: number): GameState {
    const level = this.levels[index];
    const items = level.items.map(item => ({...item})) as LevelItem[];
    return {
      levelIndex:index, level, items, targets:level.targets.map(t=>({...t,hit:false,charge:0})),
      hearts:Math.max(0, Math.floor(hearts)), firing:false, won:false, shotStart:0, shotElapsedMs:0, beamDistance:0,
      result:null, activeSwitches:new Set(), activeDoorStates:{},
      focusHits:{}, combinerHits:{}, combinerOn:{}, comboCount:0,
    };
  }

  load(index: number) {
    const safe = Math.max(0, Math.min(this.levels.length - 1, index));
    const hearts = this.state.hearts;
    this.state = this.createState(safe, hearts); this.triggered.clear(); this.comboEmitted.clear(); this.launchTriggered=false; this.finishAt=0; this.shotClockArmed=false; this.simNow=0; this.emit({type:'level'}); this.emit({type:'state'});
  }
  reset() { this.load(this.state.levelIndex); }
  next() {
    if (this.state.levelIndex < this.levels.length - 1) this.load(this.state.levelIndex + 1);
    else { this.load(0); this.emit({type:'toast',text:`${this.levels.length} 关全部完成`}); }
  }

  restoreHearts(count = 3) {
    if (this.state.firing) return;
    this.state.hearts = Math.max(0, Math.floor(count));
    this.emit({type:'state'});
  }

  rotateAt(x:number,y:number) {
    if (this.state.firing || this.state.won) return;
    const item = this.state.items.find(i=>i.x===x && i.y===y);
    if (!item || ('fixed' in item && item.fixed)) return;
    if (item.type === 'mirror' || item.type === 'splitter') {
      item.s = item.s === 0 ? 1 : 0;
      this.emit({type:'rotate', x, y, s:item.s});
      return;
    }
    if (item.type === 'combiner') {
      item.dir = nextCombinerDir(item.dir);
      this.emit({type:'rotate', x, y, s:0, dir:item.dir});
    }
  }

  fire() {
    const s = this.state;
    if (s.firing || s.won) return;
    if (s.hearts <= 0) { this.emit({type:'toast',text:'爱心不足 · 补充后再发射'}); return; }

    let result;
    try {
      result = this.simulator.simulate(s.level, s.items, computeGeometry(s.level));
    } catch (error) {
      console.warn('[session] simulate failed', error);
      this.emit({type:'toast',text:'光路计算失败'});
      return;
    }
    if (!result || !Number.isFinite(result.maxTravel)) {
      this.emit({type:'toast',text:'光路计算失败'});
      return;
    }

    s.firing = true;
    s.shotStart = 0;
    s.shotElapsedMs = 0;
    s.beamDistance = 0;
    s.comboCount = 0;
    s.result = result;
    s.targets.forEach(t=>{t.hit=false;t.charge=0;}); s.activeSwitches.clear(); s.activeDoorStates={};
    s.focusHits={}; s.combinerHits={}; s.combinerOn={};
    this.triggered.clear(); this.launchTriggered=false; this.comboEmitted.clear(); this.finishAt=0;
    this.shotClockArmed=false; this.simNow=0;
    this.emit({type:'shot-start'}); this.emit({type:'state'});
  }

  /** Drop a stuck shot without spending a heart. */
  abortFire() {
    const s = this.state;
    if (!s.firing) return;
    s.firing = false;
    s.result = null;
    s.shotElapsedMs = 0;
    s.beamDistance = 0;
    s.comboCount = 0;
    s.activeSwitches.clear();
    s.activeDoorStates = {};
    s.targets.forEach(t => { t.hit = false; t.charge = 0; });
    s.focusHits = {}; s.combinerHits = {}; s.combinerOn = {};
    this.triggered.clear();
    this.launchTriggered = false;
    this.comboEmitted.clear();
    this.finishAt = 0;
    this.shotClockArmed = false;
    this.simNow = 0;
    this.emit({type:'shot-end', success:false, aborted:true});
    this.emit({type:'state'});
  }

  update(now: number): boolean {
    const s = this.state;
    if (!s.firing || !s.result) return false;
    if (!Number.isFinite(now)) return true;

    // Bind the shot clock on the first ticker frame so a stale `performance.now()`
    // in the tap handler cannot skip charge and dump every impact in one frame.
    if (!this.shotClockArmed) {
      this.shotClockArmed = true;
      s.shotStart = now;
      this.simNow = now;
      return true;
    }

    const dt = now - this.simNow;
    if (dt > CLOCK_JUMP_MS) this.simNow += CLOCK_CATCHUP_MS;
    else if (dt > 0) this.simNow = now;

    const elapsed = this.simNow - s.shotStart;
    s.shotElapsedMs = elapsed;
    if (elapsed > Math.max(SHOT_TIMEOUT_MS,GameConfig.laser.chargeMs+laserMsAtDistance(s.result.maxTravel)+2000)) {
      const success = this.isSuccess(s.result);
      this.finish(success);
      return s.firing;
    }
    if (elapsed < GameConfig.laser.chargeMs) return true;
    if (!this.launchTriggered) { this.launchTriggered=true; this.emit({type:'laser-launch'}); }

    const distance=laserDistanceAtMs(elapsed-GameConfig.laser.chargeMs);
    s.beamDistance = Number.isFinite(distance) ? distance : s.result.maxTravel;

    let applied = 0;
    for (const impact of s.result.impactEvents) {
      if (impact.at > s.beamDistance) break;
      const key = impactKey(impact);
      if (this.triggered.has(key)) continue;
      this.triggered.add(key); this.applyImpact(impact); this.emit({type:'impact',impact});
      if (++applied >= IMPACTS_PER_FRAME) break;
    }

    const pendingImpact = s.result.impactEvents.some(impact => {
      if (impact.at > s.beamDistance) return false;
      return !this.triggered.has(impactKey(impact));
    });

    const success = this.isSuccess(s.result);
    const combinedTail=Object.keys(s.result.combinerPulses).length>0&&s.beamDistance<s.result.maxTravel;
    if (!pendingImpact && !combinedTail && (success || s.beamDistance >= s.result.maxTravel)) {
      if (!this.finishAt) {
        const tail = s.comboCount >= COMBO_VISIBLE_FROM
          ? GameConfig.laser.comboHoldMs
          : GameConfig.laser.settleMs;
        this.finishAt = this.simNow + tail;
      }
      if (this.simNow >= this.finishAt) this.finish(success);
    }
    return s.firing;
  }

  private applyImpact(impact: ImpactEvent) {
    const s = this.state;
    if (impact.type === 'switch' && impact.id) {
      s.activeSwitches.add(impact.id);
      for (const item of s.items) if (item.type==='door') s.activeDoorStates[item.id]=item.requires.every(id=>s.activeSwitches.has(id));
      this.emit({type:'state'});
    }
    if (impact.type === 'target' && impact.targetIndex !== undefined) {
      const target=s.targets[impact.targetIndex];
      if (target) { target.charge = (target.charge ?? 0) + 1; target.hit = true; }
      this.emit({type:'state'});
    }
    if ((impact.type === 'focus' || impact.type === 'combiner') && impact.x !== undefined && impact.y !== undefined) {
      const key = itemKey(impact.x, impact.y);
      if (impact.type === 'focus') {
        s.focusHits[key] = (s.focusHits[key] ?? 0) + 1;
      } else {
        s.combinerHits[key] = (s.combinerHits[key] ?? 0) + 1;
        // Full inputs enter charge; output switches on only at combiner-fire.
      }
      this.emit({type:'state'});
    }
    if (impact.type==='combiner-fire'&&impact.x!==undefined&&impact.y!==undefined){
      s.combinerOn[itemKey(impact.x,impact.y)]=true;this.emit({type:'state'});
    }
    if (impact.type === 'mirror' || impact.type === 'target' || impact.type === 'focus') {
      s.comboCount = Math.min(MAX_COMBO_COUNT, s.comboCount + 1);
      if (s.comboCount >= COMBO_VISIBLE_FROM && !this.comboEmitted.has(s.comboCount)) {
        this.comboEmitted.add(s.comboCount);
        this.emit({type:'combo', count:s.comboCount});
      }
    }
  }

  private isSuccess(result: GameState['result']): boolean {
    const s = this.state;
    if (!result) return false;
    const walls = result.hits.every(Boolean) && s.targets.every(t => t.hit);
    const focuses = s.items.filter((item): item is Extract<LevelItem, { type: 'focus' }> => item.type === 'focus');
    const focusOk = focuses.every(item => (s.focusHits[itemKey(item.x, item.y)] ?? 0) >= focusNeed(item));
    return walls && focusOk;
  }

  private missPrefix(): string {
    const s = this.state;
    const result = s.result;
    const focuses = s.items.filter((item): item is Extract<LevelItem, { type: 'focus' }> => item.type === 'focus');
    const unfilled = result && focuses.some(item => (result.focusHits[itemKey(item.x, item.y)] ?? 0) < focusNeed(item));
    return unfilled ? '双束终点未充满' : '没有命中';
  }

  private finish(success: boolean) {
    const s=this.state; s.firing=false;
    this.shotClockArmed=false; this.simNow=0; this.finishAt=0;
    if (success) {
      s.won=true;
      if (s.result) {
        s.activeSwitches=new Set(s.result.switches); s.activeDoorStates={...s.result.doorStates};
        s.focusHits={...s.result.focusHits}; s.combinerHits={...s.result.combinerHits}; s.combinerOn={...s.result.combinerOn};
      }
      this.emit({type:'victory'});
    } else {
      const prefix = this.missPrefix();
      s.hearts=Math.max(0,s.hearts-1);
      s.result=null; s.shotElapsedMs=0; s.beamDistance=0; s.comboCount=0; s.activeSwitches.clear(); s.activeDoorStates={};
      s.focusHits={}; s.combinerHits={}; s.combinerOn={};
      s.targets.forEach(t=>{t.hit=false;t.charge=0;});
      if (s.hearts <= 0) this.emit({type:'defeat'});
      else this.emit({type:'toast',text:`${prefix} · 还剩 ${s.hearts} 颗爱心`});
    }
    this.emit({type:'shot-end',success}); this.emit({type:'state'});
  }
}

function impactKey(impact: ImpactEvent): string {
  return `${impact.type}:${impact.x ?? ''}:${impact.y ?? ''}:${impact.targetIndex ?? ''}:${impact.incomingDir ?? ''}:${Math.round(impact.at)}`;
}

const CLOCK_JUMP_MS = 250;
const CLOCK_CATCHUP_MS = 48;
const IMPACTS_PER_FRAME = 12;
const SHOT_TIMEOUT_MS = 45_000;
