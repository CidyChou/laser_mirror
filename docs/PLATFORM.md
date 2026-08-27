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

构建：`npm run build:wechat`

## 抖音

构建：`npm run build:douyin`

## 小红书

构建：`npm run build:xhs`

构建脚本会生成基础 `game.json` / `project.config.json`。正式提审前补充真实 AppID、隐私、广告、分享和平台要求。
