// Runs the packaged JS, not the browser entry. Workers deliberately have no
// document/window or native canvas constructors exposed to the game.
// This reproduces API boundaries, not WeChat's proprietary engine/drivers.
async function check(forceWebGL1: boolean, missingImages: boolean, oldBundle = false, profile = 'standard') {
  const [launcher, runtime, compatibility] = await Promise.all([
    oldBundle ? Promise.resolve('require("./game-runtime.js")') : fetch('/dist/wechat/game.js').then(r => r.text()),
    fetch(oldBundle ? '/output/qa/wechat-startup/before-game.js' : '/dist/wechat/game-runtime.js').then(r => r.text()),
    fetch('/dist/wechat/runtime-compat.js').then(r => r.text()),
  ]);
  const setup = `
    const NativeCanvas = OffscreenCanvas;
    const hostNow = performance.now.bind(performance);
    const baseUrl = ${JSON.stringify(location.origin)};
    const forceWebGL1 = ${forceWebGL1};
    const missingImages = ${missingImages};
    const profile = ${JSON.stringify(profile)};
    globalThis.OffscreenCanvas = undefined;
    delete globalThis.WorkerGlobalScope;
    globalThis.performance = undefined;
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
    const phases = [], failures = [], warnings = [], touches = {};
    let display, gl, backend, pixiApp, startTap, draws = 0, twoDFrames = 0, canvasCount = 0;
    globalThis.__PIXI_APP_INIT__ = app => { pixiApp = app; };
    const send = value => postMessage(value);
    console = { log(...args) { if(String(args[0]).startsWith('[boot]')) phases.push(String(args[0])); },
      error(...args) { failures.push(args.map(String).join(' ')); },
      warn(...args) { warnings.push(args.map(String).join(' ')); } };
    onerror = e => { failures.push(String(e.message)); };
    onunhandledrejection = e => { failures.push(String(e.reason)); };
    function canvas(width = 1, height = 1, lockedType) {
      const c = new NativeCanvas(width, height);
      const get = c.getContext.bind(c);
      c.getContext = (type, ...options) => {
        if(lockedType && type !== lockedType) return null;
        if(profile === 'throws-webgl2' && type === 'webgl2') throw new Error('Native WebGL2 type unsupported');
        if(forceWebGL1 && type === 'webgl2') return null;
        const ctx = get(type, ...options);
        if(c === display && ctx && !backend) {
          backend = type;
          if(type !== '2d') {
            gl = ctx;
            for(const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
              if(!ctx[method]) continue;
              const original = ctx[method].bind(ctx);
              ctx[method] = (...args) => { draws++; return original(...args); };
            }
          } else {
            const original = ctx.fillRect.bind(ctx);
            ctx.fillRect = (...args) => { twoDFrames++; return original(...args); };
          }
        }
        return ctx;
      };
      return c;
    }
    wx = {
      createCanvas() {
        const c = canvas();
        if(canvasCount++ === 0) {
          display = c;
          c.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 16);
          c.cancelAnimationFrame = clearTimeout;
        }
        return c;
      },
      createOffscreenCanvas(o) { return canvas(o.width, o.height, o.type); },
      createImage() {
        const image = new NativeCanvas(1, 1);
        Object.defineProperty(image, 'src', { set(file) {
          if(missingImages) { setTimeout(() => image.onerror?.(new Error('fixture missing image')), 0); return; }
          fetch(baseUrl + '/' + file).then(r => r.blob()).then(createImageBitmap).then(bitmap => {
            image.width = bitmap.width; image.height = bitmap.height;
            image.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close(); image.onload?.();
          }).catch(error => image.onerror?.(error));
        }});
        return image;
      },
      getSystemInfoSync: () => ({windowWidth: 390, windowHeight: 844, pixelRatio: 2}),
      getMenuButtonBoundingClientRect: () => ({bottom: 80}),
      getStorageSync: () => '', setStorageSync() {},
      // A first-time player opening the shared level 57 must still be able
      // to launch at their unlocked stage, without saved progress.
      getLaunchOptionsSync: () => ({query: {stage: 'level:57'}}),
      createInnerAudioContext: () => {
        if(profile === 'audio-unavailable') throw new Error('Native audio capacity reached');
      },
      onTouchStart: fn => touches.down = fn, onTouchEnd: fn => touches.up = fn,
      onTouchMove() {}, onTouchCancel() {},
      showModal: options => failures.push(options.content)
    };
    const code = ${JSON.stringify(runtime)};
    const compat = ${JSON.stringify(compatibility)};
    function require(path) {
      if(path === './runtime-compat.js') { (0,eval)(compat); return; }
      if(path !== './game-runtime.js') throw Error(path);
      (0,eval)(code);
    }
    if(profile === 'legacy-js') {
      globalThis.GameGlobal = globalThis;
      delete Array.prototype.flatMap;
      delete Object.entries;
      delete Object.values;
      delete globalThis.globalThis;
    }
  `;
  const finish = `
    setTimeout(() => {
      const scene = pixiApp?.stage.children.find(child => child.startButton);
      const position = scene?.startButton.getGlobalPosition();
      if(!position) { failures.push('No start button'); return; }
      const boundary = pixiApp.renderer.events.rootBoundary;
      boundary.rootTarget = pixiApp.renderer.lastObjectRendered;
      const target = boundary.hitTest(position.x, position.y);
      startTap = { x: position.x, y: position.y, visible: scene.startButton.visible,
        hit: target?.constructor.name, isButton: target === scene.startButton,
        root: boundary.rootTarget?.constructor.name, click: pixiApp.renderer.events.features.click,
        native: !!touches.down, targetListeners: Object.keys(scene.startButton._events || {}) };
      scene.startButton.on('pointerdown', () => { startTap.down = true; });
      scene.startButton.on('pointerup', () => { startTap.up = true; });
      scene.startButton.on('pointertap', () => { startTap.tap = true; });
      const nativeTouch = { changedTouches: [{ identifier: 0, clientX: position.x, clientY: position.y }] };
      touches.down?.(nativeTouch); touches.up?.(nativeTouch);
    }, 1800);
    setTimeout(() => {
      send({ done: true, profile, forceWebGL1, missingImages, oldBundle: ${oldBundle}, backend,
        displayReplaced: pixiApp?.renderer.view.texture.source.resource !== display,
        displayAlpha: backend === '2d' ? display.getContext('2d').getImageData(0, 0, 1, 1).data[3] : undefined,
        draws, twoDFrames, startTap, phases, failures, warnings: warnings.slice(0, 3),
        glError: gl?.getError(), elapsed: hostNow() });
    }, 2600);
  `;
  const url = URL.createObjectURL(new Blob([setup, '\n', launcher, '\n', finish], { type: 'text/javascript' }));
  return new Promise<any>((resolve) => {
    const worker = new Worker(url);
    const timeout = setTimeout(() => close({ done: false, error: 'Worker timed out' }), 12000);
    function close(result: any) {
      clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); resolve(result);
    }
    worker.onmessage = e => { if(e.data.done) close(e.data); };
    worker.onerror = e => close({ done: false, error: e.message });
  });
}

export async function runNativeBootChecks(includeOldBundle = false) {
  const results = [];
  if(includeOldBundle) results.push(await check(false, false, true));
  for(const forceWebGL1 of [false, true]) {
    for(const missingImages of [false, true]) results.push(await check(forceWebGL1, missingImages));
  }
  for(const profile of ['legacy-js', 'throws-webgl2', 'audio-unavailable']) {
    results.push(await check(false, false, false, profile));
  }
  for (const result of results.filter(result => !result.oldBundle)) {
    if (!result.done || result.failures?.length || result.displayReplaced
      || result.draws <= 0 || result.glError !== 0
      || !result.phases?.some((phase: string) => phase.endsWith(' playing'))) {
      document.querySelector('#results')!.textContent = JSON.stringify(results, null, 2);
      throw new Error('WeChat packaged startup failed: ' + JSON.stringify(result));
    }
  }
  document.querySelector('#results')!.textContent = JSON.stringify(results, null, 2);
  return results;
}
(window as any).runNativeBootChecks = runNativeBootChecks;
(window as any).bootChecks = runNativeBootChecks(location.search.includes('before=1'));
