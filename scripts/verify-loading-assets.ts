import assert from 'node:assert/strict';
import { DOMAdapter, Texture } from 'pixi.js';
import { loadUiAssets, uiTexture } from '../src/rendering/ui/assets';

// Native runtimes sometimes never deliver image callbacks. Exercise the real
// loader without a GPU, including its deadline and late-callback cleanup.
const originalAdapter = DOMAdapter.get();
const originalWarn = console.warn;
const warnings: unknown[][] = [];
let titleBehavior: 'success' | 'error' | 'silent' = 'success';
const images: FakeImage[] = [];

class FakeImage {
  width = 160;
  height = 100;
  naturalWidth = 160;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  set src(file: string) {
    const behavior = file.endsWith('loading-title.png') ? titleBehavior : 'success';
    if (behavior === 'silent') return;
    queueMicrotask(() => {
      if (behavior === 'error') this.onerror?.(new Error('Expected missing title fixture'));
      else this.onload?.();
    });
  }
}

try {
  DOMAdapter.set({
    ...originalAdapter,
    createImage: () => {
      const image = new FakeImage();
      images.push(image);
      return image as unknown as ReturnType<typeof originalAdapter.createImage>;
    },
  });
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  for (const behavior of ['success', 'error', 'silent'] as const) {
    titleBehavior = behavior;
    const progress: number[] = [];
    const start = Date.now();
    await loadUiAssets('wechat', ratio => progress.push(ratio));
    assert.equal(progress.length, 6, 'Report completion for every attempted image');
    assert.equal(progress.at(-1), 1, 'A missing optional title must not trap the loading screen');
    assert(progress.every((value, index) => index === 0 || value > progress[index - 1]));
    assert.equal(uiTexture('wechat', 'loadingTitle') === Texture.EMPTY, behavior !== 'success');
    assert.notEqual(uiTexture('wechat', 'settings'), Texture.EMPTY, 'Other assets still load');
    assert(images.every(image => image.onload === null && image.onerror === null), 'Detach late image callbacks');
    if (behavior === 'silent') assert(Date.now() - start < 5500, 'Silent callbacks have a bounded wait');
  }
  assert.equal(warnings.length, 2, 'Only the missing and timed-out fixtures warn');
} finally {
  DOMAdapter.set(originalAdapter);
  console.warn = originalWarn;
}
console.log('Loading assets verified: success, missing title, silent native callback, monotonic progress, callback cleanup.');
