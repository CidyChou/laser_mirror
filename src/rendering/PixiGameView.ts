import { Container, Graphics, Text, Texture, type Renderer } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, STAGE_HEIGHT, STAGE_TOP, UI_RECTS } from '@/config/GameConfig';
import { beamScale, borderPoint, computeGeometry } from '@/gameplay/geometry';
import type { BoardGeometry, GameState, ImpactEvent, LevelDefinition } from '@/gameplay/types';
import type { PerformanceManager } from '@/performance/PerformanceManager';
import { BoardLayer } from './layers/BoardLayer';
import { ObjectLayer } from './layers/ObjectLayer';
import { HudLayer } from './layers/HudLayer';
import { ComboLayer } from './layers/ComboLayer';
import { CoinLayer } from './layers/CoinLayer';
import { ResultLayer, type ResultKind } from './layers/ResultLayer';
import { SettingsLayer } from './layers/SettingsLayer';
import { LevelSelectLayer } from './layers/LevelSelectLayer';
import { LaserEffect } from './effects/LaserEffect';
import { ImpactSystem } from './effects/ImpactSystem';
import { ParticleSystem } from './effects/ParticleSystem';
import { WinConfetti } from './effects/WinConfetti';
import { Theme, type ThemeId, uiText } from './theme';
import type { UiAssetKey } from './ui/assets';

export class PixiGameView{
  readonly root=new Container();
  private bg=new Graphics();private stageBg=new Graphics();private board=new BoardLayer();private objects=new ObjectLayer();private laser=new LaserEffect();private impacts=new ImpactSystem();private particles:ParticleSystem;private confetti=new WinConfetti();private hud=new HudLayer();private combo=new ComboLayer();readonly coins=new CoinLayer();readonly result=new ResultLayer();readonly settings:SettingsLayer;readonly levelSelect:LevelSelectLayer;private toastBg=new Graphics();private toast=new Text({text:'',style:uiText({fontSize:18,fill:Theme.text})});private toastUntil=0;private victoryUntil=0;private victoryWash=new Graphics();private currentLevel=-1;private lastGeometry:BoardGeometry|null=null;private comboActive=false;private resultActive=false;private coinsActive=false;private confettiActive=false;private hudOffset=0;
  constructor(renderer:Renderer,private readonly performance:PerformanceManager,themeId:ThemeId,levels:readonly LevelDefinition[]){this.particles=new ParticleSystem(renderer);this.settings=new SettingsLayer(themeId);this.levelSelect=new LevelSelectLayer(levels);this.buildBackground();this.root.addChild(this.bg,this.stageBg,this.board,this.objects,this.laser,this.particles.container,this.impacts,this.victoryWash,this.hud,this.combo,this.toastBg,this.toast,this.result,this.confetti,this.coins,this.levelSelect,this.settings);this.toast.anchor.set(.5);this.toast.position.set(360,220);this.toast.visible=false;this.toastBg.visible=false;}
  private buildBackground(){
    this.bg.rect(0,0,DESIGN_WIDTH,DESIGN_HEIGHT).fill(Theme.bg);
    // Broad ambient fields create depth without competing with the laser.
    this.bg.ellipse(42,220,440,360).fill({color:Theme.beam,alpha:.022});
    this.bg.ellipse(680,1010,520,460).fill({color:Theme.cyan,alpha:.018});
    this.victoryWash.rect(32,STAGE_TOP,656,STAGE_HEIGHT).fill({color:Theme.victoryWash,alpha:1});
    this.victoryWash.alpha=0;
    this.victoryWash.visible=false;
    this.stageBg.roundRect(36,STAGE_TOP+12,648,STAGE_HEIGHT,22).fill({color:Theme.shadow,alpha:.28});
    this.stageBg.roundRect(32,STAGE_TOP,656,STAGE_HEIGHT,22).fill(Theme.bg1).stroke({color:Theme.surfaceLine,width:1.5,alpha:.28});
    this.stageBg.roundRect(32,STAGE_TOP,656,280,22).fill({color:Theme.bg0,alpha:.42});
    this.stageBg.ellipse(360,STAGE_TOP+70,520,220).fill({color:Theme.cyan,alpha:.024});
    this.stageBg.moveTo(164,STAGE_TOP+1).lineTo(556,STAGE_TOP+1).stroke({color:Theme.cyan,width:2,alpha:.12,cap:'round'});
  }
  setHandlers(h:{rotate:(x:number,y:number)=>void;fire:()=>void;reset:()=>void;openSettings:()=>void;toggleAudio:()=>void;toggleHaptics:()=>void;selectTheme:(id:ThemeId)=>void;closeSettings:()=>void;openLevels:()=>void;selectLevel:(index:number)=>void;unlockAllLevels:()=>void;clearHistory:()=>void;uiChanged:()=>void;resultPrimary:()=>void;resultSecondary:()=>void;coinSound:()=>void}){
    this.objects.setRotateHandler(h.rotate);
    this.hud.fireButton.on('pointertap',h.fire);
    this.hud.settingsButton.on('pointertap',h.openSettings);
    this.hud.levelButton.on('pointertap',h.openLevels);
    this.settings.closeButton.on('pointertap',h.closeSettings);
    this.settings.setCloseHandler(h.closeSettings);
    this.settings.setChangeHandler(h.uiChanged);
    this.settings.audioButton.on('pointertap',h.toggleAudio);
    this.settings.hapticsButton.on('pointertap',h.toggleHaptics);
    this.settings.setThemeHandler(h.selectTheme);
    this.settings.restartButton.on('pointertap',()=>{h.closeSettings();h.reset();});
    this.settings.levelSelectButton.on('pointertap',()=>{h.closeSettings();h.openLevels();});
    this.settings.clearHistoryButton.on('pointertap',()=>this.settings.showClearConfirmation());
    this.settings.cancelClearButton.on('pointertap',()=>this.settings.hideClearConfirmation());
    this.settings.confirmClearButton.on('pointertap',h.clearHistory);
    this.levelSelect.settingsButton.on('pointertap',h.openSettings);
    this.levelSelect.setSelectHandler(h.selectLevel);
    this.levelSelect.setUnlockAllHandler(h.unlockAllLevels);
    this.levelSelect.on('scrollchange',h.uiChanged);
    this.result.primary.on('pointertap',h.resultPrimary);
    this.result.secondary.on('pointertap',h.resultSecondary);
    this.coins.setHandlers({onSound:h.coinSound});
  }
  setUiTexture(key:UiAssetKey, texture:Texture){
    if(key==='settings'){
      this.hud.setGearTexture(texture);
      this.levelSelect.setGearTexture(texture);
    }
    if(key==='crown') this.result.setCrownTexture(texture);
    if(key==='coin'){
      this.result.setCoinTexture(texture);
      this.coins.setCoinTexture(texture);
    }
  }
  sync(state:GameState){const g=computeGeometry(state.level);this.lastGeometry=g;if(this.currentLevel!==state.levelIndex){this.currentLevel=state.levelIndex;this.board.rebuild(state.level,g);this.hideOverlays();}this.objects.sync(state,g);this.laser.bind(state,g.cell);this.hud.sync(state);}
  rotateItem(x:number,y:number,s:0|1){this.objects.rotateItem(x,y,s);}
  hideOverlays(){this.result.hide();this.settings.hide();this.levelSelect.hide();this.combo.clear();this.confetti.clear();this.coins.hide();this.hud.setHeartsVisible(true);}
  showSettings(audioEnabled:boolean,hapticsEnabled:boolean,themeId:ThemeId){this.settings.show(audioEnabled,hapticsEnabled,themeId);}
  setAudioEnabled(enabled:boolean){this.settings.setAudioEnabled(enabled);}
  setHapticsEnabled(enabled:boolean){this.settings.setHapticsEnabled(enabled);}
  closeSettings(){this.settings.hide();}
  showLevelSelect(currentIndex:number,completed:ReadonlySet<number>,allLevelsUnlocked=false){this.levelSelect.show(currentIndex,completed,allLevelsUnlocked);}
  showResult(kind:ResultKind, copy:{title:string;subtitle:string;tip:string;primary:string;secondary?:string;reward?:number}, now:number){this.result.show(kind,copy,now);}
  startWinCoins(now:number, balance:number, reward:number){
    this.coins.show(now, balance);
    if(reward>0) this.coins.spawn(now, reward, () => this.result.rewardCoinPoint());
  }
  revealWinCoins(){this.hud.setHeartsVisible(false);}
  settleCoins(){return this.coins.settle();}
  showCombo(count:number, now:number){this.combo.show(count,now);}
  mirrorRotateFeedback(x:number,y:number,now:number){if(this.lastGeometry)this.objects.rotateFeedback(x,y,now,this.lastGeometry);}
  private emitScale(){return this.performance.quality==='low'?0.55:1;}
  impact(e:ImpactEvent,now:number){this.impacts.triggerImpactEffect(e,now);if((e.type==='mirror'||e.type==='splitter')&&e.x!==undefined&&e.y!==undefined)this.objects.kick(e.x,e.y,now);const count=Math.round((e.type==='target'?18:e.type==='splitter'?12:e.type==='mirror'?9:e.type==='portal'?9:6)*this.emitScale());const color=e.type==='target'||e.type==='switch'?Theme.green:e.type==='portal'?Theme.purple:e.type==='mirror'||e.type==='splitter'?Theme.cyan:Theme.beam;this.particles.emit(e.px,e.py,color,count,this.performance.particleBudget);}
  private muzzle(state:GameState){const p=state.result?.segments[0];if(!p)return null;const dx=p.x2-p.x1,dy=p.y2-p.y1,len=Math.hypot(dx,dy)||1;const s=this.lastGeometry?beamScale(this.lastGeometry.cell):1;return{x:p.x1+dx/len*18*s,y:p.y1+dy/len*18*s,ang:Math.atan2(dy,dx)};}
  shotStart(state:GameState,now:number){const m=this.muzzle(state);if(m)this.particles.emit(m.x,m.y,Theme.beamHot,Math.round(10*this.emitScale()),this.performance.particleBudget,{angle:m.ang,spread:2.6,speedMin:.4,speedMax:1.8});this.victoryUntil=0;this.victoryWash.visible=false;this.victoryWash.alpha=0;}
  laserLaunch(state:GameState,now:number){const m=this.muzzle(state);if(!m)return;this.impacts.triggerLaunch(m.x,m.y,now);const scale=this.emitScale();this.particles.emit(m.x,m.y,Theme.beam,Math.round(18*scale),this.performance.particleBudget,{angle:m.ang,spread:.9,speedMin:1.8,speedMax:5.6});this.particles.emit(m.x,m.y,Theme.white,Math.round(10*scale),this.performance.particleBudget,{angle:m.ang,spread:2.4,speedMin:.9,speedMax:2.8});}
  victory(now:number,state:GameState){this.victoryUntil=now+900;this.confetti.start(now);const g=computeGeometry(state.level),points=state.targets.map(t=>borderPoint(g,t));this.impacts.triggerVictory(points,now);for(const p of points)this.particles.emit(p.x,p.y,Theme.green,Math.round(22*this.emitScale()),this.performance.particleBudget);}
  showToast(text:string,now:number){this.toast.text=text;const pad=20,w=Math.max(180,this.toast.width+pad*2),y=198+this.hudOffset;this.toast.position.set(360,y+22);this.toastBg.clear().roundRect(360-w/2,y,w,40,20).fill({color:Theme.overlay,alpha:.92}).stroke({color:Theme.white,width:1,alpha:.10});this.toast.visible=true;this.toastBg.visible=true;this.toastUntil=now+1200;}
  update(state:GameState,now:number){this.objects.update(now);this.laser.update(state,now,this.performance.quality);this.impacts.update(now);this.particles.update(this.performance.quality);this.comboActive=this.combo.update(now,this.performance.quality);this.resultActive=this.result.update(now);this.confettiActive=this.confetti.update(now,this.performance.quality);this.coinsActive=this.coins.update(now);if(this.toastUntil&&now>=this.toastUntil){this.toastUntil=0;this.toast.visible=false;this.toastBg.visible=false;}if(this.victoryUntil>now){const t=1-(this.victoryUntil-now)/900;this.victoryWash.visible=true;this.victoryWash.alpha=(1-t)*.055;}else if(this.victoryUntil){this.victoryUntil=0;this.victoryWash.visible=false;this.victoryWash.alpha=0;}}
  resize(viewW:number,viewH:number,safeTopPx=0){
    const scale=Math.min(viewW/DESIGN_WIDTH,viewH/DESIGN_HEIGHT);
    this.root.scale.set(scale);
    const rootY=(viewH-DESIGN_HEIGHT*scale)/2;
    this.root.position.set((viewW-DESIGN_WIDTH*scale)/2,rootY);
    const designSafe=(safeTopPx-rootY)/scale;
    const extra=Math.max(0,Math.ceil(designSafe-UI_RECTS.settings.y+18));
    this.hudOffset=extra;
    this.hud.setTopOffset(extra);
    this.levelSelect.setTopOffset(extra);
    this.coins.setTopOffset(extra);
    this.combo.setTopOffset(extra);
    this.toast.position.set(360,220+extra);
  }
  get active(){return this.laser.active||this.impacts.active||this.particles.active||this.objects.active||this.levelSelect.active||this.toastUntil>0||this.victoryUntil>0||this.comboActive||this.resultActive||this.confettiActive||this.coinsActive;}
  destroy(){this.particles.destroy();this.root.destroy({children:true});}
}
