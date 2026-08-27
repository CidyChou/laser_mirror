import { Container, Graphics, Text, Texture, type Renderer } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, STAGE_HEIGHT, STAGE_TOP } from '@/config/GameConfig';
import { borderPoint, computeGeometry } from '@/gameplay/geometry';
import type { BoardGeometry, GameState, ImpactEvent } from '@/gameplay/types';
import type { PerformanceManager } from '@/performance/PerformanceManager';
import { BoardLayer } from './layers/BoardLayer';
import { ObjectLayer } from './layers/ObjectLayer';
import { HudLayer } from './layers/HudLayer';
import { ComboLayer } from './layers/ComboLayer';
import { ResultLayer, type ResultKind } from './layers/ResultLayer';
import { SettingsLayer } from './layers/SettingsLayer';
import { LaserEffect } from './effects/LaserEffect';
import { ImpactSystem } from './effects/ImpactSystem';
import { ParticleSystem } from './effects/ParticleSystem';
import { FONT_UI, Theme } from './theme';
import type { UiAssetKey } from './ui/assets';

export class PixiGameView{
  readonly root=new Container();
  private bg=new Graphics();private stageBg=new Graphics();private board=new BoardLayer();private objects=new ObjectLayer();private laser=new LaserEffect();private impacts=new ImpactSystem();private particles:ParticleSystem;private hud=new HudLayer();private combo=new ComboLayer();readonly result=new ResultLayer();readonly settings=new SettingsLayer();private toastBg=new Graphics();private toast=new Text({text:'',style:{fontFamily:FONT_UI,fontSize:18,fontWeight:'700',fill:Theme.text}});private toastUntil=0;private victoryUntil=0;private victoryWash=new Graphics();private currentLevel=-1;private lastGeometry:BoardGeometry|null=null;private comboActive=false;private resultActive=false;
  constructor(renderer:Renderer,private readonly performance:PerformanceManager){this.particles=new ParticleSystem(renderer);this.buildBackground();this.root.addChild(this.bg,this.stageBg,this.board,this.objects,this.laser,this.particles.container,this.impacts,this.victoryWash,this.hud,this.combo,this.toastBg,this.toast,this.result,this.settings);this.toast.anchor.set(.5);this.toast.position.set(360,220);this.toast.visible=false;this.toastBg.visible=false;}
  private buildBackground(){
    this.bg.rect(0,0,DESIGN_WIDTH,DESIGN_HEIGHT).fill(Theme.bg);
    this.stageBg.roundRect(32,STAGE_TOP,656,STAGE_HEIGHT,22).fill(Theme.bg1);
    this.stageBg.roundRect(32,STAGE_TOP,656,280,22).fill({color:Theme.bg0,alpha:.42});
    this.stageBg.ellipse(360,STAGE_TOP+70,520,220).fill({color:Theme.cyan,alpha:.016});
  }
  setHandlers(h:{rotate:(x:number,y:number)=>void;fire:()=>void;reset:()=>void;openSettings:()=>void;toggleAudio:()=>void;closeSettings:()=>void;resultPrimary:()=>void;resultSecondary:()=>void}){
    this.objects.setRotateHandler(h.rotate);
    this.hud.fireButton.on('pointertap',h.fire);
    this.hud.settingsButton.on('pointertap',h.openSettings);
    this.settings.closeButton.on('pointertap',h.closeSettings);
    this.settings.audioButton.on('pointertap',h.toggleAudio);
    this.settings.restartButton.on('pointertap',()=>{h.closeSettings();h.reset();});
    this.result.primary.on('pointertap',h.resultPrimary);
    this.result.secondary.on('pointertap',h.resultSecondary);
  }
  setUiTexture(key:UiAssetKey, texture:Texture){
    if(key==='settings') this.hud.setGearTexture(texture);
    if(key==='crown') this.result.setCrownTexture(texture);
  }
  sync(state:GameState){const g=computeGeometry(state.level);this.lastGeometry=g;if(this.currentLevel!==state.levelIndex){this.currentLevel=state.levelIndex;this.board.rebuild(state.level,g);this.hideOverlays();}this.objects.sync(state,g);this.laser.bind(state);this.hud.sync(state);}
  hideOverlays(){this.result.hide();this.settings.hide();this.combo.clear();}
  showSettings(audioEnabled:boolean){this.settings.show(audioEnabled);}
  setAudioEnabled(enabled:boolean){this.settings.setAudioEnabled(enabled);}
  closeSettings(){this.settings.hide();}
  showResult(kind:ResultKind, copy:{title:string;subtitle:string;tip:string;primary:string;secondary?:string}, now:number){this.result.show(kind,copy,now);}
  showCombo(count:number, now:number){this.combo.show(count,now);}
  mirrorRotateFeedback(x:number,y:number,now:number){if(this.lastGeometry)this.objects.rotateFeedback(x,y,now,this.lastGeometry);}
  impact(e:ImpactEvent,now:number){this.impacts.triggerImpactEffect(e,now);if((e.type==='mirror'||e.type==='splitter')&&e.x!==undefined&&e.y!==undefined)this.objects.kick(e.x,e.y,now);const count=e.type==='target'?18:e.type==='splitter'?12:e.type==='mirror'?9:e.type==='portal'?9:6;const color=e.type==='target'||e.type==='switch'?Theme.green:e.type==='portal'?Theme.purple:e.type==='mirror'||e.type==='splitter'?Theme.cyan:Theme.beam;this.particles.emit(e.px,e.py,color,count,this.performance.particleBudget);}
  private muzzle(state:GameState){const p=state.result?.segments[0];if(!p)return null;const dx=p.x2-p.x1,dy=p.y2-p.y1,len=Math.hypot(dx,dy)||1;return{x:p.x1+dx/len*18,y:p.y1+dy/len*18,ang:Math.atan2(dy,dx)};}
  shotStart(state:GameState,now:number){const m=this.muzzle(state);if(m)this.particles.emit(m.x,m.y,Theme.beamHot,10,this.performance.particleBudget,{angle:m.ang,spread:2.6,speedMin:.4,speedMax:1.8});this.victoryUntil=0;}
  laserLaunch(state:GameState,now:number){const m=this.muzzle(state);if(!m)return;this.impacts.triggerLaunch(m.x,m.y,now);this.particles.emit(m.x,m.y,Theme.beam,18,this.performance.particleBudget,{angle:m.ang,spread:.9,speedMin:1.8,speedMax:5.6});this.particles.emit(m.x,m.y,0xffffff,10,this.performance.particleBudget,{angle:m.ang,spread:2.4,speedMin:.9,speedMax:2.8});}
  victory(now:number,state:GameState){this.victoryUntil=now+900;const g=computeGeometry(state.level),points=state.targets.map(t=>borderPoint(g,t));this.impacts.triggerVictory(points,now);for(const p of points)this.particles.emit(p.x,p.y,Theme.green,22,this.performance.particleBudget);}
  showToast(text:string,now:number){this.toast.text=text;const pad=20,w=Math.max(180,this.toast.width+pad*2);this.toastBg.clear().roundRect(360-w/2,198,w,40,20).fill({color:0x080c14,alpha:.92}).stroke({color:0xffffff,width:1,alpha:.10});this.toast.visible=true;this.toastBg.visible=true;this.toastUntil=now+1200;}
  update(state:GameState,now:number){this.objects.update(now);this.laser.update(state,now,this.performance.quality);this.impacts.update(now);this.particles.update(this.performance.quality);this.comboActive=this.combo.update(now);this.resultActive=this.result.update(now);if(this.toastUntil&&now>=this.toastUntil){this.toastUntil=0;this.toast.visible=false;this.toastBg.visible=false;}this.victoryWash.clear();if(this.victoryUntil>now){const t=1-(this.victoryUntil-now)/900;this.victoryWash.rect(32,STAGE_TOP,656,STAGE_HEIGHT).fill({color:0x8fffd0,alpha:(1-t)*.055});}}
  resize(viewW:number,viewH:number){const scale=Math.min(viewW/DESIGN_WIDTH,viewH/DESIGN_HEIGHT);this.root.scale.set(scale);this.root.position.set((viewW-DESIGN_WIDTH*scale)/2,(viewH-DESIGN_HEIGHT*scale)/2);}
  get active(){return this.laser.active||this.impacts.active||this.particles.active||this.objects.active||this.toastUntil>0||this.victoryUntil>0||this.comboActive||this.resultActive;}
  destroy(){this.particles.destroy();this.root.destroy({children:true});}
}
