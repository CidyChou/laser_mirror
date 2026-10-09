import type { LevelDefinition } from '@/gameplay/types';
import { stageId, stageLabel } from '@/levels/campaign';
import type { ShareContent } from '@/platform/IPlatform';

// Leave empty until approved share image URLs for this game are available.
export const SHARE_IMAGE_URLS:readonly string[]=[];

export function createGameShareContent(level:LevelDefinition,index:number):ShareContent {
  const imageUrl=SHARE_IMAGE_URLS[Math.floor(Math.random()*SHARE_IMAGE_URLS.length)];
  return {
    title:`来挑战光线急转弯${stageLabel(level,index)}！`,
    query:`stage=${encodeURIComponent(stageId(level,index))}`,
    ...(imageUrl?{imageUrl,imagePreviewUrl:imageUrl}:{}),
  };
}
