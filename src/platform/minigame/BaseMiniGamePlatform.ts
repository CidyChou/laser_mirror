import type { IPlatform, PlatformKind, ViewportInfo } from '../IPlatform';
export class BaseMiniGamePlatform implements IPlatform{
  private detachInput=()=>{};
  constructor(readonly kind:PlatformKind,protected readonly api:any){}
  viewport():ViewportInfo{const s=this.api.getSystemInfoSync?.()??{};return{width:s.windowWidth??s.screenWidth??720,height:s.windowHeight??s.screenHeight??1100,pixelRatio:Math.max(1,s.pixelRatio??2)}}
  createCanvas(){
    const canvas=this.api.createCanvas?.() ?? (globalThis as any).canvas ?? this.api.createOffscreenCanvas?.({type:'2d',width:this.viewport().width,height:this.viewport().height});
    if(!canvas)return canvas;
    if(typeof canvas.addEventListener!=='function')canvas.addEventListener=()=>{};
    if(typeof canvas.removeEventListener!=='function')canvas.removeEventListener=()=>{};
    canvas.style??={};
    const global=globalThis as any;
    if(typeof global.requestAnimationFrame!=='function'&&typeof canvas.requestAnimationFrame==='function')global.requestAnimationFrame=canvas.requestAnimationFrame.bind(canvas);
    if(typeof global.cancelAnimationFrame!=='function'&&typeof canvas.cancelAnimationFrame==='function')global.cancelAnimationFrame=canvas.cancelAnimationFrame.bind(canvas);
    return canvas;
  }
  createAudio(){return this.api.createInnerAudioContext?.()}
  attachCanvas(canvas:any,events?:any){
    this.detachInput();
    if(!canvas||!events)return;

    // Pixi's DOM listeners are not connected to native mini-game touches.
    // Keep Pixi's event boundary, but feed it platform pointer events directly.
    events.setTargetElement?.(null);
    events.domElement=canvas;
    events.mapPositionToPoint=(point:{x:number;y:number},x:number,y:number)=>{point.x=x;point.y=y;};
    events.cursorStyles.default=()=>{};
    events.cursorStyles.pointer=()=>{};

    const removers:(()=>void)[]=[];
    const bind=(onName:string,offName:string,type:string,dispatch:(event:any)=>void)=>{
      const on=this.api[onName];
      if(typeof on!=='function')return;
      const handler=(nativeEvent:any)=>{
        const touches=nativeEvent?.changedTouches?.length
          ? nativeEvent.changedTouches
          : nativeEvent?.touches?.length
            ? nativeEvent.touches
            : [nativeEvent];
        for(const touch of touches){
          if(!touch)continue;
          dispatch(pointerEvent(type,touch,nativeEvent,canvas));
        }
      };
      on.call(this.api,handler);
      const off=this.api[offName];
      if(typeof off==='function')removers.push(()=>off.call(this.api,handler));
    };
    bind('onTouchStart','offTouchStart','pointerdown',(event)=>events._onPointerDown(event));
    bind('onTouchMove','offTouchMove','pointermove',(event)=>events._onPointerMove(event));
    bind('onTouchEnd','offTouchEnd','pointerup',(event)=>events._onPointerUp(event));
    bind('onTouchCancel','offTouchCancel','pointercancel',(event)=>events._onPointerUp(event));
    this.detachInput=()=>{for(const remove of removers)remove();removers.length=0;};
  }
  onResize(handler:(v:ViewportInfo)=>void){const fn=()=>handler(this.viewport());this.api.onWindowResize?.(fn);return()=>this.api.offWindowResize?.(fn)}
  safeTop(){
    try{
      const menu=this.api.getMenuButtonBoundingClientRect?.();
      if(menu&&Number.isFinite(menu.bottom)) return Number(menu.bottom)+10;
      const info=this.api.getSystemInfoSync?.()??{};
      const status=Number(info.statusBarHeight??info.safeArea?.top??0);
      if(status>0) return status+48;
    }catch{}
    return 0;
  }
  vibrate(type:'light'|'medium'|'heavy'|'success'='light'){
    if(type==='success'){
      if(this.api.vibrateLong){
        this.api.vibrateLong();
        const later=typeof setTimeout==='function'?(fn:()=>void)=>setTimeout(fn,420):(fn:()=>void)=>fn();
        later(()=>this.api.vibrateLong?.());
      }else this.api.vibrateShort?.({type:'heavy'});
      return;
    }
    const mapped=type==='light'?'medium':'heavy';
    if(this.api.vibrateShort) this.api.vibrateShort({type:mapped});
    else this.api.vibrateLong?.();
  }
  storage={get:(key:string)=>{try{return this.api.getStorageSync?.(key)??null}catch{return null}},set:(key:string,value:string)=>{try{this.api.setStorageSync?.(key,value)}catch{}}};
}

function pointerEvent(type:string,touch:any,nativeEvent:any,canvas:any){
  const clientX=number(touch.clientX,touch.x,touch.pageX);
  const clientY=number(touch.clientY,touch.y,touch.pageY);
  const released=type==='pointerup'||type==='pointercancel';
  return{
    type,clientX,clientY,pageX:clientX,pageY:clientY,screenX:clientX,screenY:clientY,
    movementX:0,movementY:0,offsetX:clientX,offsetY:clientY,
    pointerId:(touch.identifier??0)+1,pointerType:'touch',isPrimary:(touch.identifier??0)===0,
    button:0,buttons:released?0:1,pressure:released?0:(touch.force??.5),
    width:touch.radiusX??1,height:touch.radiusY??1,tiltX:0,tiltY:0,twist:0,tangentialPressure:0,
    altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,isTrusted:true,cancelable:false,
    target:canvas,srcElement:canvas,nativeEvent,
    composedPath:()=>[canvas],preventDefault:()=>{},
  };
}

function number(...values:any[]){for(const value of values)if(Number.isFinite(value))return Number(value);return 0;}
