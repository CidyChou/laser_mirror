import { BaseMiniGamePlatform } from '../minigame/BaseMiniGamePlatform';
export class XhsPlatform extends BaseMiniGamePlatform{constructor(api:any=(globalThis as any).xhs){if(!api)throw new Error('xhs runtime not found');super('xhs',api);}}
