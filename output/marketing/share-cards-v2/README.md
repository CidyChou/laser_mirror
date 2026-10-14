# 光线急转弯 · 互动分享图 v2

本套使用内置 image_gen，参考用户提供的《数字圈圈乐》分享图的大字排版及轻挑衅文案；保留光线急转弯的深蓝紫、青蓝镜面、粉红激光和浅2.5D风格。

| 图片 | 用途 | 配套转发标题 |
| --- | --- | --- |
| 01-taunt | 通关后的好友挑战 | 就这？你也行？ |
| 02-dare | 普通好友邀请 | 不会吧！这都不敢来？ |
| 03-help | 卡关求助 | 差一个转弯！你来试试？ |

每张提供1000×800和500×400 JPEG，比例5:4。压缩文件目标为小于200KB，作为便于上传的导出目标，不代表已核实分享后台的文件大小上限。原始PNG保留于originals。

01与02基于上一批模拟器验证的第一关及第三关通关解法。03为真实第一关未解状态：中央镜面为反斜杠，光向右入射后向下射出棋盘，上方终点未命中；转动中央镜面即可接通。验证记录在references/level-1-unsolved.json。

这些是通用场景分享图，若用于分享当前关卡，图内示例棋盘不等于玩家当时的动态关卡截图。

在后台上传审核通过后，将每张图片返回的imageUrlId和imageUrl一起传入wx.shareAppMessage或wx.onShareAppMessage。query仍使用游戏现有关卡参数。图片中的固定文案可用作title；动态挑战标题也可以由游戏保留。

官方方法说明：https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/share.html
完整生成提示词：prompts.md。

