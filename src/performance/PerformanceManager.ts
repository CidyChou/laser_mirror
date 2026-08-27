import { GameConfig } from '@/config/GameConfig';

export type Quality = 'high' | 'medium' | 'low';

export class PerformanceManager {
  quality: Quality = 'high';
  private samples: number[] = [];
  private cooldown = 0;

  frame(deltaMs: number) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.samples.push(deltaMs);
    if (this.samples.length > 120) this.samples.shift();
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (this.samples.length < 90) return;
    const avg = this.samples.reduce((a,b)=>a+b,0)/this.samples.length;
    const fps = 1000/avg;
    if (fps < 38 && this.quality === 'high') { this.quality='medium'; this.cooldown=180; }
    else if (fps < 29 && this.quality === 'medium') { this.quality='low'; this.cooldown=180; }
    else if (fps > 57 && this.quality === 'low') { this.quality='medium'; this.cooldown=300; }
  }

  get particleBudget(): number {
    if (this.quality === 'high') return GameConfig.performance.highParticleBudget;
    if (this.quality === 'medium') return GameConfig.performance.mediumParticleBudget;
    return GameConfig.performance.lowParticleBudget;
  }
}
