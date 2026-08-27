import { GameApplication } from '@/app/GameApplication';
import { WebPlatform } from '@/platform/web/WebPlatform';
new GameApplication(new WebPlatform()).start().catch(console.error);
