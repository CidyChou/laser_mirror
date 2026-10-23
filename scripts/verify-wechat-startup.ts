import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DOMAdapter, GlContextSystem } from 'pixi.js';
import { AudioManager } from '../src/audio/AudioManager';
import { MusicManager } from '../src/audio/MusicManager';
import { installMiniGamePixiAdapter } from '../src/platform/minigame/MiniGamePixiAdapter';
import { WeChatPlatform } from '../src/platform/wechat/WeChatPlatform';

// Native typed offscreen canvases cannot answer Pixi's WebGL capability probe.
// Keep the display canvas first and use context-neutral canvases for the probe
// AND for the later 2D text/gradient work.
const created: any[] = [];
const api = {
  createCanvas() {
    const canvas = { width: 1, height: 1, getContext: (type: string) => ({ type }) };
    created.push(canvas);
    return canvas;
  },
  createOffscreenCanvas() { throw new Error('Typed offscreen API must not be used for the engine capability probe'); },
};
installMiniGamePixiAdapter(api);
const display = new WeChatPlatform(api).createCanvas();
const probe = DOMAdapter.get().createCanvas(2, 3);
assert.equal(display, created[0]);
assert.equal(probe, created[1]);
assert.equal((probe.getContext('webgl') as any).type, 'webgl');
const text = DOMAdapter.get().createCanvas(64, 32);
assert.equal((text.getContext('2d') as any).type, '2d');
assert.deepEqual([text.width, text.height], [64, 32]);

const launcher = readFileSync('templates/wechat/game.js', 'utf8')
  .replace('__WECHAT_BUILD_INFO__', JSON.stringify({ commit: 'fixture' }));
const compatibility = readFileSync('templates/wechat/runtime-compat.js', 'utf8');
for (const scenario of ['module-error', 'async-error', 'timeout', 'ready', 'lexical-wx', 'legacy-globals', 'native-error', 'native-rejection'] as const) {
  const modals: any[] = [], saved: any[] = [], timers: (() => void)[] = [];
  const cleared = new Set<number>();
  let onError: ((error: unknown) => void) | undefined, onRejection: ((event: any) => void) | undefined;
  const realtimeLogs: any[] = [];
  const wx = {
    showModal: (value: any) => modals.push(value), setStorageSync: (...args: any[]) => saved.push(args),
    onError: (fn: typeof onError) => { onError = fn; },
    onUnhandledRejection: (fn: typeof onRejection) => { onRejection = fn; },
    getRealtimeLogManager: () => ({ info: (...args: any[]) => realtimeLogs.push(args), error: (...args: any[]) => realtimeLogs.push(args) }),
  };
  const context = vm.createContext({
    console: { log() {}, error() {} },
    ...(scenario === 'lexical-wx' ? {} : { wx }),
    injectedWx: wx,
    setTimeout(fn: () => void) { timers.push(fn); return timers.length; },
    clearTimeout(id: number) { cleared.add(id); },
    require(path: string) {
      if (path === './runtime-compat.js') { vm.runInContext(compatibility, context); return; }
      assert.equal(path, './game-runtime.js');
      if (scenario === 'module-error') throw new Error('fixture engine import failed');
      if (scenario === 'async-error') context.__laserMirrorBoot.fail(new Error('fixture renderer failed'));
      if (scenario === 'native-error') onError?.('native startup error');
      if (scenario === 'native-rejection') onRejection?.({ reason: new Error('native startup rejection') });
      if (scenario === 'ready' || scenario === 'lexical-wx' || scenario === 'legacy-globals') context.__laserMirrorBoot.phase('ready');
    },
  });
  if (scenario === 'lexical-wx') vm.runInContext('const wx = injectedWx;', context);
  if (scenario === 'legacy-globals') vm.runInContext(`
    this.GameGlobal = this;
    delete this.globalThis;
    delete Array.prototype.flatMap;
    delete Object.entries;
    delete Object.values;
  `, context);
  vm.runInContext(launcher, context);
  if (!cleared.has(1)) timers[0]();
  assert.equal(modals.length, ['ready', 'lexical-wx', 'legacy-globals'].includes(scenario) ? 0 : 1, scenario);
  assert.equal(saved.length, modals.length, 'Keep useful failure details on the device');
  if (scenario === 'lexical-wx') assert.equal(context.wx, wx, 'Publish native module-scope wx before loading Pixi');
  if (scenario === 'legacy-globals') {
    assert.equal(vm.runInContext('globalThis === GameGlobal', context), true);
    assert.equal(vm.runInContext('JSON.stringify([1,,2].flatMap(function(n){return [n, n+10]}))', context), '[1,11,2,12]');
    assert.equal(vm.runInContext('JSON.stringify(Object.values({a:1,b:2}))', context), '[1,2]');
    assert.equal(vm.runInContext('JSON.stringify(Object.entries({a:1}))', context), '[["a",1]]');
    assert.equal(vm.runInContext(`
      var callbackThrew = false;
      try { [].flatMap(null); } catch (_) { callbackThrew = true; }
      callbackThrew;
    `, context), true);
  }
  assert(realtimeLogs.length > 0, 'Production diagnostics do not require a local debugger');
  // Failure reporting is idempotent even if a native callback arrives late.
  if (modals.length) {
    context.__laserMirrorBoot.fail(new Error('late failure'));
    assert.equal(modals.length, 1);
  }
}

// Native wrappers can throw instead of returning null for WebGL2.
const requests: string[] = [];
const gl1 = {};
const fakeSystem = {
  canvas: { getContext(type: string) {
    requests.push(type);
    if (type === 'webgl2') throw new Error('Unsupported native context type');
    return gl1;
  } },
  initFromContext(gl: unknown) { assert.equal(gl, gl1); },
};
(GlContextSystem.prototype as any).createContext.call(fakeSystem, 2, {});
assert.deepEqual(requests, ['webgl2', 'webgl']);
const audioUnavailable = new WeChatPlatform({ createInnerAudioContext() { throw new Error('Audio capacity reached'); } });
const sound = new AudioManager(audioUnavailable);
const music = new MusicManager(audioUnavailable);
sound.destroy(); music.destroy();

const root = JSON.parse(readFileSync('project.config.json', 'utf8'));
assert.equal(root.miniprogramRoot, 'dist/wechat/');
const info = JSON.parse(readFileSync('dist/wechat/build-info.json', 'utf8'));
assert.equal(info.runtimeSha256, createHash('sha256').update(readFileSync('dist/wechat/game-runtime.js')).digest('hex'));
assert.equal(readFileSync('dist/wechat/runtime-compat.js', 'utf8'), compatibility);
console.log('WeChat startup verified: canvas order, WebGL1 after thrown WebGL2, missing globalThis/flatMap, unavailable audio, native/module/async/timeout diagnostics, build fingerprint.');
