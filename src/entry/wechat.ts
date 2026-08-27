import { GameApplication } from '@/app/GameApplication';
import { installMiniGamePixiAdapter } from '@/platform/minigame/MiniGamePixiAdapter';
import { WeChatPlatform } from '@/platform/wechat/WeChatPlatform';
const api=(globalThis as any).wx;installMiniGamePixiAdapter(api);const platform=new WeChatPlatform(api);new GameApplication(platform).start(platform.createCanvas()).catch(console.error);
