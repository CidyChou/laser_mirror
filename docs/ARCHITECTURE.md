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

`LaserSimulator` 只输出 `LaserTrace`：segments、impactEvents、targets、switches、doors。视觉层决定激光粗细、粒子、震动、颜色，不改变解谜结果。

## 长期扩展

后续新增颜色激光、Combo、皮肤、每日挑战、关卡编辑器时优先新增独立系统，不向 `GameSession` 堆渲染代码。
