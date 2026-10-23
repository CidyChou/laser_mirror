import assert from 'node:assert/strict';
import { GameApplication } from '../src/app/GameApplication';
import { bonusRemaining, consumeBonus, recordFirstClear } from '../src/economy/operations';
import { GameSession } from '../src/gameplay/GameSession';
import { mirrorHint } from '../src/gameplay/hints';
import { computeGeometry } from '../src/gameplay/geometry';
import { itemKey } from '../src/gameplay/levelAccess';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { LevelRepository } from '../src/levels/LevelRepository';
import { WeChatActivity } from '../src/platform/wechat/WeChatActivity';
import { LAST_AD_CLOSED_KEY, WeChatAds } from '../src/platform/wechat/WeChatAds';
import { RECOMMENDED_KEY, WeChatCommunity } from '../src/platform/wechat/WeChatCommunity';
import { WeChatPlatform } from '../src/platform/wechat/WeChatPlatform';
import { RECOMMENDATION_OPENLINK, WECHAT_OPERATIONS } from '../src/platform/wechat/config';

const context = { stage: 'level:1', screen: 'playing' };
const flush = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };
class Events {
  listeners = new Map<string, Set<(value?: any) => void>>();
  on(name: string, handler: (value?: any) => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(handler); this.listeners.set(name, listeners);
  }
  off(name: string, handler: (value?: any) => void) { this.listeners.get(name)?.delete(handler); }
  emit(name: string, value?: any) { for (const handler of [...(this.listeners.get(name) ?? [])]) handler(value); }
}
class Ad extends Events {
  loads = 0; shows = 0; hides = 0; destroyed = 0;
  style: any = {};
  loadResult = () => Promise.resolve();
  showResult = () => Promise.resolve();
  onLoad = (handler: (value?: any) => void) => this.on('load', handler);
  offLoad = (handler: (value?: any) => void) => this.off('load', handler);
  onClose = (handler: (value?: any) => void) => this.on('close', handler);
  offClose = (handler: (value?: any) => void) => this.off('close', handler);
  onError = (handler: (value?: any) => void) => this.on('error', handler);
  offError = (handler: (value?: any) => void) => this.off('error', handler);
  onResize = (handler: (value?: any) => void) => this.on('resize', handler);
  load() { this.loads++; return this.loadResult(); }
  show() { this.shows++; return this.showResult(); }
  hide() { this.hides++; return Promise.resolve(); }
  destroy() { this.destroyed++; }
}
function fixture() {
  const storage = new Map<string, string>();
  const videos: Ad[] = [], interstitials: Ad[] = [], menus: Ad[] = [], pages: Array<Events & { destroyed: number; link?: string; show: (input: any) => Promise<void>; destroy: () => void }> = [];
  const events: any[] = [];
  const config = structuredClone(WECHAT_OPERATIONS);
  const api = {
    getSystemInfoSync: () => ({ SDKVersion: '3.8.6' }),
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: string) => { storage.set(key, value); },
    reportEvent: (name: string, data: object) => { events.push({ name, ...data }); },
    createRewardedVideoAd(options: any) {
      assert.equal(options.disableFallbackSharePage, true);
      const ad = new Ad(); videos.push(ad); return ad;
    },
    createInterstitialAd() { const ad = new Ad(); interstitials.push(ad); return ad; },
    createCustomAd(options: any) { const ad = new Ad(); ad.style = { ...options.style }; menus.push(ad); return ad; },
    createPageManager() {
      const page = Object.assign(new Events(), { destroyed: 0, link: '',
        show(input: any) { page.link = input.openlink; return Promise.resolve(); },
        destroy() { page.destroyed++; },
      });
      pages.push(page); return page;
    },
  };
  const activity = new WeChatActivity();
  return { config, api, storage, videos, interstitials, menus, pages, events, activity,
    ads: new WeChatAds(api, activity, config), community: new WeChatCommunity(api, activity, config) };
}

const empty = fixture();
empty.ads.preloadRewards(['hearts', 'coins']); empty.ads.preloadInterstitial();
assert.equal(await empty.ads.showReward('coins', context), 'unavailable');
assert.equal(await empty.ads.showInterstitial(context), false);
assert.equal(empty.ads.menuSize(), null);
assert.equal(empty.community.canOpen('club'), false);
assert.equal(empty.community.canOpen('recommend'), true, 'the official recommendation constant does not need an app-specific ID');
assert.equal(empty.videos.length + empty.interstitials.length + empty.menus.length, 0);
empty.ads.destroy(); empty.community.destroy();

const shared = fixture();
shared.config.ads.hearts = shared.config.ads.coins = 'adunit-shared';
shared.ads.preloadRewards(['hearts', 'coins']); await flush();
assert.equal(shared.videos.length, 1); assert.equal(shared.videos[0].loads, 1);
const video = shared.ads.showReward('hearts', context); await flush();
assert.equal(shared.videos[0].shows, 1);
assert.equal(await shared.ads.showReward('coins', context), 'busy');
assert.equal(await shared.community.open('recommend', context), 'busy');
shared.videos[0].emit('close', { isEnded: false });
assert.equal(await video, 'cancelled');
assert(shared.storage.has(LAST_AD_CLOSED_KEY));
const completed = shared.ads.showReward('coins', context); await flush();
shared.videos[0].emit('close', { isEnded: true }); shared.videos[0].emit('close', { isEnded: true });
assert.equal(await completed, 'rewarded');
assert.equal(shared.events.filter(event => event.action === 'complete').length, 1);
const missingResult = shared.ads.showReward('hearts', context); await flush();
shared.videos[0].emit('close'); assert.equal(await missingResult, 'cancelled');
assert.equal(shared.events.filter(event => event.action === 'reward').length, 0, 'SDK completion is separate from the game granting a reward');
shared.ads.destroy();

for (const phase of ['create', 'load', 'show'] as const) {
  const failure = fixture(); failure.config.ads.coins = `adunit-failure-${phase}`;
  const create = failure.api.createRewardedVideoAd;
  failure.api.createRewardedVideoAd = options => {
    if (phase === 'create') throw new Error('SDK unavailable');
    const ad = create(options);
    if (phase === 'load') ad.loadResult = () => Promise.reject(new Error('no fill'));
    if (phase === 'show') ad.showResult = () => Promise.reject(new Error('frequency limit'));
    return ad;
  };
  assert.equal(await failure.ads.showReward('coins', context), 'error');
  assert.equal(failure.storage.has(LAST_AD_CLOSED_KEY), false, 'a request that never showed does not start the ad quiet interval');
  const released = failure.community.open('recommend', context);
  failure.pages[0].emit('show'); assert.equal(await released, 'opened', `${phase} errors release the global presentation slot`);
  failure.community.destroy(); failure.ads.destroy();
}

const native = fixture(); native.config.ads.interstitial = 'adunit-interstitial';
assert.equal(await native.ads.showInterstitial(context), false, 'unready ads never hold the continue button');
native.ads.preloadInterstitial(); native.interstitials[0].emit('load');
native.storage.set(LAST_AD_CLOSED_KEY, String(Date.now()));
assert.equal(await native.ads.showInterstitial(context), false, 'any recently closed video excludes interstitials');
native.storage.set(LAST_AD_CLOSED_KEY, String(Date.now() - 120_001));
const interstitial = native.ads.showInterstitial(context); await flush();
assert.equal(native.interstitials[0].shows, 1);
assert.equal(await native.community.open('recommend', context), 'busy');
native.interstitials[0].emit('close'); assert.equal(await interstitial, true);
assert(native.interstitials[0].destroyed); native.ads.destroy();

const community = fixture();
community.config.community.gameClubOpenlink = 'this-games-club';
community.config.community.circleRecommendationOpenlink = 'this-games-circle-recommend';
const club = community.community.open('help', context);
assert.equal(community.pages[0].link, 'this-games-club');
community.pages[0].emit('show'); assert.equal(await club, 'opened');
assert.equal(await community.community.open('recommend', context), 'busy');
community.community.onGameInteraction();
const recommendation = community.community.open('recommend', context);
assert.equal(community.pages[1].link, RECOMMENDATION_OPENLINK);
community.pages[1].emit('show'); assert.equal(await recommendation, 'opened');
assert.equal(community.community.isRecommended(), false);
community.pages[1].emit('destroy', { isRecommended: true });
assert.equal(community.storage.get(RECOMMENDED_KEY), 'true');
const circle = community.community.open('circleRecommend', context);
community.pages[2].emit('show'); assert.equal(await circle, 'opened');
assert.equal(community.pages[2].link, 'this-games-circle-recommend');
community.community.destroy();
const old = fixture(); old.api.getSystemInfoSync = () => ({ SDKVersion: '3.7.6' });
assert.equal(await old.community.open('recommend', context), 'opened', 'old SDKs use the successful show promise');
old.community.onGameInteraction(); old.community.destroy();

// Timers are advanced explicitly: no real 15-second waits or stale native requests.
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
const timers = new Map<number, { run: () => void; delay: number }>(); let timerId = 0;
globalThis.setTimeout = ((run: () => void, delay: number) => { const id = ++timerId; timers.set(id, { run, delay }); return id; }) as any;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as any;
function fireTimers(delay: number) {
  for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.run(); }
}
try {
  const loading = fixture(); loading.config.ads.hint = 'adunit-loading';
  const pending = loading.ads.showReward('hint', context);
  let resolveLoad!: () => void;
  // A preload explicitly held in flight is reused by the tap request.
  loading.ads.destroy(); assert.equal(await pending, 'error');
  const stalled = fixture(); stalled.config.ads.hint = 'adunit-stalled';
  const originalCreate = stalled.api.createRewardedVideoAd;
  stalled.api.createRewardedVideoAd = options => {
    const ad = originalCreate(options);
    ad.loadResult = () => new Promise<void>(resolve => { resolveLoad = resolve; });
    return ad;
  };
  stalled.ads.preloadRewards(['hint']);
  const tapped = stalled.ads.showReward('hint', context);
  assert.equal(stalled.videos[0].loads, 1);
  fireTimers(15_000); await flush(); assert.equal(await tapped, 'error');
  resolveLoad(); await flush(); assert.equal(stalled.videos[0].shows, 0, 'late loading cannot launch a video after timeout');
  assert(stalled.videos[0].destroyed); stalled.ads.destroy();
  const showTimeout = fixture(); showTimeout.config.ads.coins = 'adunit-show-timeout';
  const createForShow = showTimeout.api.createRewardedVideoAd;
  showTimeout.api.createRewardedVideoAd = options => {
    const ad = createForShow(options); ad.showResult = () => new Promise<void>(() => {}); return ad;
  };
  const showing = showTimeout.ads.showReward('coins', context); await flush();
  fireTimers(5_000); assert.equal(await showing, 'error'); showTimeout.ads.destroy();
  const pageTimeout = fixture();
  const opening = pageTimeout.community.open('recommend', context); await flush();
  fireTimers(15_000); assert.equal(await opening, 'error');
  pageTimeout.pages[0].emit('show'); assert(pageTimeout.pages[0].destroyed);
  pageTimeout.community.destroy();
  const menu = fixture(); menu.config.ads.menu = 'adunit-menu';
  const rect = { x: 20, y: 650, width: 320, height: 112 };
  menu.ads.setMenuPlacement(rect);
  assert.equal(menu.menus[0].shows, 0, 'a native row waits for load');
  menu.ads.setMenuPlacement(rect); assert.equal(menu.menus[0].shows, 0);
  menu.menus[0].emit('load'); await flush(); assert.equal(menu.menus[0].shows, 1);
  menu.ads.setMenuPlacement(null); assert.equal(menu.menus[0].hides, 1);
  menu.ads.setMenuPlacement(rect); await flush();
  menu.menus[0].emit('resize', { width: 400, height: 400 }); assert(menu.menus[0].destroyed);
  assert.equal(menu.ads.menuSize(), null, 'oversized or failed native rows collapse until a later retry');
  menu.ads.destroy();
  assert.equal(timers.size, 0, 'optional SDK components leave no pending timers after disposal');
} finally { globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear; }

const quotaPlatform = new WeChatPlatform({});
const quota = new Map<string, string>();
quotaPlatform.storage.get = key => quota.get(key) ?? null;
quotaPlatform.storage.set = (key, value) => { quota.set(key, value); };
const morning = new Date(2026, 9, 23, 10).getTime();
for (let index = 0; index < 8; index++) assert(consumeBonus(quotaPlatform, 8, morning));
assert.equal(bonusRemaining(quotaPlatform, 8, morning), 0);
assert.equal(consumeBonus(quotaPlatform, 8, morning), false);
assert.equal(bonusRemaining(quotaPlatform, 8, morning + 86_400_000), 8);
const due: number[] = [];
for (let number = 1; number <= 18; number++) {
  if (recordFirstClear(quotaPlatform, `level:${number}`, 3, 5)) due.push(number);
  assert.equal(recordFirstClear(quotaPlatform, `level:${number}`, 3, 5), false);
}
assert.deepEqual(due, [3, 8, 13, 18]);

const levels = new LevelRepository().levels, simulator = new LaserSimulator();
let hintCount = 0;
for (const [index, level] of levels.entries()) {
  const session = new GameSession(levels, 5, index);
  if (level.timeBoss) { assert.equal(mirrorHint(session.state), null); continue; }
  for (let turn = 0; turn < 32; turn++) {
    const hint = mirrorHint(session.state);
    if (!hint) break;
    for (let step = 0; step < hint.turns; step++) session.rotateAt(hint.x, hint.y);
  }
  assert.equal(mirrorHint(session.state), null);
  const trace = simulator.simulate(level, session.state.items, computeGeometry(level));
  assert(trace.hits.every(Boolean), `${level.name}: applying hints must connect every receiver`);
  assert(session.state.items.every(item => item.type !== 'focus' || trace.focusOn[itemKey(item.x, item.y)]));
  hintCount++;
}
assert.equal(hintCount, 200);
const revised = structuredClone(levels[0]); revised.emitter.index = (revised.emitter.index + 1) % revised.rows;
assert.equal(mirrorHint(new GameSession([revised]).state), null, 'a changed board cannot use an old hint asset');

const appFixture = fixture(); appFixture.config.ads.double = 'adunit-double';
const platform = new WeChatPlatform(appFixture.api, appFixture.config);
const game = new GameApplication(platform) as any;
const messages: string[] = [], blocked: boolean[] = [];
let bonusMarks = 0, shownReward = 0;
game.wake = () => {};
game.scheduleHeartRecovery = () => {};
game.view = {
  result: { visible: true, kindValue: 'win', markBonusClaimed: () => { bonusMarks++; }, setRewardTotal: (value: number) => { shownReward = value; } },
  levelSelect: { visible: false }, support: { visible: false },
  setInteractionBlocked: (value: boolean) => blocked.push(value),
  setCoinBalance: () => {},
  settleCoins: () => {}, showToast: (message: string) => messages.push(message),
  startWinCoins: () => {}, revealWinCoins: () => {}, hideOverlays: () => {},
};
game.session.state.won = true; game.winRewardAmount = 36; game.coins = 36; game.winInterstitialDue = true;
const cancelledBonus = game.claimWinBonus(); await flush();
appFixture.videos[0].emit('close', { isEnded: false }); await cancelledBonus;
assert.equal(game.coins, 36); assert.equal(bonusRemaining(platform, 8), 8);
const bonus = game.claimWinBonus(); await flush();
const duplicate = game.claimWinBonus(); await duplicate;
appFixture.videos[0].emit('close', { isEnded: true }); await bonus;
assert.equal(game.coins, 72); assert.equal(bonusMarks, 1); assert.equal(shownReward, 72);
assert.equal(bonusRemaining(platform, 8), 7); assert.equal(game.winInterstitialDue, false);
await game.claimWinBonus(); assert.equal(game.coins, 72);
assert.deepEqual(blocked, [true, false, true, false]);

game.session.state.won = false; game.session.state.hearts = 0;
const originalState = game.session.state, mirrorLayout = JSON.stringify(originalState.items);
game.refillHearts(1);
assert.equal(game.session.state, originalState); assert.equal(game.session.state.hearts, 1);
assert.equal(JSON.stringify(game.session.state.items), mirrorLayout, 'free and ad heart supplies preserve the current layout');
let staleReward = 0;
const stale = game.watchReward('double', () => { staleReward++; return 1; }); await flush();
game.session.load(1);
appFixture.videos[0].emit('close', { isEnded: true }); await stale;
assert.equal(staleReward, 0); assert.equal(bonusRemaining(platform, 8), 7);
platform.ads.destroy(); platform.community.destroy();

console.log(`Operations verified: unconfigured fallback, completed-video rewards, shared SDK cache, duplicate/stale callbacks, quotas, 3/5 interstitial pacing, quiet interval, native-page lifecycle, native-row containment and all ${hintCount} puzzle hints.`);
