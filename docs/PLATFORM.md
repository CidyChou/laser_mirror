# Multi-platform

核心游戏不直接调用 `wx` / `tt` / `xhs`。

```text
src/platform/
├── IPlatform.ts
├── web/
├── minigame/
├── wechat/
├── douyin/
└── xhs/
```

平台差异处理 Canvas、系统尺寸、DPR、存储、震动、请求、分享、广告与运营原生页面；玩法通过 `IPlatform` 使用这些能力。

设置中的「分享给好友」在支持主动分享的平台显示。微信同时启用好友和朋友圈菜单，分享文案及 `stage` 参数使用当前关卡；从分享启动时沿用玩家的关卡解锁规则。每次分享从 `src/app/share.ts` 的 `SHARE_IMAGE_URLS` 中随机选取一张图片，好友分享和朋友圈预览使用同一张图；目前已配置三张分享图。

## 微信

广告与运营配置位于 `templates/wechat/operations.json`，包含四种激励场景、低频通关插屏、选关页原生模板、游戏圈 / 求助帖与推荐。未填 ID 时保留金币买爱心和自然恢复。详见 [微信广告与运营接入](WECHAT_OPERATIONS.md)。

```bash
make wechat
```

导出可直接用微信开发者工具打开的小游戏目录：`dist/wechat`。

- `game.js`：独立启动器，捕获模块加载及初始化错误
- `game-runtime.js`：Vite IIFE 游戏包
- `runtime-compat.js`：引擎加载前的基础 API 兼容（仅补缺失项）
- `build-info.json`：源码提交、未提交修改标记、构建时间、运行包 SHA256
- `game.json` / `project.config.json`：小游戏工程配置（首次从 `templates/wechat/` 复制，之后保留本地 AppID）
- `audio/`、`ui/`：运行所需资源

微信运行时禁止 `eval` / `new Function`。小游戏入口会先引入 `pixi.js/unsafe-eval`，用静态 polyfill 代替着色器动态编译。

PixiJS 的浏览器构造器判断不适合原生小游戏上下文。适配层按上下文能力识别 WebGL 版本；没有 `OES_vertex_array_object` 时安装软件 VAO。优先 WebGL2，自动兼容 WebGL1；小游戏不进入依赖浏览器 DOM 构造器的 Canvas2D 后备渲染器。

画布工厂使用 `wx.createCanvas()`，入口提前保留第一个上屏画布。不要为 Pixi 的通用画布工厂固定创建 `type: '2d'` 的离屏画布，否则 WebGL 探测会失败，继而误选 Canvas2D，原生上屏画布还可能被替换成离屏画布，造成无报错却没有画面的启动故障。

可以直接导入 `dist/wechat`，也可以导入项目根目录；根目录配置的 `miniprogramRoot` 指向 `dist/wechat/`（小游戏也使用此字段）。构建日志和包内 `build-info.json` 可用于核对实际上传的代码，平台输入的版本号不会自动触发本地重新构建。

`npm run verify:wechat-startup` 检查画布顺序、WebGL 探测、启动异常记录和包指纹。构建后启动 Web 开发服务器，打开 `/tools/visual/wechat-boot.html`，会在隔离且不提供 DOM/浏览器画布构造器的环境中运行微信实际产物，覆盖 WebGL1/2、正常/缺失图片和原生触摸开始流程。这些检查不能替代 Android 和 iPhone 上的体验版冷启动。

改完后需重新 `make wechat`，并在开发者工具里重新编译。

开发者工具已安装且开启服务端口时，命令会尝试自动打开该目录；游客 AppID 不会上传真机预览。也可用 `npm run build:wechat` 只出包、不同步工具。

## 抖音

构建：`npm run build:douyin`

## 小红书

构建：`npm run build:xhs`

构建脚本会生成基础 `game.json` / `project.config.json`。正式提审前补充真实 AppID、隐私、广告、分享和平台要求。
