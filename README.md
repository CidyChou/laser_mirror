# Laser Mirror v7.7.0 — Commercial Architecture

正式工程底座：**Vite + TypeScript + PixiJS 8 + WebGL + Pixi UI + JSON Levels + Platform Adapter**。

## macOS 一键运行

```bash
./start.sh
```

首次运行会执行 `npm install`，之后直接启动。默认从 `8347` 开始自动寻找空闲端口。

## 构建

```bash
make wechat
npm run build:web
npm run build:wechat
npm run build:douyin
npm run build:xhs
npm run build:all
```

`make wechat` 会把可导入微信开发者工具的小游戏目录写到 `dist/wechat`（`game.js`、`game.json`、资源）。小游戏构建产物分别位于 `dist/wechat`、`dist/douyin`、`dist/xhs`。平台 AppID、广告、登录、分享等业务能力统一在 `src/platform/` 接入，不进入玩法层。

## 核心原则

- 玩法计算与渲染完全解耦。
- 50 关全部位于 `src/levels/levels.json`。
- Pixi UI：正式游戏 UI 不依赖 HTML/CSS DOM。
- WebGL 优先，默认兼容 WebGL1/2；不依赖 WebGPU。
- 静态棋盘 `cacheAsTexture()`。
- 激光段预创建，发射时只更新 transform / alpha / visibility。
- 粒子使用 `ParticleContainer + Object Pool + Budget`。
- 空闲状态停止 Ticker，减少发热和耗电。
- DPR 上限 2，并由 `PerformanceManager` 自动降质量。

## v7.7.0 视觉与交互升级
### v7.7 Taste redesign pass
- 项目内安装 `.agents/skills/design-taste-frontend/SKILL.md`。
- 移除明显的同心圆氛围层，改为更宽、更安静的环境光。
- 激光回归红色外晕 + 粉红能量层 + 白热核心的清晰层级。
- 反射点增加低成本圆润接头，让 90° 转弯不再像两根硬线拼接。
- 命中反馈改成单一冲击波 + 闪光，不再堆叠多个光圈。
- 发射器 / 终点回归简洁墙体端口轮廓。


- 修复反射镜被激光命中后“消失”的问题：命中弹性动画只作用于镜子内部视觉节点，不再破坏棋盘绝对坐标。
- 恢复镜子点击光环、十字闪光与旋转反馈。
- 恢复棋盘、镜子、Portal、开关等低成本静态辉光，并保持空闲停止 Ticker 的性能策略。
- 激光升级为多层能量束：大范围 haze、bloom、主能量层、粉白等离子层、白热核心、能量包与强化光束头。
- 反射命中升级为双冲击环、中心爆闪、旋转光芒与回弹动画。
- 发射器升级为能量核心 + 发光墙体端口 + 蓄力聚能表现。
- 终点升级为接收器结构、呼吸辉光、命中扩散与胜利爆闪。
- HUD 恢复品牌霓虹标记、卡片高光和更有质感的按钮层次。

详细说明见 `docs/`。

## Audio

内置轻量科幻音效：镜子旋转、蓄力、激光发射、镜面命中、分光、Portal、目标命中、失败与胜利。音频总量约 50KB，适合小游戏首包。


## v7.7 更新
- 反射镜与棱镜改为更扁平、更干净的视觉风格，减少“方块里再套方块”的层级。
- 保留 v6.2 的整体气质，但按 taste skill 原则做减法，突出主要视觉焦点。
