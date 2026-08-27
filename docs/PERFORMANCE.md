# Performance Budget

## 目标

- 中高端手机：稳定 60 FPS。
- 低端设备重特效：至少 30 FPS。
- Idle：Ticker 停止，不持续重绘。

## 已实现

1. Board 静态缓存为纹理。
2. 激光每条 Segment 预建 4 层 Graphics，动画阶段只改变 `scale.x`。
3. 粒子使用 `ParticleContainer`，对象复用，不在每个爆炸中创建/销毁大量 Sprite。
4. Quality：High / Medium / Low；连续低帧率自动下降。
5. 粒子预算：High 360 / Medium 220 / Low 120。
6. resolution 上限：2；低质量档可进一步降至 1.5（下一阶段可动态重建 renderer）。
7. 不使用大面积 BlurFilter 作为激光主体；主要用多层透明几何模拟 glow。

## 后续 Shader

激光效果继续升级时，优先把 Flow / Noise / Electric Arc 做成单个 Mesh Shader，而不是增加数百 CPU 粒子。
