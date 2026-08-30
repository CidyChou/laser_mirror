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

用 GM 后台可视化编辑关卡：

```bash
make gm
```

首次打开会载入现有全部关卡。棋盘支持拖拽摆放、旋转、增删物体；左侧列表可拖拽调整关卡顺序。草稿保存在 `tools/gm/data/`，点 **导出到项目** 才写入 `src/levels/levels.json`。

新增或导出后执行：

```bash
npm run validate:levels
```
