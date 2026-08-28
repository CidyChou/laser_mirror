import { GameConfig } from '@/config/GameConfig';
import type { PlatformKind, ViewportInfo } from '@/platform/IPlatform';

export type Quality = 'high' | 'medium' | 'low';

export class PerformanceManager {
  quality: Quality = 'high';
  renderResolution = 1;
  private samples: number[] = [];
  private cooldown = 0;
  private baseResolution = 1;
  private resolutionDegraded = false;

  seedFromDevice(opts: { kind: PlatformKind; touch: boolean; viewport: ViewportInfo }) {
    const mobile = opts.kind !== 'web' || opts.touch;
    if (mobile) this.quality = 'medium';
    this.baseResolution = fitResolutionToBudget(opts.viewport);
    this.renderResolution = this.baseResolution;
  }

  frame(deltaMs: number): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.samples.push(deltaMs);
    if (this.samples.length > 90) this.samples.shift();
    if (this.cooldown > 0) { this.cooldown--; return false; }
    if (this.samples.length < 45) return false;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const fps = 1000 / avg;
    if (fps < 38 && this.quality === 'high') { this.quality = 'medium'; this.cooldown = 180; }
    else if (fps < 32 && this.quality === 'medium') {
      this.quality = 'low';
      this.cooldown = 180;
      if (!this.resolutionDegraded) {
        this.resolutionDegraded = true;
        const next = quantizeResolution(Math.max(
          GameConfig.renderer.minAdaptiveResolution,
          this.baseResolution * GameConfig.renderer.lowQualityResolutionScale,
        ));
        if (next < this.renderResolution) {
          this.renderResolution = next;
          return true;
        }
      }
    }
    else if (fps > 57 && this.quality === 'low') { this.quality = 'medium'; this.cooldown = 300; }
    return false;
  }

  get particleBudget(): number {
    if (this.quality === 'high') return GameConfig.performance.highParticleBudget;
    if (this.quality === 'medium') return GameConfig.performance.mediumParticleBudget;
    return GameConfig.performance.lowParticleBudget;
  }
}

function fitResolutionToBudget(viewport: ViewportInfo): number {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const deviceResolution = Math.min(
    Math.max(1, viewport.pixelRatio || 1),
    GameConfig.renderer.maxResolution,
  );
  const budgetResolution = Math.sqrt(GameConfig.renderer.maxBackBufferPixels / (width * height));
  return quantizeResolution(Math.max(1, Math.min(deviceResolution, budgetResolution)));
}

function quantizeResolution(value: number): number {
  // Always round down so quantization cannot push the framebuffer over budget.
  return Math.max(1, Math.floor(value * 4) / 4);
}
