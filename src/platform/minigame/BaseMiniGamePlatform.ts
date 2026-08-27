import type { IPlatform, PlatformKind, ViewportInfo } from '../IPlatform';
export class BaseMiniGamePlatform implements IPlatform{
  constructor(readonly kind:PlatformKind,protected readonly api:any){}
  viewport():ViewportInfo{const s=this.api.getSystemInfoSync?.()??{};return{width:s.windowWidth??s.screenWidth??720,height:s.windowHeight??s.screenHeight??1100,pixelRatio:Math.min(s.pixelRatio??2,2)}}
  createCanvas(){return this.api.createCanvas?.() ?? (globalThis as any).canvas ?? this.api.createOffscreenCanvas?.({type:'2d',width:this.viewport().width,height:this.viewport().height})}
  createAudio(){return this.api.createInnerAudioContext?.()}
  attachCanvas(_canvas:any){}
  onResize(handler:(v:ViewportInfo)=>void){const fn=()=>handler(this.viewport());this.api.onWindowResize?.(fn);return()=>this.api.offWindowResize?.(fn)}
  vibrate(type:'light'|'medium'='light'){if(this.api.vibrateShort)this.api.vibrateShort({type});}
  storage={get:(key:string)=>{try{return this.api.getStorageSync?.(key)??null}catch{return null}},set:(key:string,value:string)=>{try{this.api.setStorageSync?.(key,value)}catch{}}};
}
