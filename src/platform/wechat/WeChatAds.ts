import type { GameAds, NativeAdRect, OperationContext, RewardOutcome, RewardPlacement } from '../operations';
import { WECHAT_OPERATIONS, reportOperation, type WeChatOperationsConfig } from './config';
import { WeChatActivity } from './WeChatActivity';

export const LAST_AD_CLOSED_KEY = 'laser-mirror-last-ad-closed-v1';
const LOAD_TIMEOUT = 15_000;
const SHOW_TIMEOUT = 5_000;
const RETRY_DELAY = 30_000;

interface VideoEntry {
  id: string;
  ad: any;
  ready: boolean;
  disposed: boolean;
  loading: Promise<boolean> | null;
  finishLoad?: (ok: boolean) => void;
  onLoad: () => void;
  onError: () => void;
}

export class WeChatAds implements GameAds {
  private videos = new Map<string, VideoEntry>();
  private retryAt = new Map<string, number>();
  private cancelRequest: (() => void) | null = null;
  private interstitial: any = null;
  private interstitialReady = false;
  private interstitialRetryAt = 0;
  private interstitialTimer: ReturnType<typeof setTimeout> | undefined;
  private menu: any = null;
  private menuRect: NativeAdRect | null = null;
  private menuPending = false;
  private menuLoaded = false;
  private menuShowing = false;
  private menuDismissed = false;
  private menuRetryAt = 0;
  private menuTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly menuListeners = new Set<() => void>();
  private destroyed = false;

  constructor(private readonly api: any, private readonly activity: WeChatActivity,
    private readonly config: WeChatOperationsConfig = WECHAT_OPERATIONS) {}

  canReward(placement: RewardPlacement) {
    return !this.destroyed && !!this.config.ads[placement].trim() && typeof this.api.createRewardedVideoAd === 'function';
  }

  preloadRewards(placements: readonly RewardPlacement[]) {
    for (const id of new Set(placements.filter(p => this.canReward(p)).map(p => this.config.ads[p].trim()))) {
      const entry = this.video(id);
      if (entry) void this.prepare(entry);
    }
  }

  private video(id: string): VideoEntry | null {
    const existing = this.videos.get(id);
    if (existing) return existing;
    if (this.destroyed || Date.now() < (this.retryAt.get(id) ?? 0)) return null;
    try {
      const ad = this.api.createRewardedVideoAd({ adUnitId: id, disableFallbackSharePage: true });
      if (!ad?.onClose || !ad?.onError || !ad?.load || !ad?.show) {
        ad?.destroy?.();
        return null;
      }
      const entry: VideoEntry = { id, ad, ready: false, disposed: false, loading: null,
        onLoad: () => { if (!entry.disposed) { entry.ready = true; entry.finishLoad?.(true); } },
        onError: () => {
          entry.ready = false;
          this.retryAt.set(id, Date.now() + RETRY_DELAY);
          entry.finishLoad?.(false);
        },
      };
      this.videos.set(id, entry);
      ad.onLoad?.(entry.onLoad);
      ad.onError(entry.onError);
      return entry;
    } catch {
      this.retryAt.set(id, Date.now() + RETRY_DELAY);
      const partial = this.videos.get(id);
      if (partial) this.disposeVideo(partial);
      return null;
    }
  }

  private prepare(entry: VideoEntry): Promise<boolean> {
    if (entry.disposed || this.destroyed) return Promise.resolve(false);
    if (entry.ready) return Promise.resolve(true);
    if (entry.loading) return entry.loading;
    if (Date.now() < (this.retryAt.get(entry.id) ?? 0)) return Promise.resolve(false);
    let finish!: (ok: boolean) => void;
    const pending = new Promise<boolean>(resolve => { finish = resolve; });
    entry.loading = pending;
    let settled = false;
    const timer = setTimeout(() => {
      done(false);
      this.disposeVideo(entry);
    }, LOAD_TIMEOUT);
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      entry.finishLoad = undefined;
      entry.loading = null;
      entry.ready = ok && !entry.disposed && !this.destroyed;
      if (!entry.ready) this.retryAt.set(entry.id, Date.now() + RETRY_DELAY);
      finish(entry.ready);
    };
    entry.finishLoad = done;
    try { void Promise.resolve(entry.ad.load()).then(() => done(true), () => done(false)); }
    catch { done(false); }
    return pending;
  }

  async showReward(placement: RewardPlacement, context: OperationContext): Promise<RewardOutcome> {
    const id = this.config.ads[placement].trim();
    if (!this.canReward(placement)) { this.event(placement, 'unavailable', context); return 'unavailable'; }
    const owner = {};
    if (!this.activity.acquire(owner)) return 'busy';
    this.setMenuPlacement(null);
    this.event(placement, 'request', context);
    const entry = this.video(id);
    if (!entry) { this.activity.release(owner); this.event(placement, 'error', context); return 'error'; }
    return new Promise<RewardOutcome>(resolve => {
      let finished = false, invoked = false, presented = false;
      let showTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (outcome: RewardOutcome) => {
        if (finished) return;
        finished = true;
        clearTimeout(showTimer);
        try { entry.ad.offClose?.(close); entry.ad.offError?.(error); } catch {}
        if (invoked && (outcome === 'rewarded' || outcome === 'cancelled' || presented)) this.recordClose();
        if (this.cancelRequest === cancel) this.cancelRequest = null;
        entry.ready = false;
        this.event(placement, outcome === 'rewarded' ? 'complete' : outcome === 'cancelled' ? 'cancel' : 'error', context);
        if (outcome === 'error') this.disposeVideo(entry);
        this.activity.release(owner);
        resolve(outcome);
      };
      const close = (result?: { isEnded?: boolean }) => {
        if (invoked) finish(result?.isEnded === true ? 'rewarded' : 'cancelled');
      };
      const error = () => { if (invoked) finish('error'); };
      const cancel = () => finish('error');
      this.cancelRequest = cancel;
      try { entry.ad.onClose(close); entry.ad.onError(error); }
      catch { finish('error'); return; }
      void this.prepare(entry).then(ready => {
        if (finished) return;
        if (!ready || this.destroyed) { finish('error'); return; }
        invoked = true;
        showTimer = setTimeout(() => finish('error'), SHOW_TIMEOUT);
        try {
          void Promise.resolve(entry.ad.show()).then(() => {
            if (finished) return;
            presented = true;
            clearTimeout(showTimer);
            this.event(placement, 'show', context);
          }, () => finish('error'));
        } catch { finish('error'); }
      });
    });
  }

  reportReward(placement: RewardPlacement, context: OperationContext, amount: number) {
    this.event(placement, 'reward', context, amount);
  }

  private event(placement: RewardPlacement, action: string, context: OperationContext, amount?: number) {
    reportOperation(this.api, 'laser_rewarded_ad', { ...context, placement, action,
      adunit: this.config.ads[placement], ...(amount === undefined ? {} : { amount }) });
  }

  private recordClose() {
    try { this.api.setStorageSync?.(LAST_AD_CLOSED_KEY, String(Date.now())); } catch {}
  }

  canInterstitial() {
    return !this.destroyed && !!this.config.ads.interstitial.trim() && typeof this.api.createInterstitialAd === 'function';
  }

  preloadInterstitial() {
    if (!this.canInterstitial() || this.interstitial || Date.now() < this.interstitialRetryAt) return;
    let ad: any;
    try {
      ad = this.api.createInterstitialAd({ adUnitId: this.config.ads.interstitial.trim() });
      this.interstitial = ad;
      this.interstitialTimer = setTimeout(() => this.disposeInterstitial(), LOAD_TIMEOUT);
      ad.onLoad(() => {
        if (this.interstitial !== ad) return;
        this.interstitialReady = true;
        clearTimeout(this.interstitialTimer);
      });
      ad.onError(() => { if (this.interstitial === ad && !this.cancelRequest) this.disposeInterstitial(); });
    } catch { this.disposeInterstitial(); }
  }

  showInterstitial(context: OperationContext): Promise<boolean> {
    let last = 0;
    try { last = Number(this.api.getStorageSync?.(LAST_AD_CLOSED_KEY)) || 0; } catch {}
    if (!this.canInterstitial() || !this.interstitialReady || !this.interstitial
      || (last > 0 && Date.now() - last < this.config.interstitial.quietSeconds * 1000)) return Promise.resolve(false);
    const owner = {};
    if (!this.activity.acquire(owner)) return Promise.resolve(false);
    this.setMenuPlacement(null);
    const ad = this.interstitial;
    this.interstitialReady = false;
    const report = (action: string) => reportOperation(this.api, 'laser_interstitial', {
      ...context, action, adunit: this.config.ads.interstitial,
    });
    report('request');
    return new Promise<boolean>(resolve => {
      let done = false, presented = false;
      const timer = setTimeout(() => finish(false), SHOW_TIMEOUT);
      const finish = (closed: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { ad.offClose?.(close); ad.offError?.(error); } catch {}
        if (closed || presented) this.recordClose();
        if (this.cancelRequest === cancel) this.cancelRequest = null;
        report(closed ? 'close' : 'error');
        this.disposeInterstitial();
        this.activity.release(owner);
        resolve(closed);
      };
      const close = () => finish(true);
      const error = () => finish(false);
      const cancel = () => finish(false);
      this.cancelRequest = cancel;
      try {
        ad.onClose(close); ad.onError(error);
        void Promise.resolve(ad.show()).then(() => {
          if (done) return;
          presented = true;
          clearTimeout(timer);
          report('show');
        }, error);
      } catch { error(); }
    });
  }

  menuSize() {
    const { width, height } = this.config.menuTemplate;
    return !this.destroyed && !this.menuDismissed && Date.now() >= this.menuRetryAt
      && !!this.config.ads.menu.trim() && typeof this.api.createCustomAd === 'function'
      && width > 0 && height > 0 ? { width, height } : null;
  }

  onMenuChange(handler: () => void) { this.menuListeners.add(handler); return () => { this.menuListeners.delete(handler); }; }

  setMenuPlacement(rect: NativeAdRect | null) {
    this.menuRect = rect;
    if (!rect) {
      if (this.menuShowing || this.menuPending) {
        try { void Promise.resolve(this.menu?.hide()).catch(() => this.disposeMenu()); } catch { this.disposeMenu(); }
      }
      this.menuShowing = false;
      return;
    }
    if (!this.menuSize() || this.menuDismissed || Date.now() < this.menuRetryAt) return;
    if (!this.menu) {
      try {
        const ad = this.api.createCustomAd({ adUnitId: this.config.ads.menu.trim(), adIntervals: 60,
          style: { left: rect.x, top: rect.y, width: rect.width } });
        this.menu = ad;
        this.menuTimer = setTimeout(() => this.disposeMenu(), LOAD_TIMEOUT);
        ad.onLoad(() => {
          if (this.menu !== ad) return;
          clearTimeout(this.menuTimer);
          this.menuLoaded = true;
          this.showMenu();
        });
        ad.onError(() => { if (this.menu === ad) this.disposeMenu(); });
        ad.onResize?.((size: { width: number; height: number }) => {
          if (this.menu !== ad) return;
          const bounds = this.menuRect;
          if (!bounds || !Number.isFinite(size.width) || !Number.isFinite(size.height)
            || size.width <= 0 || size.height <= 0 || size.width > bounds.width + 1 || size.height > bounds.height + 1) this.disposeMenu();
        });
        ad.onClose?.(() => { if (this.menu === ad) { this.menuDismissed = true; this.disposeMenu(); } });
      } catch { this.disposeMenu(); }
    } else {
      if (this.menu.style.left !== rect.x) this.menu.style.left = rect.x;
      if (this.menu.style.top !== rect.y) this.menu.style.top = rect.y;
      if (!this.menuShowing && !this.menuPending) this.showMenu();
    }
  }

  private showMenu() {
    const ad = this.menu, rect = this.menuRect;
    if (!ad || !rect || !this.menuLoaded || this.menuPending || this.menuShowing) return;
    ad.style.left = rect.x;
    ad.style.top = rect.y;
    this.menuPending = true;
    clearTimeout(this.menuTimer);
    this.menuTimer = setTimeout(() => { if (this.menu === ad) this.disposeMenu(); }, SHOW_TIMEOUT);
    try {
      void Promise.resolve(ad.show()).then(() => {
        if (this.menu !== ad) return;
        clearTimeout(this.menuTimer);
        this.menuPending = false;
        this.menuShowing = true;
        if (!this.menuRect) this.setMenuPlacement(null);
      }, () => { if (this.menu === ad) this.disposeMenu(); });
    } catch { this.disposeMenu(); }
  }

  private disposeVideo(entry: VideoEntry) {
    if (entry.disposed) return;
    entry.disposed = true;
    entry.finishLoad?.(false);
    this.videos.delete(entry.id);
    try { entry.ad.offLoad?.(entry.onLoad); entry.ad.offError?.(entry.onError); entry.ad.destroy?.(); } catch {}
  }

  private disposeInterstitial() {
    const ad = this.interstitial;
    this.interstitial = null;
    this.interstitialReady = false;
    this.interstitialRetryAt = Date.now() + RETRY_DELAY;
    clearTimeout(this.interstitialTimer);
    try { ad?.destroy?.(); } catch {}
  }

  private disposeMenu() {
    const ad = this.menu;
    this.menu = null;
    this.menuLoaded = false;
    this.menuPending = this.menuShowing = false;
    this.menuRetryAt = Date.now() + RETRY_DELAY;
    clearTimeout(this.menuTimer);
    try { ad?.destroy?.(); } catch {}
    if (ad) for (const handler of this.menuListeners) { try { handler(); } catch {} }
  }

  destroy() {
    this.destroyed = true;
    this.cancelRequest?.();
    for (const entry of this.videos.values()) this.disposeVideo(entry);
    this.disposeInterstitial();
    this.disposeMenu();
    this.menuListeners.clear();
  }
}
