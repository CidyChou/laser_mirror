import { GameApplication } from '@/app/GameApplication';
import { installMiniGamePixiAdapter } from '@/platform/minigame/MiniGamePixiAdapter';
import { DouyinPlatform } from '@/platform/douyin/DouyinPlatform';
const api=(globalThis as any).tt;installMiniGamePixiAdapter(api);const platform=new DouyinPlatform(api);new GameApplication(platform).start(platform.createCanvas()).catch(console.error);
