import type { LevelDefinition } from '@/gameplay/types';
import { stageId, stageLabel } from '@/levels/campaign';
import type { ShareContent } from '@/platform/IPlatform';

export const SHARE_IMAGE_URLS:readonly string[]=[
  'https://mmocgame.qpic.cn/wechatgame/IW0TIXj1iaP56um7H0FPAG0z4aHDuicwQ6dCJGIeF0Wu51l0sLYaLssMOuBMNL5bnt/0',
  'https://mmocgame.qpic.cn/wechatgame/IW0TIXj1iaP5l1hHGM8ysJ6akNIom9iaMfVPiauHkPmYInVu1o1m87q17MYNv4IL298/0',
  'https://mmocgame.qpic.cn/wechatgame/IW0TIXj1iaP4knEUvZIWgx2ZcyL0uj2vvTAjwd27yB2PicJs1Oyz7QVVMzW0xxWtUP/0',
];

export function createGameShareContent(level:LevelDefinition,index:number):ShareContent {
  const imageUrl=SHARE_IMAGE_URLS[Math.floor(Math.random()*SHARE_IMAGE_URLS.length)];
  return {
    title:`来挑战光线急转弯${stageLabel(level,index)}！`,
    query:`stage=${encodeURIComponent(stageId(level,index))}`,
    ...(imageUrl?{imageUrl,imagePreviewUrl:imageUrl}:{}),
  };
}
