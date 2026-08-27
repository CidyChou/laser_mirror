import { BaseMiniGamePlatform } from '../minigame/BaseMiniGamePlatform';
export class WeChatPlatform extends BaseMiniGamePlatform{constructor(api:any=(globalThis as any).wx){if(!api)throw new Error('wx runtime not found');super('wechat',api);}}
