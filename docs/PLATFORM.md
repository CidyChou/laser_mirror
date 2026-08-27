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

平台差异只处理：Canvas、系统尺寸、DPR、存储、震动、请求，以及未来的广告/分享/登录。

## 微信

```bash
make wechat
```

导出可直接用微信开发者工具打开的小游戏目录：`dist/wechat`。

- `game.js`：Vite IIFE 包
- `game.json` / `project.config.json`：小游戏工程配置（首次从 `templates/wechat/` 复制，之后保留本地 AppID）
- `audio/`、`ui/`：运行所需资源

微信运行时禁止 `eval` / `new Function`。小游戏入口会先引入 `pixi.js/unsafe-eval`，用静态 polyfill 代替着色器动态编译。

PixiJS 默认用 `instanceof WebGLRenderingContext` 判断 WebGL 版本。微信模拟器里这个判断会把 WebGL2 当成 WebGL1，接着报 `32 index buffer` 警告，并抛出 `Vertex Array Objects are not supported`。适配层会按上下文能力识别版本；没有 `OES_vertex_array_object` 时再装软件 VAO。小游戏强制 WebGL1、关闭 MSAA，避免模拟器拿到残缺的 webgl2。

改完后需重新 `make wechat`，并在开发者工具里重新编译。

开发者工具已安装且开启服务端口时，命令会尝试自动打开该目录；游客 AppID 不会上传真机预览。也可用 `npm run build:wechat` 只出包、不同步工具。

## 抖音

构建：`npm run build:douyin`

## 小红书

构建：`npm run build:xhs`

构建脚本会生成基础 `game.json` / `project.config.json`。正式提审前补充真实 AppID、隐私、广告、分享和平台要求。
