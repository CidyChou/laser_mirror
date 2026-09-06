import { readFileSync, writeFileSync } from 'node:fs';

type Row = { number:number; name:string; minClicks:number; live:number; correctLive:number; temptingDecoys:number; effectiveBits:number; solutions:number; allFlipWins:boolean; mirrorFlipWins:boolean; mostSimilar:{number:number;similarity:number} };
const read = (path:string) => JSON.parse(readFileSync(path, 'utf8'));
const before = read('docs/level-audit-before.json') as Row[];
const after = read('docs/level-audit-after.json') as Row[];
const revisions = read('src/levels/revisions.json');
const handcrafted = new Set([21,22,23,35,36]);
const tutorials = new Set([1,2,5,6,11,14,31,41,61,71]);
const flip = (rows:Row[]) => rows.filter(r=>r.allFlipWins||r.mirrorFlipWins).length;
const average = (rows:Row[], key:'live'|'effectiveBits') => (rows.reduce((sum,r)=>sum+r[key],0)/rows.length).toFixed(2);
const similarity = (rows:Row[]) => (rows.reduce((sum,r)=>sum+r.mostSimilar.similarity,0)/rows.length).toFixed(3);
const action = (r:Row) => handcrafted.has(r.number)?'手工保留':revisions[r.number]?'重做布局':r.minClicks!==before[r.number-1].minClicks||r.correctLive!==before[r.number-1].correctLive?'打乱开局':tutorials.has(r.number)?'保留教学':'保留';
const starts = after.slice(0,100).filter(r=>action(r)==='打乱开局').map(r=>r.number);
const text = `# 130 关改版与数值审计

本轮重做 101–120，新增 121–130；前 100 关重做 ${Object.keys(revisions).length} 个布局，另调整 ${starts.length} 关的开局方向。21、22、23、35、36 保持逐字段一致。正式关卡全部不超过 8×8。

## 为什么原来的关卡容易形成套路

旧生成器把解法里的镜面全部取反，把聚合点统一转一格；后续关卡又复用前面的机关图，加长入口走廊。玩家会学到生成器的规律，而不是通过光路推理。

| 指标 | 改版前 | 改版后 |
|---|---:|---:|
| 1–100 可用全部转一次／只转全部反光镜通关 | ${flip(before.slice(0,100))} 关 | ${flip(after.slice(0,100))} 关 |
| 1–100 最近解法中没有任何需保留方向的活动部件 | ${before.slice(0,100).filter(r=>!r.correctLive).length} 关 | ${after.slice(0,100).filter(r=>!r.correctLive).length} 关 |
| 1–100 平均参与光路的可动部件 | ${average(before.slice(0,100),'live')} | ${average(after.slice(0,100),'live')} |
| 1–100 平均有效状态位 | ${average(before.slice(0,100),'effectiveBits')} | ${average(after.slice(0,100),'effectiveBits')} |
| 101–120 没有任何需保留方向的活动部件 | ${before.slice(100).filter(r=>!r.correctLive).length} 关 | 0 关 |
| 101–120 与其他关卡的最高布局相似度，取平均 | ${similarity(before.slice(100))} | ${similarity(after.slice(100,120))} |

仍可“全部转一次”的关卡是 1、2、5、6、11、14、31、41、61，保留在基础练习或新机关教学段。新章节与后期挑战不再采用这个开局套路。

## 手工关卡给出的设计线索

| 关卡 | 最少点击 | 参与光路的可动部件 | 正确、应保留的方向 | 可误入的干扰镜 |
|---|---:|---:|---:|---:|
${after.filter(r=>handcrafted.has(r.number)).map(r=>`| ${r.number} ${r.name} | ${r.minClicks} | ${r.live} | ${r.correctLive} | ${r.temptingDecoys} |`).join('\n')}

第 36 关虽然最少只需两次点击，但玩家要从 11 个活动部件中辨认应改动的部分。第 22、23 关也有多面已经摆对的镜子。好玩的判断来自追踪、排除、保留与多条光路的关系，点击量只能说明操作成本。

本轮新关卡最少需要 5–7 次点击，最近解法涉及 9–13 个可动部件，每关都有需保留和需调整的方向，以及至少一面在错误分支中会被照到的干扰镜。固定镜提供线索；机关组合轮换为分光、取钥、同锁多钥、传送、双晶、三向充能和聚合串联。没有继续拉长棋盘来增加点击数。

初始方向使用每关独立种子打乱并写入关卡文件，重试保持相同开局，便于玩家复盘。聚合点也会采用不同旋转偏移。打乱时计算到全部合法解法的距离，排除意外近路、开局即胜和全部转一次捷径。合法多解会保留；干扰镜方向不同造成的多个获胜配置不等于多个不同谜题解法。

## 1–100 的处理范围

重做布局：${Object.keys(revisions).join('、')}。

只调整开局方向：${starts.join('、')}。

重点处理了 32–34、37–40 的弱机关支路，42–45 的简单传送路径，52、63、67、72、74、78 的低参与度，以及 54/60、88/92、90/98、95/96 的重复布局。原来超尺寸的 50、99、100 也重新设计；101–120 全部改用独立紧凑布局。

以下“活动”是最近解法中被激光碰到的可动部件数量，“保留”是这些部件中无需改变方向的数量；它们不等同于严格必需部件数。

| 关卡 | 处理 | 最少点击 前→后 | 活动 前→后 | 保留 | 干扰镜 | 有效状态位 |
|---|---|---:|---:|---:|---:|---:|
${after.slice(0,100).map((r,i)=>`| ${r.number} ${r.name} | ${action(r)} | ${before[i].minClicks}→${r.minClicks} | ${before[i].live}→${r.live} | ${r.correctLive} | ${r.temptingDecoys} | ${r.effectiveBits} |`).join('\n')}

## 101–130 检查结果

| 关卡 | 最少点击 | 活动 / 保留 | 干扰镜 | 有效状态位 |
|---|---:|---:|---:|---:|
${after.slice(100).map(r=>`| ${r.number} ${r.name} | ${r.minClicks} | ${r.live} / ${r.correctLive} | ${r.temptingDecoys} | ${r.effectiveBits} |`).join('\n')}

## 验证方法与边界

- 穷举每关所有可动镜面、分光镜和聚合点方向；寻找所有获胜配置，计算真实最少点击。固定镜不计入可动变量。
- 130 关均把最近解法逐次点击应用到正式 GameSession，再推进发射、聚合蓄力与门锁时序，确认最终获胜。
- 101–130 检查正确/错误方向混合、有效状态位、可误入干扰镜、开局不胜、无全部转一次捷径及布局重复度。
- 对新关卡最近解法逐个封堵门、聚合点与传送入口；封堵后仍获胜的候选被淘汰。该检查证明这些机关影响所选解法，不声称穷尽所有替代路线的机关依赖。
- 布局相似度为忽略朝向、墙和标记干扰镜后，在旋转／翻转变换中的坐标与类型 Jaccard 重合率。它能筛掉旧模板，不能替代玩家对谜题结构的主观判断；不同大小棋盘使用同一 8 格坐标参照。
- 有效状态位 = log2(全部方向配置数 / 获胜配置数)，表示方向约束量，不是“好玩分数”。
- 实测数值是设计筛查工具。真人体验仍应关注首次通关时间、失败后能否发现新线索、提示使用率，以及卡住时是缺少推理线索还是界面看不清。

此前 35、36 的工程校验报错来自与旧 classic.json 快照不一致；82 的旧分析规则要求唯一配置及固定点击区间，与当前关卡的合法多解和手工调整冲突。它们都能求解并通过正式发射流程。本轮改为保护实际手工关卡快照，旧 classic.json 与 classic-traces.json 继续作为历史光学回归档案。

## 维护与试玩

- 正式来源：src/levels/levels.json。GM 编辑完成后运行 npm run generate:levels，同步 expansion.json，并保留当前 130 关的编辑。
- 新设计存档：challenge.json；前期重做存档：revisions.json；手工保护：handcrafted.json。不要用历史 classic.json 覆盖正式数据。
- 候选设计：scripts/campaign-recipes.ts、puzzle-foundry.ts；design-challenges.ts --resume --replace=关号 可重做指定候选，rebalance-campaign.ts 将审核后的候选应用到正式关卡。该应用会替换 revisions 中列出的关卡，应在 GM 手工编辑前使用。
- npm run analyze:levels 输出逐关 JSON 和开发专用解法；npx tsx --tsconfig tsconfig.json scripts/write-audit-report.ts 更新本文。开发解法不进入正式游戏包。
- 开发服务器的 /tools/visual/optics.html 可选任意关的开局或解法，并使用正式渲染试玩；检查了小屏 375×812、三种主题及 GPU / Graphics 路径。圆形传送门使用细边与同色配对，无编号。
`;
writeFileSync('docs/level-design-audit.md', text);
console.log(`Wrote audit: ${Object.keys(revisions).length} rebuilt + ${starts.length} mixed starts in 1–100.`);
