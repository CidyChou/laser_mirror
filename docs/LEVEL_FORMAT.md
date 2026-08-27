# Level Data

所有关卡都在 `src/levels/levels.json`，玩法层只读取数据，不写死关卡。

主要字段：

- `rows / cols`: 棋盘尺寸
- `emitter`: 墙面激光发射口
- `targets`: 一个或多个墙面终点
- `shots`: 本关可试射次数
- `items`: mirror / splitter / wall / switch / door / portal
- `fixed`: 镜子不可旋转
- `decoy`: 仅用于关卡设计标记，逻辑上仍是正常镜子

新增关卡后执行：

```bash
npm run validate:levels
```
