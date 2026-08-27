import { Container, Graphics, Text, type Renderer } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/GameConfig';
import { borderPoint, computeGeometry } from '@/gameplay/geometry';
import type { BoardGeometry, GameState, ImpactEvent } from '@/gameplay/types';
import type { PerformanceManager } from '@/performance/PerformanceManager';
import { BoardLayer } from './layers/BoardLayer';
import { ObjectLayer } from './layers/ObjectLayer';
import { HudLayer } from './layers/HudLayer';
import { LaserEffect } from './effects/LaserEffect';
import { ImpactSystem } from './effects/ImpactSystem';
import { ParticleSystem } from './effects/ParticleSystem';
import { Theme } from './theme';

export class PixiGameView{
  readonly root=new Container();
  private bg=new Graphics();private stageBg=new Graphics();private board=new BoardLayer();private objects=new ObjectLayer();private laser=new LaserEffect();private impacts=new ImpactSystem();private particles:ParticleSystem;private hud=new HudLayer();private toastBg=new Graphics();private toast=new Text({text:'',style:{fontFamily:'Arial',fontSize:18,fontWeight:'700',fill:Theme.text}});private toastUntil=0;private victoryUntil=0;private victoryWash=new Graphics();private currentLevel=-1;private totalLevels:number;private lastGeometry:BoardGeometry|null=null;
  constructor(renderer:Renderer,private readonly performance:PerformanceManager,totalLevels:number){this.totalLevels=totalLevels;this.particles=new ParticleSystem(renderer);this.buildBackground();this.root.addChild(this.bg,this.stageBg,this.board,this.objects,this.laser,this.particles.container,this.impacts,this.victoryWash,this.hud,this.toastBg,this.toast);this.toast.anchor.set(.5);this.toast.position.set(360,220);this.toast.visible=false;this.toastBg.visible=false;}
  private buildBackground(){
    this.bg.rect(0,0,DESIGN_WIDTH,DESIGN_HEIGHT).fill(Theme.bg);
    // The old version's canvas itself was the atmosphere: one calm dark panel, not global rings.
    this.stageBg.roundRect(40,205,640,900,18).fill(Theme.bg1);
    this.stageBg.roundRect(40,205,640,300,18).fill({color:Theme.bg0,alpha:.42});
    this.stageBg.ellipse(360,270,560,250).fill({color:Theme.cyan,alpha:.018});
  }
  setHandlers(h:{rotate:(x:number,y:number)=>void;fire:()=>void;reset:()=>void;next:()=>void}){this.objects.setRotateHandler(h.rotate);this.hud.fireButton.on('pointertap',h.fire);this.hud.resetButton.on('pointertap',h.reset);this.hud.nextButton.on('pointertap',h.next);}
  sync(state:GameState){const g=computeGeometry(state.level);this.lastGeometry=g;if(this.currentLevel!==state.levelIndex){this.currentLevel=state.levelIndex;this.board.rebuild(state.level,g);}this.objects.sync(state,g);this.laser.bind(state);this.hud.sync(state,this.totalLevels);}
  mirrorRotateFeedback(x:number,y:number,now:number){if(this.lastGeometry)this.objects.rotateFeedback(x,y,now,this.lastGeometry);}
  impact(e:ImpactEvent,now:number){this.impacts.triggerImpactEffect(e,now);if((e.type==='mirror'||e.type==='splitter')&&e.x!==undefined&&e.y!==undefined)this.objects.kick(e.x,e.y,now);const count=e.type==='target'?18:e.type==='splitter'?10:e.type==='mirror'?7:e.type==='portal'?9:5;const color=e.type==='target'||e.type==='switch'?Theme.green:e.type==='portal'?Theme.purple:e.type==='mirror'||e.type==='splitter'?Theme.cyan:Theme.beam;this.particles.emit(e.px,e.py,color,count,this.performance.particleBudget);}
  shotStart(state:GameState,now:number){const p=state.result?.segments[0];if(p){this.impacts.triggerLaunch(p.x1,p.y1,now);this.particles.emit(p.x1,p.y1,Theme.beam,10,this.performance.particleBudget);}this.victoryUntil=0;}
  victory(now:number,state:GameState){this.victoryUntil=now+900;const g=computeGeometry(state.level),points=state.targets.map(t=>borderPoint(g,t));this.impacts.triggerVictory(points,now);for(const p of points)this.particles.emit(p.x,p.y,Theme.green,22,this.performance.particleBudget);}
  showToast(text:string,now:number){this.toast.text=text;const pad=20,w=Math.max(180,this.toast.width+pad*2);this.toastBg.clear().roundRect(360-w/2,198,w,40,20).fill({color:0x080c14,alpha:.92}).stroke({color:0xffffff,width:1,alpha:.10});this.toast.visible=true;this.toastBg.visible=true;this.toastUntil=now+1200;}
  update(state:GameState,now:number){this.objects.update(now);this.laser.update(state,now,this.performance.quality);this.impacts.update(now);this.particles.update(this.performance.quality);if(this.toastUntil&&now>=this.toastUntil){this.toastUntil=0;this.toast.visible=false;this.toastBg.visible=false;}this.victoryWash.clear();if(this.victoryUntil>now){const t=1-(this.victoryUntil-now)/900;this.victoryWash.rect(40,205,640,900).fill({color:0x8fffd0,alpha:(1-t)*.055});}}
  resize(viewW:number,viewH:number){const scale=Math.min(viewW/DESIGN_WIDTH,viewH/DESIGN_HEIGHT);this.root.scale.set(scale);this.root.position.set((viewW-DESIGN_WIDTH*scale)/2,(viewH-DESIGN_HEIGHT*scale)/2);}
  get active(){return this.laser.active||this.impacts.active||this.particles.active||this.objects.active||this.toastUntil>0||this.victoryUntil>0;}
  destroy(){this.particles.destroy();this.root.destroy({children:true});}
}
