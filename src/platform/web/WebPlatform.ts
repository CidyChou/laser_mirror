import type { IPlatform, ViewportInfo } from '../IPlatform';
export class WebPlatform implements IPlatform{
  readonly kind='web' as const;
  viewport():ViewportInfo{return{width:Math.min(window.innerWidth,520),height:window.innerHeight,pixelRatio:Math.min(window.devicePixelRatio||1,2)}}
  createAudio(){const audio=new Audio();audio.preload='auto';(audio as HTMLAudioElement & {playsInline?:boolean}).playsInline=true;return audio;}
  attachCanvas(canvas:HTMLCanvasElement,_events?:any){const root=document.getElementById('app')!;root.innerHTML='';root.appendChild(canvas);canvas.style.width=`${this.viewport().width}px`;canvas.style.height=`${this.viewport().height}px`;}
  onResize(handler:(v:ViewportInfo)=>void){const fn=()=>handler(this.viewport());window.addEventListener('resize',fn);return()=>window.removeEventListener('resize',fn)}
  vibrate(type:'light'|'medium'='light'){navigator.vibrate?.(type==='medium'?28:12)}
  storage={get:(key:string)=>localStorage.getItem(key),set:(key:string,value:string)=>localStorage.setItem(key,value)};
}
