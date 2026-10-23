import { GameApplication } from '../../src/app/GameApplication';
import { WebPlatform } from '../../src/platform/web/WebPlatform';
import { WeChatPlatform } from '../../src/platform/wechat/WeChatPlatform';
import { WECHAT_OPERATIONS } from '../../src/platform/wechat/config';
import { stageId } from '../../src/levels/campaign';
import { winReward } from '../../src/economy/wallet';
import { saveHearts } from '../../src/economy/hearts';

const host = document.querySelector<HTMLDivElement>('#app')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const config = structuredClone(WECHAT_OPERATIONS);
const saved = new Map<string, string>();
const events: object[] = [];
let currentAd: MockAd | null = null, currentPage: MockPage | null = null;
class MockAd {
  private handlers = new Map<string, Set<(value?: any) => void>>();
  private element: HTMLDivElement;
  style: { left?: number; top?: number; width?: number };
  constructor(private kind: string, options: any) {
    this.style = options.style ?? {};
    this.element = document.createElement('div');
    this.element.className = kind === 'menu' ? 'native' : 'native video';
    this.element.textContent = kind === 'menu' ? '原生模板广告 · 模拟 20:7' : '模拟广告\n在右侧选择完整看完或提前关闭';
    this.element.hidden = true;
    host.append(this.element);
    queueMicrotask(() => this.emit('load'));
  }
  private add(type: string, fn: (value?: any) => void) { const list = this.handlers.get(type) ?? new Set(); list.add(fn); this.handlers.set(type, list); }
  private remove(type: string, fn: (value?: any) => void) { this.handlers.get(type)?.delete(fn); }
  onLoad = (fn: () => void) => this.add('load', fn);
  offLoad = (fn: () => void) => this.remove('load', fn);
  onError = (fn: () => void) => this.add('error', fn);
  offError = (fn: () => void) => this.remove('error', fn);
  onClose = (fn: () => void) => this.add('close', fn);
  offClose = (fn: () => void) => this.remove('close', fn);
  onResize = (fn: () => void) => this.add('resize', fn);
  emit(type: string, value?: any) { for (const fn of [...(this.handlers.get(type) ?? [])]) fn(value); }
  load() { this.emit('load'); return Promise.resolve(); }
  show() {
    this.element.hidden = false;
    this.element.style.display = 'grid';
    if (this.kind === 'menu') Object.assign(this.element.style, { left: `${this.style.left}px`, top: `${this.style.top}px`, width: `${this.style.width}px`, height: '112px' });
    else currentAd = this;
    return Promise.resolve();
  }
  hide() { this.element.style.display = 'none'; return Promise.resolve(); }
  destroy() { if (currentAd === this) currentAd = null; this.element.remove(); }
  close(complete: boolean) { this.hide(); this.emit('close', { isEnded: complete }); currentAd = null; }
}
class MockPage {
  private handlers = new Map<string, (result?: any) => void>();
  on(type: string, callback: (result?: any) => void) { this.handlers.set(type, callback); }
  show() { currentPage = this; queueMicrotask(() => this.handlers.get('show')?.()); return Promise.resolve(); }
  close() { this.handlers.get('destroy')?.({ isRecommended: true }); }
  destroy() { if (currentPage === this) currentPage = null; }
}
const api = {
  getSystemInfoSync: () => ({ SDKVersion: '3.8.6' }),
  getStorageSync: (key: string) => saved.get(key), setStorageSync: (key: string, value: string) => { saved.set(key, value); },
  createRewardedVideoAd: (options: any) => new MockAd('rewarded', options),
  createInterstitialAd: (options: any) => new MockAd('interstitial', options),
  createCustomAd: (options: any) => new MockAd('menu', options),
  createPageManager: () => new MockPage(),
  reportEvent: (name: string, data: object) => { events.push({ name, ...data }); report(); },
};
function configure() {
  const enabled = document.querySelector<HTMLSelectElement>('#configuration')!.value === 'configured';
  for (const key of Object.keys(config.ads) as Array<keyof typeof config.ads>) config.ads[key] = enabled ? `adunit-mock-${key}` : '';
  config.community.gameClubOpenlink = enabled ? 'mock-this-game-circle' : '';
  config.community.helpOpenlink = enabled ? 'mock-this-game-help' : '';
  config.community.circleRecommendationOpenlink = enabled ? 'mock-this-game-circle-recommend' : '';
}
configure();
const native = new WeChatPlatform(api, config);
const platform = new WebPlatform();
platform.viewport = () => ({ width: host.clientWidth, height: host.clientHeight, pixelRatio: 2 });
platform.storage = { get: key => saved.get(key) ?? null, set: (key, value) => { saved.set(key, value); } };
Object.assign(platform, { ads: native.ads, community: native.community, onExternalActivityChange: native.onExternalActivityChange.bind(native) });
const application = new GameApplication(platform);
await application.start(undefined, { skipLoading: true });
const game = application as any;
function refresh() { game.view.configureOperations(true, native.ads.menuSize()); game.view.setCoinBalance(game.coins); game.wake(); report(); }
function reset() { game.session.load(0); game.session.restoreHearts(5); saveHearts(platform, 5); game.tutorial.skip(); game.syncTutorial(); game.coins = 40; }
function report() {
  if (!game?.view) return;
  status.value = `金币 ${game.coins} · 爱心 ${game.session.state.hearts}\n最近事件\n${JSON.stringify(events.slice(-3), null, 2)}`;
}
function bind(id: string, run: () => void) { document.getElementById(id)!.addEventListener('click', () => { if (game.operationBusy && !['complete','cancel','back'].includes(id)) return; run(); refresh(); }); }
bind('playing', reset);
bind('menu', () => { reset(); game.view.showLevelSelect(0, game.completedLevels, false, 0); });
bind('supply', () => { reset(); game.session.restoreHearts(2); game.openSupply(); });
bind('lose', () => { reset(); game.session.restoreHearts(0); game.showHeartRefill(performance.now()); });
bind('community', () => game.openCommunityHub());
bind('win', () => {
  reset(); game.session.state.won = true; game.winRewardAmount = winReward(0); game.coins = 40 + winReward(0);
  game.winInterstitialDue = true;
  game.view.showResult('win', { title: '通关成功', subtitle: '第 1 关已完成', tip: '首通奖励已到账', primary: '下一关', reward: winReward(0),
    bonus: native.ads.canReward('double') ? '看视频 · 本关金币翻倍' : undefined,
    recommend: true, community: native.community.canOpen('club') }, performance.now() - 1000);
  native.ads.preloadRewards(['double']); native.ads.preloadInterstitial();
  game.view.startWinCoins(performance.now() - 1000, 40, winReward(0)); game.view.revealWinCoins();
});
bind('complete', () => currentAd?.close(true));
bind('cancel', () => currentAd?.close(false));
bind('back', () => currentPage?.close());
document.getElementById('size')!.addEventListener('change', () => {
  const [width, height] = document.querySelector<HTMLSelectElement>('#size')!.value.split('×').map(Number);
  host.style.width = `${width}px`; host.style.height = `${height}px`;
  game.app.renderer.resize(width, height); game.view.resize(width, height); refresh();
});
document.getElementById('configuration')!.addEventListener('change', () => { configure(); reset(); refresh(); });
refresh();
export { game, native, saved };
