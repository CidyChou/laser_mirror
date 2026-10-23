// Keep this launcher independent of Pixi: module-load failures must be caught
// before the engine and its environment adapter have started.
(function () {
  var global = globalThis;
  var api = typeof wx !== 'undefined' ? wx : global.wx;
  var info = __WECHAT_BUILD_INFO__;
  var phase = 'runtime-module';
  var failed = false;
  var timer;
  var logger;
  try { logger = api && api.getLogManager && api.getLogManager({ level: 0 }); } catch (_) {}

  function log(message) {
    console.log('[boot] ' + info.commit + ' ' + message);
    try { if (logger) logger.info('[boot]', info, message); } catch (_) {}
  }
  function fail(error) {
    if (failed) return;
    failed = true;
    clearTimeout(timer);
    var detail = String(error && (error.stack || error.message || error.errMsg) || error);
    console.error('[boot] ' + phase, error);
    try {
      api.setStorageSync('laser-mirror-last-boot-error', {
        build: info, phase: phase, detail: detail, at: Date.now()
      });
      if (logger) logger.warn('[boot]', phase, detail);
    } catch (_) {}
    try {
      api.showModal({
        title: '游戏启动遇到问题',
        content: '请关闭小游戏后重试。若仍无法进入，请反馈以下信息：\n'
          + info.commit + ' / ' + phase + '\n' + detail.slice(0, 500),
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
      if (next === 'ready' || next === 'playing') clearTimeout(timer);
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
    require('./game-runtime.js');
  } catch (error) {
    fail(error);
  }
})();
