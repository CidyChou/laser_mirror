import { GameConfig } from '@/config/GameConfig';
import type { PlatformKind, ViewportInfo } from '@/platform/IPlatform';

export type Quality = 'high' | 'medium' | 'low';

export class PerformanceManager {
  quality: Quality = 'high';
  renderResolution = 1;
  private samples: number[] = [];
  private cooldown = 0;
  private baseResolution = 1;
  private pendingQuality: Quality | null = null;

  seedFromDevice(opts: { kind: PlatformKind; touch: boolean; viewport: ViewportInfo }) {
    // The beam's full visual identity is inexpensive in the new single-mesh
    // path, so mobile starts at high and adapts from measured frame time.
    this.quality = 'high';
    this.pendingQuality = null;
    this.samples = [];
    this.baseResolution = fitResolutionToBudget(opts.viewport);
    this.renderResolution = this.baseResolution;
  }

  frame(deltaMs: number, allowQualityChange = true): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.samples.push(deltaMs);
    if (this.samples.length > 90) this.samples.shift();

    if (this.pendingQuality && allowQualityChange) {
      return this.applyQuality(this.pendingQuality);
    }
    if (this.cooldown > 0) { this.cooldown--; return false; }
    if (this.samples.length < 60) return false;

    const avg = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    const ordered = [...this.samples].sort((a, b) => a - b);
    const p95 = ordered[Math.floor((ordered.length - 1) * 0.95)];
    const fps = 1000 / avg;
    let recommended: Quality | null = null;

    if (this.quality === 'high' && (fps < 52 || p95 > 24)) recommended = 'medium';
    else if (this.quality === 'medium' && (fps < 40 || p95 > 30)) recommended = 'low';
    else if (this.quality === 'low' && fps > 54 && p95 < 22) recommended = 'medium';
    else if (this.quality === 'medium' && fps > 58 && p95 < 19.5) recommended = 'high';

    if (!recommended) return false;
    if (!allowQualityChange) {
      this.pendingQuality = recommended;
      return false;
    }
    return this.applyQuality(recommended);
  }

  private applyQuality(next: Quality): boolean {
    this.pendingQuality = null;
    if (next === this.quality) return false;
    const upgrading = qualityRank(next) > qualityRank(this.quality);
    this.quality = next;
    this.cooldown = upgrading ? 300 : 180;
    this.samples = [];

    const target = next === 'low'
      ? Math.min(this.baseResolution, quantizeResolution(Math.max(
        GameConfig.renderer.minAdaptiveResolution,
        this.baseResolution * GameConfig.renderer.lowQualityResolutionScale,
      )))
      : this.baseResolution;
    if (target === this.renderResolution) return false;
    this.renderResolution = target;
    return true;
  }

  get particleBudget(): number {
    if (this.quality === 'high') return GameConfig.performance.highParticleBudget;
    if (this.quality === 'medium') return GameConfig.performance.mediumParticleBudget;
    return GameConfig.performance.lowParticleBudget;
  }
}

function qualityRank(quality: Quality) {
  return quality === 'high' ? 2 : quality === 'medium' ? 1 : 0;
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
