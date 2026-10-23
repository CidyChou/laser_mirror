// Keep this launcher independent of Pixi: module-load failures must be caught
// before the engine and its environment adapter have started.
(function () {
  // Older native JS runtimes expose GameGlobal instead of globalThis. This
  // must run before Pixi is required, and before installing the error handler.
  var global = typeof globalThis !== 'undefined' ? globalThis
    : typeof GameGlobal !== 'undefined' ? GameGlobal
      : typeof self !== 'undefined' ? self : this;
  if (typeof global.globalThis === 'undefined') global.globalThis = global;
  var api = typeof wx !== 'undefined' ? wx : global.wx;
  var info = __WECHAT_BUILD_INFO__;
  var phase = 'runtime-module';
  var failed = false;
  var timer;
  var logger;
  var realtime;
  var ready = false;
  var startedAt = Date.now();
  var device = {};
  try { logger = api && api.getLogManager && api.getLogManager({ level: 0 }); } catch (_) {}
  try { realtime = api && api.getRealtimeLogManager && api.getRealtimeLogManager(); } catch (_) {}
  try {
    var system = api.getSystemInfoSync();
    device = { model: system.model, system: system.system, platform: system.platform,
      version: system.version, SDKVersion: system.SDKVersion };
  } catch (_) {}

  function log(message) {
    console.log('[boot] ' + info.commit + ' ' + message);
    try { if (logger) logger.info('[boot]', info, message); } catch (_) {}
    try { if (realtime) realtime.info('[boot]', info, device, message, Date.now() - startedAt); } catch (_) {}
  }
  function fail(error) {
    if (failed) return;
    failed = true;
    clearTimeout(timer);
    var detail = String(error && (error.stack || error.message || error.errMsg) || error);
    console.error('[boot] ' + phase, error);
    try {
      api.setStorageSync('laser-mirror-last-boot-error', {
        build: info, phase: phase, device: device, detail: detail, at: Date.now()
      });
    } catch (_) {}
    try { if (logger) logger.warn('[boot]', phase, detail); } catch (_) {}
    try { if (realtime) realtime.error('[boot]', info, device, phase, detail); } catch (_) {}
    try {
      api.showModal({
        title: '游戏启动遇到问题',
        content: '请关闭小游戏后重试。若仍无法进入，请反馈以下信息：\n'
          + (info.runtimeSha256 || info.commit).slice(0, 12) + ' / ' + phase + '\n' + detail.slice(0, 500),
        showCancel: false
      });
    } catch (_) {}
  }
  global.__laserMirrorBoot = {
    info: info,
    fail: fail,
    phase: function (next) {
      phase = next;
      log(next);
      if (next === 'ready' || next === 'playing') { ready = true; clearTimeout(timer); }
    }
  };
  // wx can be provided as a module-scope binding by the native runtime.
  global.wx = api;
  log(phase);
  timer = setTimeout(function () {
    fail(new Error('Startup exceeded 20 seconds at ' + phase));
  }, 20000);
  try {
    if (!api) throw new Error('WeChat runtime API is unavailable');
    try { if (api.onError) api.onError(function (error) { if (!ready) fail(error); }); } catch (_) {}
    try { if (api.onUnhandledRejection) api.onUnhandledRejection(function (event) { if (!ready) fail(event && event.reason); }); } catch (_) {}
    require('./runtime-compat.js');
    require('./game-runtime.js');
  } catch (error) {
    fail(error);
  }
})();
