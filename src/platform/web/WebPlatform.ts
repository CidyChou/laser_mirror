import type { IPlatform, ViewportInfo } from '../IPlatform';
export class WebPlatform implements IPlatform{
  readonly kind='web' as const;
  viewport():ViewportInfo{return{width:Math.min(window.innerWidth,520),height:window.innerHeight,pixelRatio:Math.max(1,window.devicePixelRatio||1)}}
  createAudio(){const audio=new Audio();audio.preload='auto';(audio as HTMLAudioElement & {playsInline?:boolean}).playsInline=true;return audio;}
  attachCanvas(canvas:HTMLCanvasElement,_events?:any){const root=document.getElementById('app')!;root.innerHTML='';root.appendChild(canvas);canvas.style.width=`${this.viewport().width}px`;canvas.style.height=`${this.viewport().height}px`;}
  onResize(handler:(v:ViewportInfo)=>void){const fn=()=>handler(this.viewport());window.addEventListener('resize',fn);return()=>window.removeEventListener('resize',fn)}
  safeTop(){return 0}
  vibrate(type:'light'|'medium'|'heavy'|'success'='light'){
    try{
      if(type==='success') navigator.vibrate?.([36, 50, 90]);
      else navigator.vibrate?.(type==='heavy'?42:type==='medium'?28:14);
    }catch{}
  }
  storage={get:(key:string)=>localStorage.getItem(key),set:(key:string,value:string)=>localStorage.setItem(key,value)};
}
