import { GameConfig } from '@/config/GameConfig';
import { nowMs } from '@/core/clock';
import { computeGeometry } from './geometry';
import { LaserSimulator } from './LaserSimulator';
import { COMBO_VISIBLE_FROM, MAX_COMBO_COUNT } from './combo';
import type { GameState, ImpactEvent, LevelDefinition, LevelItem } from './types';

export type GameEvent =
  | { type:'state' }
  | { type:'level' }
  | { type:'rotate'; x:number; y:number; s:0|1 }
  | { type:'impact'; impact:ImpactEvent }
  | { type:'toast'; text:string }
  | { type:'shot-start' }
  | { type:'laser-launch' }
  | { type:'shot-end'; success:boolean }
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
  state: GameState;

  constructor(private readonly levels: LevelDefinition[]) {
    this.state = this.createState(0);
  }

  on(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: GameEvent) { this.listeners.forEach(listener => listener(event)); }

  private createState(index: number): GameState {
    const level = this.levels[index];
    const items = level.items.map(item => ({...item})) as LevelItem[];
    return {
      levelIndex:index, level, items, targets:level.targets.map(t=>({...t,hit:false})),
      shotsLeft:level.shots, firing:false, won:false, shotStart:0, beamDistance:0,
      result:null, activeSwitches:new Set(), activeDoorStates:{}, comboCount:0,
    };
  }

  load(index: number) {
    const safe = Math.max(0, Math.min(this.levels.length - 1, index));
    this.state = this.createState(safe); this.triggered.clear(); this.comboEmitted.clear(); this.launchTriggered=false; this.finishAt=0; this.emit({type:'level'}); this.emit({type:'state'});
  }
  reset() { this.load(this.state.levelIndex); }
  next() {
    if (this.state.levelIndex < this.levels.length - 1) this.load(this.state.levelIndex + 1);
    else { this.load(0); this.emit({type:'toast',text:'50 关全部完成'}); }
  }

  rotateAt(x:number,y:number) {
    if (this.state.firing || this.state.won) return;
    const item = this.state.items.find(i=>i.x===x && i.y===y);
    if (!item || (item.type !== 'mirror' && item.type !== 'splitter') || item.fixed) return;
    item.s = item.s === 0 ? 1 : 0;
    this.emit({type:'rotate', x, y, s:item.s});
  }

  fire(now = nowMs()) {
    const s = this.state;
    if (s.firing || s.won) return;
    if (s.shotsLeft <= 0) { this.emit({type:'toast',text:'激光机会已用完'}); return; }
    s.shotsLeft--; s.firing = true; s.shotStart = now; s.beamDistance = 0; s.comboCount = 0;
    s.result = this.simulator.simulate(s.level, s.items, computeGeometry(s.level));
    s.targets.forEach(t=>t.hit=false); s.activeSwitches.clear(); s.activeDoorStates={};
    this.triggered.clear(); this.launchTriggered=false; this.comboEmitted.clear(); this.finishAt=0;
    this.emit({type:'shot-start'}); this.emit({type:'state'});
  }

  update(now: number): boolean {
    const s = this.state;
    if (!s.firing || !s.result) return false;
    const elapsed = now - s.shotStart;
    if (elapsed < GameConfig.laser.chargeMs) return true;
    if (!this.launchTriggered) { this.launchTriggered=true; this.emit({type:'laser-launch'}); }

    const travelSec = (elapsed - GameConfig.laser.chargeMs) / 1000;
    const { startSpeed, acceleration, maxSpeed } = GameConfig.laser;
    const accelTime = Math.min(travelSec, (maxSpeed - startSpeed) / acceleration);
    s.beamDistance = startSpeed * accelTime + 0.5 * acceleration * accelTime * accelTime + Math.max(0, travelSec - accelTime) * maxSpeed;

    for (const impact of s.result.impactEvents) {
      if (impact.at > s.beamDistance) break;
      const key = `${impact.type}:${impact.x ?? ''}:${impact.y ?? ''}:${impact.targetIndex ?? ''}:${Math.round(impact.at)}`;
      if (this.triggered.has(key)) continue;
      this.triggered.add(key); this.applyImpact(impact); this.emit({type:'impact',impact});
    }

    const success = s.result.hits.every(Boolean) && s.targets.every(t=>t.hit);
    if (success || s.beamDistance >= s.result.maxTravel) {
      if (!this.finishAt) {
        const tail = s.comboCount >= COMBO_VISIBLE_FROM
          ? GameConfig.laser.comboHoldMs
          : GameConfig.laser.settleMs;
        this.finishAt = now + tail;
      }
      if (now >= this.finishAt) this.finish(success);
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
      const target=s.targets[impact.targetIndex]; if(target) target.hit=true; this.emit({type:'state'});
    }
    if (impact.type === 'mirror' || impact.type === 'target') {
      s.comboCount = Math.min(MAX_COMBO_COUNT, s.comboCount + 1);
      if (s.comboCount >= COMBO_VISIBLE_FROM && !this.comboEmitted.has(s.comboCount)) {
        this.comboEmitted.add(s.comboCount);
        this.emit({type:'combo', count:s.comboCount});
      }
    }
  }

  private finish(success: boolean) {
    const s=this.state; s.firing=false;
    if (success) {
      s.won=true;
      if (s.result) { s.activeSwitches=new Set(s.result.switches); s.activeDoorStates={...s.result.doorStates}; }
      this.emit({type:'victory'});
    } else {
      s.result=null; s.beamDistance=0; s.comboCount=0; s.activeSwitches.clear(); s.activeDoorStates={}; s.targets.forEach(t=>t.hit=false);
      if (s.shotsLeft <= 0) this.emit({type:'defeat'});
      else this.emit({type:'toast',text:`没有命中 · 还剩 ${s.shotsLeft} 次`});
    }
    this.emit({type:'shot-end',success}); this.emit({type:'state'});
  }
}
