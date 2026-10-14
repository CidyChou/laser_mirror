import type { Application, Ticker } from 'pixi.js';
import type { IPlatform } from '@/platform/IPlatform';
import { LoadingScene } from '@/rendering/loading/LoadingScene';

/** Owns the loading ticker and input lifetime, independently of the game session. */
export class StartupScreen {
  readonly scene: LoadingScene;
  private elapsedMs = 0;
  private leavingAt: number | null = null;
  private disposed = false;
  private unresize: () => void;
  private resolveStart: ((started: boolean) => void) | null = null;
  private resolveLeave: (() => void) | null = null;

  constructor(private readonly app: Application, platform: IPlatform) {
    const reducedMotion = platform.kind === 'web' && typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene = new LoadingScene(reducedMotion);
    const resize = () => {
      const v = platform.viewport();
      this.scene.resize(v.width, v.height, platform.safeTop());
    };
    resize();
    this.unresize = platform.onResize(resize);
    app.stage.addChild(this.scene);
    app.ticker.add(this.tick);
    app.ticker.start();
    app.renderer.render(app.stage);
  }

  private tick = (ticker: Ticker) => {
    this.elapsedMs += Math.min(ticker.deltaMS, 50);
    this.scene.update(this.elapsedMs, ticker.deltaMS);
    if (this.leavingAt !== null) {
      const progress = Math.min(1, (this.elapsedMs - this.leavingAt) / 240);
      this.scene.alpha = 1 - progress;
      if (progress === 1) this.dispose();
    }
  };

  waitForStart(onStart: () => void): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.scene.showStart(this.elapsedMs);
    return new Promise(resolve => {
      this.resolveStart = resolve;
      this.scene.startButton.once('pointertap', () => {
        this.scene.startButton.eventMode = 'none';
        onStart();
        this.resolveStart = null;
        resolve(true);
      });
    });
  }

  dismiss(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.leavingAt = this.elapsedMs;
    // Keep the full-screen hit area until the fade ends so rapid taps cannot
    // reach the game before its loading guard is released.
    this.scene.interactiveChildren = false;
    return new Promise(resolve => { this.resolveLeave = resolve; });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unresize();
    this.app.ticker.remove(this.tick);
    this.scene.removeFromParent();
    // Loaded textures belong to the shared asset cache, not this short-lived scene.
    this.scene.destroy({ children: true });
    this.resolveStart?.(false);
    this.resolveLeave?.();
    this.resolveStart = null;
    this.resolveLeave = null;
  }
}
