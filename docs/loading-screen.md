# 游戏加载页

参考 `number-zones` 的标题图片、程序绘制迷你棋盘、真实资源进度和开始按钮结构。

- 唯一位图：`public/ui/loading-title.png`，透明 PNG，1610 × 977。
- `src/rendering/loading/LoadingScene.ts`：代码绘制背景、疏星、进度和按钮，负责手机布局及标题图片的文字降级。
- `src/rendering/loading/LoadingBoard.ts`：5 × 5 迷你棋盘。镜面转正 → 激光折射 → 终点亮起 → 淡出重播。图形预先创建，每帧只更新透明度和变换。
- `src/app/StartupScreen.ts`：加载动画和输入的生命周期，开始后用 240 ms 淡出并释放场景。
- `GameApplication`：准备完整游戏视图、报告实际资源完成比例，点击开始后进入原有选关页。Web、微信、抖音、小红书共用此流程。

动画不写入关卡、进度或玩法状态。Web 尊重系统的减少动态效果设置；开启后显示静态完整光路。小游戏沿用现有原生图片和触摸适配器。可选图片失败或超过 4.5 秒无回调时使用备用图形/文字，避免阻塞启动。进度按已完成的资源任务计数，不表示下载字节数。

开发用引导页通过 `start(undefined, { skipLoading: true })` 跳过开始页，保持原来的直达行为。

## 验证

```sh
npm run typecheck
npm run verify:loading
npm run build:web
npm run build:wechat
```

资源验证覆盖正常加载、标题文件缺失、原生图片无回调、进度递增以及回调清理。浏览器已检查 390 × 844、320 × 568 布局和开始进入选关页；微信构建主包 3.24 MB。小游戏真机表现仍需在设备上确认。

## 标题图生成记录

使用内置 `image_gen` 工具生成，保留原始透明通道，无整页图片背景。生成提示词：

```text
Use case: logo-brand
Asset type: transparent PNG title artwork for an existing Chinese mobile laser-and-mirror puzzle game, displayed above a code-rendered board.
Primary request: Make a polished, compact, highly legible Chinese game wordmark. Exact text, only: "光线急转弯". Arrange in TWO centered lines: top line "光线" and bottom line "急转弯". Bottom line wider. Five characters must be perfectly spelled. Large chunky custom Chinese lettering with slightly softened geometric corners, subtle playful forward slant, premium casual mobile puzzle identity. Letter faces luminous cool ivory, with pale cyan bevels; short deep navy extruded sides, a restrained hot-pink edge on the lower right of some strokes. Crisp defined shapes, restrained dimensional depth. One tiny integrated laser sparkle is fine, no background illustrations.
Composition: tightly composed centered two-line wordmark filling the usable canvas with approximately 7% transparent margin; width:height approximately 1.65:1. Straight-on view. The intended game background is very dark navy #080f1f, so use dark outer edge and clear pale lettering. Actual alpha transparency all around and between letters.
Constraints: TRANSPARENT background, title artwork only, no board, no panel, no bounding box, no large aura, no clouds, no rainbow, no planets, no confetti, no English subtitle, no extra text, no watermark. Do not bake a checkerboard into the image.
```
