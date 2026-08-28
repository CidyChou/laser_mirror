# Performance Budget

## 目标

- 中高端手机：稳定 60 FPS。
- 低端设备重特效：至少 30 FPS。
- Idle：Ticker 停止，不持续重绘。

## 已实现

1. Board 静态缓存为纹理。
2. 激光按合并后的直线 run 预建多层 Graphics（外晕 / 主体 / 等离子 / 核心），放在旋转容器里。发射时用 `scale.x` 揭示，用 `scale.y` / alpha 做呼吸，不再每帧 `clear()` 重描整条光路。
3. 合并 run 时不跨越镜子 / Portal 的 travel 间隙，反射停顿仍然成立。
4. 光束头、光子点和蓄力是仅有的逐帧几何；光子是点，不是缠绕折线。
5. **不使用 BlurFilter。** 外晕是两道低透明度加法描边。
6. 粒子使用 `ParticleContainer`，对象复用；动态属性只上传 position / color。
7. Quality：High / Medium / Low。手机 / 小游戏默认 Medium；连续低帧率再降到 Low。不会自动升回 High。
8. 粒子预算：High 360 / Medium 220 / Low 120。Low 档发射数量再乘 0.55。
9. Quality 同时关掉激光层：High 四层，Medium 无宽外晕，Low 只留主体 + 核心，无光子。
10. iOS / 高密度屏优先使用最高 3x Retina 分辨率；按 330 万后备缓冲像素预算自动限幅，避免平板和超大屏显存暴涨。
11. 小游戏与 Web 统一启用 MSAA 抗锯齿；静态棋盘缓存升级到 2x 并单独启用抗锯齿，避免斜线、圆角和格子边缘被低分辨率缓存放大。
12. 连续低于 32 FPS 时，除降低粒子和激光层级外，渲染分辨率一次性降至基础值的 80%（最低 1.5x）；本局不反复升降，避免画面抖动和频繁重建后备缓冲。
13. 空闲停止 Ticker。
14. HUD / 端口 / 按钮按脏标记更新；命中时不再销毁端口 Graphics。冲击环预描，激活只改 tint / transform。
15. 旋转镜子只改该格 `rotation`，不再 `sync` 整层对象 / HUD，也不在点击帧里震动。
16. 金币柜台和飞币图形预建 + 对象池；飞金币只改 transform / alpha。通关时一次写入钱包，不在每枚到达时写 `localStorage`。
17. 结算遮罩和胜利洗屏预描，动画只改 alpha。

## 后续 Shader

激光效果继续升级时，优先把 Flow / Noise / Electric Arc 做成单个 Mesh Shader，而不是增加数百 CPU 粒子。
