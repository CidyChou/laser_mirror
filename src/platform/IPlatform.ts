export type PlatformKind='web'|'wechat'|'douyin'|'xhs';
export type HapticKind='light'|'medium'|'heavy'|'success';
export interface ViewportInfo { width:number;height:number;pixelRatio:number }
export interface IPlatform {
  readonly kind:PlatformKind;
  viewport():ViewportInfo;
  createCanvas?():any;
  createAudio?():any;
  attachCanvas(canvas:any,events?:any):void;
  onResize(handler:(v:ViewportInfo)=>void):()=>void;
  /** Screen-pixel Y below the platform capsule / status bar. 0 if none. */
  safeTop():number;
  vibrate(type?:HapticKind):void;
  storage:{get(key:string):string|null;set(key:string,value:string):void};
}
