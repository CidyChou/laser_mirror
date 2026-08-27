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

开发者工具已安装且开启服务端口时，命令会尝试自动打开该目录；游客 AppID 不会上传真机预览。也可用 `npm run build:wechat` 只出包、不同步工具。

## 抖音

构建：`npm run build:douyin`

## 小红书

构建：`npm run build:xhs`

构建脚本会生成基础 `game.json` / `project.config.json`。正式提审前补充真实 AppID、隐私、广告、分享和平台要求。
