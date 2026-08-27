import { GameConfig } from '@/config/GameConfig';
import type { PlatformKind } from '@/platform/IPlatform';

export type Quality = 'high' | 'medium' | 'low';

export class PerformanceManager {
  quality: Quality = 'high';
  private samples: number[] = [];
  private cooldown = 0;

  seedFromDevice(opts: { kind: PlatformKind; touch: boolean }) {
    const mobile = opts.kind !== 'web' || opts.touch;
    if (mobile) this.quality = 'medium';
  }

  frame(deltaMs: number) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.samples.push(deltaMs);
    if (this.samples.length > 90) this.samples.shift();
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (this.samples.length < 45) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const fps = 1000 / avg;
    if (fps < 38 && this.quality === 'high') { this.quality = 'medium'; this.cooldown = 180; }
    else if (fps < 32 && this.quality === 'medium') { this.quality = 'low'; this.cooldown = 180; }
    else if (fps > 57 && this.quality === 'low') { this.quality = 'medium'; this.cooldown = 300; }
  }

  get particleBudget(): number {
    if (this.quality === 'high') return GameConfig.performance.highParticleBudget;
    if (this.quality === 'medium') return GameConfig.performance.mediumParticleBudget;
    return GameConfig.performance.lowParticleBudget;
  }
}
