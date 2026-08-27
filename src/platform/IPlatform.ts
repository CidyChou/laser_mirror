export type PlatformKind='web'|'wechat'|'douyin'|'xhs';
export interface ViewportInfo { width:number;height:number;pixelRatio:number }
export interface IPlatform {
  readonly kind:PlatformKind;
  viewport():ViewportInfo;
  createCanvas?():any;
  createAudio?():any;
  attachCanvas(canvas:any,events?:any):void;
  onResize(handler:(v:ViewportInfo)=>void):()=>void;
  vibrate(type?:'light'|'medium'):void;
  storage:{get(key:string):string|null;set(key:string,value:string):void};
}
