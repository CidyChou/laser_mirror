import { BaseMiniGamePlatform } from '../minigame/BaseMiniGamePlatform';
import type { ShareContent, ShareContentProvider } from '../IPlatform';
import { WeChatActivity } from './WeChatActivity';
import { WeChatAds } from './WeChatAds';
import { WeChatCommunity } from './WeChatCommunity';
import { WECHAT_OPERATIONS, type WeChatOperationsConfig } from './config';

export class WeChatPlatform extends BaseMiniGamePlatform {
  private readonly activity = new WeChatActivity();
  readonly ads: WeChatAds;
  readonly community: WeChatCommunity;
  constructor(api:any=(globalThis as any).wx,config:WeChatOperationsConfig=WECHAT_OPERATIONS) {
    if(!api)throw new Error('wx runtime not found');
    super('wechat',api);
    this.ads = new WeChatAds(api, this.activity, config);
    this.community = new WeChatCommunity(api, this.activity, config);
  }

  onExternalActivityChange(handler:(active:boolean)=>void) { return this.activity.subscribe(handler); }

  configureShare(provider:ShareContentProvider):void {
    const actions=[
      ()=>this.api.showShareMenu?.({withShareTicket:true,menus:['shareAppMessage','shareTimeline']}),
      ()=>this.api.updateShareMenu?.({withShareTicket:true}),
      ()=>this.api.onShareAppMessage?.(provider),
      ()=>this.api.onShareTimeline?.(()=>{
        const {imageUrlId:friendImageId,...content}=provider();
        const previewId=content.imagePreviewUrl?content.imagePreviewUrlId:friendImageId;
        return {
          ...content,
          ...(content.imagePreviewUrl?{imageUrl:content.imagePreviewUrl}:{}),
          ...(previewId?{imageUrlId:previewId}:{}),
        };
      }),
    ];
    for(const action of actions) {
      try {
        const result=action();
        if(result instanceof Promise)void result.catch(()=>undefined);
      } catch {
        // Older/restricted share APIs must not block startup or other menus.
      }
    }
  }

  canShare():boolean {
    return typeof this.api.shareAppMessage==='function';
  }

  shareAppMessage(content:ShareContent):void {
    if(!this.canShare())return;
    try {
      const result=this.api.shareAppMessage(content);
      if(result instanceof Promise)void result.catch(()=>undefined);
    } catch {
      // Cancelling or rejecting a share must not interrupt the current game.
    }
  }

  getSharedStage():string|null {
    try {
      const stage=this.api.getLaunchOptionsSync?.()?.query?.stage;
      return typeof stage==='string'&&stage.length>0?stage:null;
    } catch {
      return null; // Older base libraries can still open the normal level menu.
    }
  }
}
