import { DOMAdapter } from 'pixi.js';

export interface MiniGameApi {
  createCanvas?:()=>any;createOffscreenCanvas?:(options?:any)=>any;createImage?:()=>any;getSystemInfoSync?:()=>any;
}

export function installMiniGamePixiAdapter(api:MiniGameApi){
  if(!api) throw new Error('Mini-game API is unavailable');
  const makeCanvas=(width=1,height=1)=>{let c=api.createCanvas?.() ?? api.createOffscreenCanvas?.({type:'2d',width,height}) ?? (typeof (globalThis as any).OffscreenCanvas==='function'?new (globalThis as any).OffscreenCanvas(width,height):null);if(!c) c=(globalThis as any).canvas??null;if(c){c.width=width;c.height=height;}return c;};
  const probe=()=>makeCanvas();
  const adapter:any={
    createCanvas:(width=1,height=1)=>{const c=makeCanvas(width,height);if(!c)throw new Error('Platform canvas API is unavailable');return c;},
    createImage:()=>api.createImage?.() ?? {},
    getCanvasRenderingContext2D:()=>{const c=probe();const ctx=c?.getContext?.('2d');return ctx?.constructor ?? class Canvas2DContext {};},
    getWebGLRenderingContext:()=>{const c=probe();const gl=c?.getContext?.('webgl2') ?? c?.getContext?.('webgl');return gl?.constructor ?? class WebGLContext {};},
    getFontFaceSet:()=>undefined,
    getNavigator:()=>((globalThis as any).navigator??{userAgent:'MiniGame',gpu:null}),
    getBaseUrl:()=>'',
    fetch:(url:any,options:any)=>{if(typeof globalThis.fetch==='function')return globalThis.fetch(url,options);return Promise.reject(new Error('No fetch adapter configured. Bundle local assets or implement platform request -> Response.'));},
    parseXML:()=>{throw new Error('XML parsing is not enabled in the game runtime.');},
  };
  DOMAdapter.set(adapter);
}
