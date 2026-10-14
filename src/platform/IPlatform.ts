export type PlatformKind='web'|'wechat'|'douyin'|'xhs';
export type HapticKind='light'|'medium'|'heavy'|'launch'|'success';
export interface ViewportInfo { width:number;height:number;pixelRatio:number }
export interface AlbumSaveInput { canvas:unknown; filename?:string }
export interface AlbumSaveResult { ok:boolean; message:string }
export interface ShareContent {
  readonly title:string;
  readonly query:string;
  readonly imageUrl?:string;
  readonly imageUrlId?:string;
  readonly imagePreviewUrl?:string;
  readonly imagePreviewUrlId?:string;
}
export type ShareContentProvider=()=>ShareContent;
export interface IPlatform {
  readonly kind:PlatformKind;
  viewport():ViewportInfo;
  createCanvas?():any;
  createAudio?():any;
  attachCanvas(canvas:any,events?:any):void;
  onResize(handler:(v:ViewportInfo)=>void):()=>void;
  onAudioActiveChange?(handler:(active:boolean)=>void):()=>void;
  /** Screen-pixel Y below the platform capsule / status bar. 0 if none. */
  safeTop():number;
  vibrate(type?:HapticKind):void;
  cancelHaptics?():void;
  storage:{get(key:string):string|null;set(key:string,value:string):void};
  saveImageToAlbum(input:AlbumSaveInput):Promise<AlbumSaveResult>;
  configureShare?(provider:ShareContentProvider):void;
  canShare?():boolean;
  shareAppMessage?(content:ShareContent):void;
  getSharedStage?():string|null;
}
