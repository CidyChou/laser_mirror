import 'pixi.js/unsafe-eval';
import { GameApplication } from '@/app/GameApplication';
import { installMiniGamePixiAdapter } from '@/platform/minigame/MiniGamePixiAdapter';
import { XhsPlatform } from '@/platform/xhs/XhsPlatform';
const api=(globalThis as any).xhs;installMiniGamePixiAdapter(api);const platform=new XhsPlatform(api);new GameApplication(platform).start(platform.createCanvas()).catch(console.error);
