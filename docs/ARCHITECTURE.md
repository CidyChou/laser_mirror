# Architecture

```text
GameApplication
├── GameSession                 # 状态机：关卡、旋转、试射、胜负
│   └── LaserSimulator          # 纯逻辑，无 Pixi / DOM / 平台 API
├── PixiGameView                # 唯一正式渲染实现
│   ├── BoardLayer              # 静态缓存
│   ├── ObjectLayer             # 镜子/分光/墙/门/Portal/端口
│   ├── LaserEffect             # GPU 图形层，分段揭示
│   ├── ParticleSystem          # ParticleContainer + Pool
│   ├── ImpactSystem            # Duang / 命中冲击环
│   └── HudLayer                # Pixi UI
├── PerformanceManager          # FPS / Quality / 粒子预算
└── IPlatform
    ├── WebPlatform
    ├── WeChatPlatform
    ├── DouyinPlatform
    └── XhsPlatform
```

## Gameplay 与 Renderer 解耦

`LaserSimulator` 只输出 `LaserTrace`：segments、impactEvents、targets、switches、doors、focus、combiner。视觉层决定激光粗细、粒子、震动、颜色，不改变解谜结果。

51 关之后可选：多个 `emitters`、棋盘 `focus` 双束终点、`combiner` 聚合点。1–50 不含这些字段，光路与旧版一致（由 `classic.json` + `classic-traces.json` 冻结）。

## 长期扩展

关卡编辑器是独立的 Vite 开发服务（`make gm` / `tools/gm`），不进入 `GameSession` 或正式包。它复用 `LaserSimulator` 做光路预览，导出时写回 `src/levels/levels.json`。

后续新增颜色激光、Combo、皮肤、每日挑战时优先新增独立系统，不向 `GameSession` 堆渲染代码。
