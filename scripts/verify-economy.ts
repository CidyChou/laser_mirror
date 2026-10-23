import assert from 'node:assert/strict';
import { GameApplication } from '../src/app/GameApplication';
import { ECONOMY } from '../src/economy/config';
import { HEART_RECOVERY_KEY, HEART_STORAGE_KEY, heartPurchase, heartRefillCost, recoverHearts, saveHearts } from '../src/economy/hearts';
import { BONUS_USAGE_KEY, bonusRemaining, COIN_AD_USAGE_KEY, HINT_COIN_COST } from '../src/economy/operations';
import { COIN_STORAGE_KEY, firstClearReward, initializeCoins, loadCoins, winReward } from '../src/economy/wallet';
import { LevelRepository } from '../src/levels/LevelRepository';
import { rewardLevelIndex } from '../src/levels/campaign';
import { WeChatPlatform } from '../src/platform/wechat/WeChatPlatform';
import { WECHAT_OPERATIONS } from '../src/platform/wechat/config';

function fixture() {
  const storage = new Map<string, string>();
  const config = structuredClone(WECHAT_OPERATIONS);
  config.ads.coins = 'adunit-economy-test';
  const platform = new WeChatPlatform({
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: string) => { storage.set(key, value); },
    createRewardedVideoAd: () => undefined,
  }, config);
  return { platform, storage };
}

const wallet = fixture();
assert.equal(initializeCoins(wallet.platform, false), 40);
assert.equal(initializeCoins(wallet.platform, false), 40, 'relaunch does not repeat the starter gift');
wallet.storage.set(COIN_STORAGE_KEY, '0'); assert.equal(initializeCoins(wallet.platform, false), 0);
const existing = fixture(); existing.storage.set(COIN_STORAGE_KEY, '30000');
assert.equal(initializeCoins(existing.platform, true), 30000, 'existing balances are preserved');
const progressed = fixture(); assert.equal(initializeCoins(progressed.platform, true), 0, 'old progression does not become a new player gift');
assert.deepEqual([0, 9, 10, 29, 30, 79, 80, 139, 140, 199, 999].map(index => winReward(index)), [6, 6, 8, 8, 10, 10, 12, 12, 14, 14, 14]);
assert.equal(winReward(9, true), 12);
assert.equal(firstClearReward(0, false, false), 0, 'replaying an easy level cannot farm coins or a double reward');
assert(ECONOMY.starterCoins >= ECONOMY.heartPrice * 2);
assert(ECONOMY.firstClearTiers.every(tier => Math.ceil(ECONOMY.heartPrice / tier.coins) <= 4));
assert.deepEqual(heartPurchase(80, 0, 'fill'), { coins: 0, hearts: 5, gained: 5, cost: 80 });
assert.deepEqual(heartPurchase(20, 0, 'one'), { coins: 0, hearts: 1, gained: 1, cost: 20 });
assert.deepEqual(heartPurchase(40, 3, 'fill'), { coins: 0, hearts: 5, gained: 2, cost: 40 });
assert.deepEqual(heartPurchase(45, 0, 2), { coins: 5, hearts: 2, gained: 2, cost: 40 });
assert.equal(heartPurchase(100, 4, 2), null, 'partial bundles never sell unusable hearts');
assert.equal(heartPurchase(19, 0, 'one'), null);
assert.equal(heartPurchase(100, 5, 'one'), null);
assert.equal(heartPurchase(100, 5, 'fill'), null, 'full hearts never charge coins');

const hearts = fixture(), start = new Date(2026, 9, 23, 12).getTime();
saveHearts(hearts.platform, 0, start);
assert.equal(recoverHearts(hearts.platform, undefined, start + ECONOMY.heartRecoveryMs - 1).hearts, 0);
assert.equal(recoverHearts(hearts.platform, undefined, start + ECONOMY.heartRecoveryMs).hearts, 1);
assert.equal(recoverHearts(hearts.platform, undefined, start + ECONOMY.heartRecoveryMs + 1).hearts, 1, 'repeated refresh cannot reclaim an interval');
assert.equal(recoverHearts(hearts.platform, undefined, start + ECONOMY.heartRecoveryMs * 8).hearts, 5);
assert.equal(hearts.storage.get(HEART_RECOVERY_KEY), '0', 'full hearts stop accruing recovery time');
saveHearts(hearts.platform, 4, start + ECONOMY.heartRecoveryMs * 9);
assert.equal(recoverHearts(hearts.platform, undefined, start + ECONOMY.heartRecoveryMs * 9 + 1).hearts, 4);
saveHearts(hearts.platform, 2, start + ECONOMY.heartRecoveryMs * 10);
const afterFailure = recoverHearts(hearts.platform, 1, start + ECONOMY.heartRecoveryMs * 10 + 1);
assert.equal(afterFailure.hearts, 2, 'a due recovery and a failed shot are reconciled before saving');
hearts.storage.set(HEART_RECOVERY_KEY, String(start + ECONOMY.heartRecoveryMs * 100));
assert.equal(recoverHearts(hearts.platform, 2, start).hearts, 2, 'future or malformed timestamps grant no free hearts');

const transaction = fixture(), game = new GameApplication(transaction.platform) as any;
const messages: string[] = []; let shownBalance = 0, videoRequests = 0;
game.wake = () => {}; game.scheduleHeartRecovery = () => {};
game.view = {
  support: { visible: true }, levelSelect: { visible: true }, result: { visible: false },
  setCoinBalance: (balance: number) => { shownBalance = balance; },
  setInteractionBlocked: () => {}, settleCoins: () => {},
  showToast: (message: string) => messages.push(message),
  showSupport: () => {}, hideSupport: () => {}, hideOverlays: () => {},
};
game.session.restoreHearts(0); saveHearts(transaction.platform, 0);
game.coins = 40; game.supportScreen = 'hearts';
const state = game.session.state, originalItems = JSON.stringify(state.items);
const quote = { state, hearts: 0, coins: 40 };
game.purchaseHearts('one', quote);
game.purchaseHearts('one', quote);
assert.equal(game.coins, 20); assert.equal(shownBalance, 20); assert.equal(loadCoins(transaction.platform), 20);
assert.equal(game.session.state.hearts, 1); assert.equal(JSON.stringify(state.items), originalItems);
game.coins = 0;
transaction.platform.ads.showReward = async () => { videoRequests++; return 'cancelled'; };
await game.claimCoinVideo(); assert.equal(game.coins, 0);
assert.equal(bonusRemaining(transaction.platform, 3, Date.now(), COIN_AD_USAGE_KEY), 3);
transaction.platform.ads.showReward = async () => { videoRequests++; return 'rewarded'; };
for (let count = 0; count < 3; count++) await game.claimCoinVideo();
assert.equal(game.coins, 180); assert.equal(shownBalance, 180);
assert.equal(bonusRemaining(transaction.platform, 8), 5);
await game.claimCoinVideo(); assert.equal(videoRequests, 4, 'daily coin limit rejects before entering the SDK');
transaction.storage.delete(COIN_AD_USAGE_KEY); transaction.storage.delete(BONUS_USAGE_KEY);
game.coins = 199; await game.claimCoinVideo(); assert.equal(game.coins, 259, 'the advertised 60 coins are never silently truncated');
const requests = videoRequests; await game.claimCoinVideo(); assert.equal(videoRequests, requests, 'reserve threshold stops stockpiling extra ad coins');
transaction.platform.ads.destroy(); transaction.platform.community.destroy();

// Deterministic planning scenarios, not measured player data.
const levels = new LevelRepository().levels;
const profiles = [
  { name: '熟练', failures: [.1, .2, .35, .5, .7], bossExtra: 1, hints: false },
  { name: '普通', failures: [.15, .3, .8, 1.2, 1.6], bossExtra: 1.5, hints: true },
  { name: '反复尝试', failures: [.35, .6, 1.2, 1.8, 2.5], bossExtra: 2, hints: true },
];
const scenarios = profiles.map(profile => {
  let coins: number = ECONOMY.starterCoins, life = 5, time = 0, recoveryFrom: number | null = null;
  let failureBudget = 0, misses = 0, heartAds = 0, hintPurchases = 0, coinSpent = 0, earned = 0, purchases = 0, earlyAds = 0, early30Videos = 0;
  const tick = (seconds: number) => {
    time += seconds;
    if (life === 5) { recoveryFrom = null; return; }
    recoveryFrom ??= time - seconds;
    const recovered = Math.floor((time - recoveryFrom) / 600);
    life = Math.min(5, life + recovered); recoveryFrom += recovered * 600;
    if (life === 5) recoveryFrom = null;
  };
  for (const [index, level] of levels.entries()) {
    const number = rewardLevelIndex(level, index) + 1, boss = Boolean(level.timeBoss);
    const band = number <= 10 ? 0 : number <= 30 ? 1 : number <= 80 ? 2 : number <= 140 ? 3 : 4;
    failureBudget += profile.failures[band] + (boss ? profile.bossExtra : 0);
    const failures = Math.floor(failureBudget); failureBudget -= failures;
    const ensureLife = () => {
      if (!life) {
        const count = coins >= heartRefillCost(0) ? 5 : Math.min(4, Math.floor(coins / ECONOMY.heartPrice));
        const cost = count === 5 ? ECONOMY.fullHeartPrice : count * ECONOMY.heartPrice;
        if (count>0) { coins -= cost; coinSpent += cost; life = count; purchases++; }
        else { life = 5; heartAds++; if (number <= 10) earlyAds++; if(number<=30)early30Videos++; }
      }
    };
    for (let miss = 0; miss < failures; miss++) {
      ensureLife();
      tick(15);
      if (!(boss && miss === 0)) { if (life === 5) recoveryFrom = time; life--; misses++; }
    }
    ensureLife();
    tick(number <= 30 ? 25 : number <= 80 ? 45 : 70);
    const reward = firstClearReward(number - 1, boss, true); coins += reward; earned += reward;
    if (profile.hints && !boss && number > 30 && number % 10 === 0 && coins >= HINT_COIN_COST) { coins -= HINT_COIN_COST; coinSpent += HINT_COIN_COST; hintPurchases++; }
    assert(coins >= 0 && life >= 0 && life <= 5);
  }
  assert.equal(earlyAds, 0, 'starting supply covers the first ten easy levels in these planning scenarios');
  assert.equal(earned, 2736, 'campaign payout stays finite and independent of replays');
  return { profile: profile.name, firstClearCoins: earned, failures: misses, heartPurchases: purchases, heartVideos: heartAds, early30Videos, coinHints: hintPurchases, spent: coinSpent, balance: coins };
});
console.log('Economy verified: wallet migration, first clears, prices, stale purchase quotes, passive/offline recovery, ad limits and reserve threshold.');
console.table(scenarios);
