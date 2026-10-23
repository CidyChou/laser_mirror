import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DOMAdapter } from 'pixi.js';
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
for (const scenario of ['module-error', 'async-error', 'timeout', 'ready', 'lexical-wx'] as const) {
  const modals: any[] = [], saved: any[] = [], timers: (() => void)[] = [];
  const cleared = new Set<number>();
  const wx = { showModal: (value: any) => modals.push(value), setStorageSync: (...args: any[]) => saved.push(args) };
  const context = vm.createContext({
    console: { log() {}, error() {} },
    ...(scenario === 'lexical-wx' ? {} : { wx }),
    injectedWx: wx,
    setTimeout(fn: () => void) { timers.push(fn); return timers.length; },
    clearTimeout(id: number) { cleared.add(id); },
    require(path: string) {
      assert.equal(path, './game-runtime.js');
      if (scenario === 'module-error') throw new Error('fixture engine import failed');
      if (scenario === 'async-error') context.__laserMirrorBoot.fail(new Error('fixture renderer failed'));
      if (scenario === 'ready' || scenario === 'lexical-wx') context.__laserMirrorBoot.phase('ready');
    },
  });
  if (scenario === 'lexical-wx') vm.runInContext('const wx = injectedWx;', context);
  vm.runInContext(launcher, context);
  if (!cleared.has(1)) timers[0]();
  assert.equal(modals.length, scenario === 'ready' || scenario === 'lexical-wx' ? 0 : 1, scenario);
  assert.equal(saved.length, modals.length, 'Keep useful failure details on the device');
  if (scenario === 'lexical-wx') assert.equal(context.wx, wx, 'Publish native module-scope wx before loading Pixi');
  // Failure reporting is idempotent even if a native callback arrives late.
  if (modals.length) {
    context.__laserMirrorBoot.fail(new Error('late failure'));
    assert.equal(modals.length, 1);
  }
}

const root = JSON.parse(readFileSync('project.config.json', 'utf8'));
assert.equal(root.miniprogramRoot, 'dist/wechat/');
const info = JSON.parse(readFileSync('dist/wechat/build-info.json', 'utf8'));
assert.equal(info.runtimeSha256, createHash('sha256').update(readFileSync('dist/wechat/game-runtime.js')).digest('hex'));
console.log('WeChat startup verified: display canvas order, WebGL probe, 2D textures, module/async/timeout errors, lexical wx, build fingerprint, project root.');
