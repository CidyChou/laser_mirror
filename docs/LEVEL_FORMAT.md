# Level Data

所有 100 个关卡都在 `src/levels/levels.json`，玩法层只读取数据，不写死关卡。前 50 关冻结在 `src/levels/classic.json`，校验时不允许改动；51–100 由扩展关生成器维护。

主要字段：

- `rows / cols`: 棋盘尺寸
- `emitter`: 主发射口（兼容旧关卡）
- `emitters`: 可选，多个墙面发射口；省略时只用 `emitter`
- `targets`: 墙面终点（可空，若棋盘上有 `focus`）
- `shots`: 本关可试射次数
- `items`: mirror / splitter / wall / switch / door / portal / **focus** / **combiner**
- `focus`: 棋盘上的双束终点，默认需要 2 束从不同方向打中
- `combiner`: 聚合点，吃掉足够光束后向 `dir`（0东/1南/2西/3北）射出一束
- `fixed`: 镜子或聚合点不可旋转
- `decoy`: 仅用于关卡设计标记，逻辑上仍是正常镜子

用 GM 后台可视化编辑关卡：

```bash
make gm
```

首次打开会载入现有全部关卡。棋盘支持拖拽摆放、旋转、增删物体；左侧列表可拖拽调整关卡顺序。草稿保存在 `tools/gm/data/`，点 **导出到项目** 才写入 `src/levels/levels.json`。

新增或导出后执行：

```bash
npm run validate:levels
npm run verify:expansion
npm run analyze:levels
```

`npm run generate:levels` 会重新生成 `expansion.json`，并以 `classic.json + expansion.json` 的顺序同步正式 `levels.json`。第 81–100 关还会由分析器检查唯一解、最少点击、必要操作数、状态空间以及 Focus 的不同入射方向。
