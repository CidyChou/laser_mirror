import type { CommunityOutcome, CommunityTarget, GameCommunity, OperationContext } from '../operations';
import { RECOMMENDATION_OPENLINK, WECHAT_OPERATIONS, reportOperation, type WeChatOperationsConfig } from './config';
import { WeChatActivity } from './WeChatActivity';

export const RECOMMENDED_KEY = 'laser-mirror-wechat-recommended-v1';

export class WeChatCommunity implements GameCommunity {
  private active: { displayed: boolean; close: () => void } | null = null;
  private destroyed = false;

  constructor(private readonly api: any, private readonly activity: WeChatActivity,
    private readonly config: WeChatOperationsConfig = WECHAT_OPERATIONS) {}

  private link(target: CommunityTarget) {
    const config = this.config.community;
    if (target === 'recommend') return config.recommendationEnabled ? RECOMMENDATION_OPENLINK : '';
    if (target === 'circleRecommend') return config.circleRecommendationOpenlink.trim();
    if (target === 'help') return config.helpOpenlink.trim() || config.gameClubOpenlink.trim();
    return config.gameClubOpenlink.trim();
  }

  canOpen(target: CommunityTarget) {
    if (target === 'circleRecommend') {
      try {
        const version = this.api.getSystemInfoSync?.()?.SDKVersion;
        if (typeof version === 'string') {
          const [major, minor, patch] = version.split('.').map(Number);
          if (major < 3 || (major === 3 && (minor < 7 || (minor === 7 && patch < 6)))) return false;
        }
      } catch {}
    }
    return !this.destroyed && typeof this.api.createPageManager === 'function' && !!this.link(target);
  }

  isRecommended() {
    try { return this.api.getStorageSync?.(RECOMMENDED_KEY) === 'true'; } catch { return false; }
  }

  onGameInteraction() {
    // Older PageManagers have no destroy event. A new canvas gesture means
    // their page has returned and releases the presentation lock.
    if (this.active?.displayed) this.active.close();
  }

  open(target: CommunityTarget, context: OperationContext): Promise<CommunityOutcome> {
    if (!this.canOpen(target)) return Promise.resolve('unavailable');
    const owner = {};
    if (!this.activity.acquire(owner)) return Promise.resolve('busy');
    return new Promise<CommunityOutcome>(resolve => {
      let manager: any, finished = false, resolved = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const report = (action: string) => reportOperation(this.api, 'laser_community', { ...context, target, action });
      const current = { displayed: false, close: () => close() };
      const close = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (this.active === current) this.active = null;
        try { manager?.destroy?.(); } catch {}
        this.activity.release(owner);
        if (!resolved) { resolved = true; resolve('error'); }
      };
      const shown = () => {
        if (finished || current.displayed) return;
        current.displayed = true;
        clearTimeout(timer);
        report('show');
        if (!resolved) { resolved = true; resolve('opened'); }
      };
      const error = () => { if (!finished) { report('error'); close(); } };
      this.active = current;
      report('request');
      try {
        manager = this.api.createPageManager();
        manager.on?.('show', shown);
        manager.on?.('error', error);
        manager.on?.('destroy', (result?: { isRecommended?: boolean }) => {
          if (finished) return;
          if (target === 'recommend' && current.displayed && typeof result?.isRecommended === 'boolean') {
            try { this.api.setStorageSync?.(RECOMMENDED_KEY, String(result.isRecommended)); } catch {}
          }
          report('close');
          close();
        });
        timer = setTimeout(error, 15_000);
        let supportsEvents = typeof manager.on === 'function';
        try {
          const version = this.api.getSystemInfoSync?.()?.SDKVersion;
          if (typeof version === 'string') {
            const [major, minor, patch] = version.split('.').map(Number);
            supportsEvents &&= major > 3 || (major === 3 && (minor > 8 || (minor === 8 && patch >= 6)));
          }
        } catch {}
        void Promise.resolve(manager.show({ openlink: this.link(target) })).then(() => {
          if (!supportsEvents) shown();
        }, error);
      } catch { error(); }
    });
  }

  destroy() { this.destroyed = true; this.active?.close(); }
}
