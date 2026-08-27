import { BaseMiniGamePlatform } from '../minigame/BaseMiniGamePlatform';
export class DouyinPlatform extends BaseMiniGamePlatform{constructor(api:any=(globalThis as any).tt){if(!api)throw new Error('tt runtime not found');super('douyin',api);}}
