import { Container, Graphics, Rectangle, Text, Texture, type Renderer } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, STAGE_HEIGHT, STAGE_TOP } from '@/config/GameConfig';
import { portMuzzle, portPosition, cellCenter, computeGeometry } from '@/gameplay/geometry';
import { levelEmitters } from '@/gameplay/levelAccess';
import type { BoardGeometry, Direction, GameState, ImpactEvent, LevelDefinition, Port } from '@/gameplay/types';
import type { PerformanceManager } from '@/performance/PerformanceManager';
import { BoardLayer } from './layers/BoardLayer';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { ObjectLayer } from './layers/ObjectLayer';
import { HudLayer } from './layers/HudLayer';
import { TimeSkillLayer } from './layers/TimeSkillLayer';
import { ComboLayer } from './layers/ComboLayer';
import { CoinLayer } from './layers/CoinLayer';
import { ResultLayer, type ResultKind } from './layers/ResultLayer';
import { SettingsLayer } from './layers/SettingsLayer';
import { LevelSelectLayer } from './layers/LevelSelectLayer';
import { PreviewPosterLayer, type PosterMeta } from './layers/PreviewPosterLayer';
import { LaserEffect } from './effects/LaserEffect';
import { ImpactSystem } from './effects/ImpactSystem';
import { ParticleSystem } from './effects/ParticleSystem';
import { WinConfetti } from './effects/WinConfetti';
import { Theme, activeLaserColorId, type LaserColorId, type ThemeId, uiText } from './theme';
import type { UiAssetKey } from './ui/assets';
import type { TutorialStep } from '@/gameplay/tutorial';
import { TutorialLayer } from './layers/TutorialLayer';

export type ViewHandlers = {
  bulletTime?:()=>void;
  rotate:(x:number,y:number)=>void;
  firePressStart:()=>void;
  firePressEnd:()=>void;
  reset:()=>void;
  openSettings:()=>void;
  toggleAudio:()=>void;
  toggleHaptics:()=>void;
  selectTheme:(id:ThemeId)=>void;
  selectLaserColor?:(id:LaserColorId)=>void;
  closeSettings:()=>void;
  openLevels:()=>void;
  selectLevel:(index:number)=>void;
  canSelectLevel:(index:number)=>boolean;
  unlockAllLevels:()=>void;
  clearHistory:()=>void;
  uiChanged:()=>void;
  resultPrimary:()=>void;
  resultSecondary:()=>void;
  resultPreview:()=>void;
  resultLevels:()=>void;
  closePoster:()=>void;
  savePoster:()=>void;
  coinSound:()=>void;
  tutorialNext?:()=>void;
  tutorialSkip?:()=>void;
  tutorialTap?:()=>void;
  replayTutorial?:()=>void;
};

export class PixiGameView{
  private timeSkills=new TimeSkillLayer();
  readonly root=new Container();
  private readonly tutorial=new TutorialLayer();
  private tutorialAvailable=false;
  private tutorialShotHidden=false;
  private canSelectLevel:(index:number)=>boolean=()=>false;
  private bg=new BackgroundLayer();private stageBg=new Graphics();private board=new BoardLayer();private objects=new ObjectLayer();private laser:LaserEffect;private impacts=new ImpactSystem();private particles:ParticleSystem;private confetti=new WinConfetti();private hud=new HudLayer();private combo=new ComboLayer();readonly coins=new CoinLayer();readonly result=new ResultLayer();readonly poster=new PreviewPosterLayer();readonly settings:SettingsLayer;readonly levelSelect:LevelSelectLayer;private toastBg=new Graphics();private toast=new Text({text:'',style:uiText({fontSize:18,fill:Theme.text})});private toastUntil=0;private victoryUntil=0;private victoryWash=new Graphics();private currentLevel=-1;private lastGeometry:BoardGeometry|null=null;private comboActive=false;private resultActive=false;private posterActive=false;private coinsActive=false;private confettiActive=false;private hudOffset=0;
  constructor(private readonly renderer:Renderer,private readonly performance:PerformanceManager,themeId:ThemeId,levels:readonly LevelDefinition[],gpuLaser=true){this.laser=new LaserEffect(renderer,gpuLaser);this.particles=new ParticleSystem(renderer);this.settings=new SettingsLayer(themeId);this.levelSelect=new LevelSelectLayer(levels);this.buildBackground();this.root.addChild(this.bg,this.stageBg,this.board,this.objects,this.laser,this.particles.container,this.impacts,this.objects.captions,this.victoryWash,this.hud,this.tutorial,this.timeSkills,this.combo,this.result,this.confetti,this.coins,this.poster,this.toastBg,this.toast,this.levelSelect,this.settings);this.toast.anchor.set(.5);this.toast.position.set(360,220);this.toast.visible=false;this.toastBg.visible=false;}
  private targetPorts:Port[]=[];
  private inputCharge:number|null=null;
  private buildBackground(){
    this.victoryWash.rect(0,STAGE_TOP,DESIGN_WIDTH,STAGE_HEIGHT).fill({color:Theme.victoryWash,alpha:1});
    this.victoryWash.alpha=0;
    this.victoryWash.visible=false;
  }
  setHandlers(h:ViewHandlers){
    this.canSelectLevel=h.canSelectLevel;
    this.syncLevelNavigation();
    this.tutorial.nextButton.on('pointertap',()=>h.tutorialNext?.());
    this.tutorial.skipButton.on('pointertap',()=>h.tutorialSkip?.());
    this.tutorial.setTapHandler(()=>h.tutorialTap?.());
    this.tutorial.setPressHandlers(h.firePressStart,h.firePressEnd);
    this.settings.tutorialButton.on('pointertap',()=>h.replayTutorial?.());
    this.timeSkills.bullet.on('pointertap',()=>h.bulletTime?.());
    this.objects.setRotateHandler(h.rotate);
    this.hud.fireButton.on('pointerdown',h.firePressStart);
    this.hud.fireButton.on('pointerup',h.firePressEnd);
    this.hud.fireButton.on('pointerupoutside',h.firePressEnd);
    this.hud.fireButton.on('pointercancel',h.firePressEnd);
    this.hud.settingsButton.on('pointertap',h.openSettings);
    this.hud.levelButton.on('pointertap',h.openLevels);
    this.hud.previousLevel.on('pointertap',event=>{event.stopPropagation();h.selectLevel(this.currentLevel-1);});
    this.hud.nextLevel.on('pointertap',event=>{event.stopPropagation();h.selectLevel(this.currentLevel+1);});
    this.hud.guideButton.on('pointertap',()=>h.replayTutorial?.());
    this.settings.closeButton.on('pointertap',h.closeSettings);
    this.settings.setCloseHandler(h.closeSettings);
    this.settings.setChangeHandler(h.uiChanged);
    this.settings.audioButton.on('pointertap',h.toggleAudio);
    this.settings.hapticsButton.on('pointertap',h.toggleHaptics);
    this.settings.setThemeHandler(h.selectTheme);
    this.settings.setLaserColorHandler(id=>h.selectLaserColor?.(id));
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
    this.result.preview.on('pointertap',h.resultPreview);
    this.result.levels.on('pointertap',h.resultLevels);
    this.poster.closeButton.on('pointertap',h.closePoster);
    this.poster.saveButton.on('pointertap',h.savePoster);
    this.coins.setHandlers({
      onSound:h.coinSound,
      onLaunch:()=>this.result.hideRewardCoin(),
      onComplete:now=>this.result.restoreRewardCoin(now),
    });
  }
  setUiTexture(key:UiAssetKey, texture:Texture){
    if(key==='background'){
      this.bg.setTexture(texture);
      this.levelSelect.setBackgroundTexture(texture);
    }
    if(key==='finger') this.tutorial.setFingerTexture(texture);
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
  sync(state:GameState){this.targetPorts=state.level.targets;const g=computeGeometry(state.level);this.lastGeometry=g;if(this.currentLevel!==state.levelIndex){this.currentLevel=state.levelIndex;this.board.rebuild(state.level,g);this.hideOverlays();}if(!state.result&&!state.firing){this.particles.clear();this.impacts.clear();}this.objects.sync(state,g);this.laser.bind(state,g.cell);this.hud.sync(state);this.syncLevelNavigation();this.timeSkills.sync(state);this.tutorialShotHidden=state.firing||state.won;this.syncTutorialVisibility();}
  private syncLevelNavigation(){
    this.hud.setLevelNavigation(this.canSelectLevel(this.currentLevel-1),this.canSelectLevel(this.currentLevel+1));
  }
  setTutorial(step:TutorialStep|null,state:GameState,progress:{current:number;total:number}){
    this.tutorialAvailable=!!step;
    this.tutorialShotHidden=state.firing||state.won;
    this.tutorial.show(step,state.level,progress);
    this.syncTutorialVisibility();
  }
  private syncTutorialVisibility(){
    this.tutorial.visible=this.tutorialAvailable&&!this.tutorialShotHidden&&!this.settings.visible&&!this.levelSelect.visible&&!this.result.visible&&!this.poster.visible;
  }
  rotateItem(x:number,y:number,s:0|1,dir?:Direction){this.objects.rotateItem(x,y,s,dir);}
  hideOverlays(){this.result.hide();this.poster.hide();this.settings.hide();this.levelSelect.hide();this.combo.clear();this.confetti.clear();this.coins.hide();this.hud.setHeartsVisible(true);this.syncTutorialVisibility();}
  showLevelSelectFromWin(currentIndex:number,completed:ReadonlySet<number>,allLevelsUnlocked=false,unlockedThrough=-1){
    this.result.hide();this.poster.hide();this.confetti.clear();this.coins.hide();this.hud.setHeartsVisible(true);
    this.levelSelect.show(currentIndex,completed,allLevelsUnlocked,unlockedThrough);this.syncTutorialVisibility();
  }
  showWinPreview(meta:PosterMeta,now:number){
    const texture=this.captureBoardTexture();
    if(!texture) return false;
    this.poster.show(texture,meta,now);this.syncTutorialVisibility();
    return true;
  }
  exportPosterCanvas(){
    if(!this.poster.visible) return null;
    const card=this.poster.exportTarget();
    const close=this.poster.closeButton;
    const sx=card.scale.x,sy=card.scale.y,alpha=card.alpha;
    const closeVisible=close.visible;
    card.scale.set(1);
    card.alpha=1;
    close.visible=false;
    try{
      return this.withDesignSpace(()=>this.renderer.extract.canvas({
        target:card,
        resolution:Math.min(2,this.renderer.resolution||1),
        clearColor:Theme.bg,
        antialias:true,
      }));
    }catch(error){
      console.warn('[preview] export failed',error);
      return null;
    }finally{
      card.scale.set(sx,sy);
      card.alpha=alpha;
      close.visible=closeVisible;
    }
  }
  private captureBoardTexture(){
    const hide=[
      this.tutorial,
      this.hud,this.combo,this.toast,this.toastBg,this.result,this.confetti,this.coins,
      this.levelSelect,this.settings,this.poster,this.victoryWash,this.particles.container,this.impacts,
    ];
    const vis=hide.map(node=>node.visible);
    for(const node of hide) node.visible=false;
    try{
      const texture=this.withDesignSpace(()=>this.renderer.extract.texture({
        target:this.root,
        frame:new Rectangle(0,STAGE_TOP,DESIGN_WIDTH,STAGE_HEIGHT),
        resolution:Math.min(2,this.renderer.resolution||1),
        clearColor:Theme.bg1,
        antialias:true,
      }));
      if(!texture||texture.width<2||texture.height<2){
        texture?.destroy(true);
        return null;
      }
      return texture;
    }catch(error){
      console.warn('[preview] capture failed',error);
      return null;
    }finally{
      hide.forEach((node,i)=>node.visible=vis[i]);
    }
  }
  private withDesignSpace<T>(fn:()=>T):T{
    const x=this.root.x,y=this.root.y,sx=this.root.scale.x,sy=this.root.scale.y;
    this.root.position.set(0,0);
    this.root.scale.set(1);
    try{return fn();}
    finally{
      this.root.position.set(x,y);
      this.root.scale.set(sx,sy);
    }
  }
  showSettings(audioEnabled:boolean,hapticsEnabled:boolean,themeId:ThemeId,laserColorId:LaserColorId=activeLaserColorId){this.settings.show(audioEnabled,hapticsEnabled,themeId,laserColorId);this.syncTutorialVisibility();}
  setAudioEnabled(enabled:boolean){this.settings.setAudioEnabled(enabled);}
  setHapticsEnabled(enabled:boolean){this.settings.setHapticsEnabled(enabled);}
  setFireCharge(progress:number|null,now=0){this.inputCharge=progress;this.hud.setFireCharge(progress,now);this.objects.setInputCharge(progress);}
  closeSettings(){this.settings.hide();this.syncTutorialVisibility();}
  showLevelSelect(currentIndex:number,completed:ReadonlySet<number>,allLevelsUnlocked=false,unlockedThrough=-1){this.levelSelect.show(currentIndex,completed,allLevelsUnlocked,unlockedThrough);this.syncTutorialVisibility();}
  showResult(kind:ResultKind, copy:{title:string;subtitle:string;tip:string;primary:string;secondary?:string;reward?:number}, now:number){this.result.show(kind,copy,now);this.syncTutorialVisibility();}
  startWinCoins(now:number, balance:number, reward:number){
    this.coins.show(now, balance);
    if(reward>0) this.coins.spawn(now, reward, () => this.result.rewardCoinPoint());
  }
  revealWinCoins(){this.hud.setHeartsVisible(false);}
  settleCoins(){const leftover=this.coins.settle();this.result.restoreRewardCoin();return leftover;}
  showCombo(count:number, now:number){this.combo.show(count,now);}
  mirrorRotateFeedback(x:number,y:number,now:number){if(this.lastGeometry)this.objects.rotateFeedback(x,y,now,this.lastGeometry);}
  private emitScale(){return this.performance.quality==='high'?1:this.performance.quality==='medium'?.65:.4;}
  private directionAngle(direction:Direction){return direction*Math.PI/2;}
  impact(e:ImpactEvent,now:number){
    // Receiver flashes land on the external lens, using the simulation's event time.
    if(e.type==='target'&&e.targetIndex!==undefined&&this.lastGeometry&&this.targetPorts[e.targetIndex]){
      const point=portPosition(this.lastGeometry,this.targetPorts[e.targetIndex]);e={...e,px:point.x,py:point.y};
    }
    try{
      const feedbackColor=e.type==='portal'||e.type==='portal-exit'?this.objects.portalColor(e.pair??''):e.type==='focus'?this.objects.focusColor(e.x,e.y):undefined;
      this.impacts.triggerImpactEffect(e,now,feedbackColor);
      if(e.type==='combiner-fire'){
        if(e.x!==undefined&&e.y!==undefined)this.objects.kick(e.x,e.y,now);
        const angle=this.directionAngle(e.outgoingDirs?.[0]??0);
        this.particles.emit(e.px,e.py,Theme.beamHot,Math.round(22*this.emitScale()),this.performance.particleBudget,
          {angle,spread:.8,speedMin:2.4,speedMax:6.5,shape:'spark',stretch:1.7});
        return;
      }
      if((e.type==='mirror'||e.type==='splitter'||e.type==='focus'||e.type==='combiner')&&e.x!==undefined&&e.y!==undefined)this.objects.kick(e.x,e.y,now);
      const count=Math.max(2,Math.round((e.type==='target'||e.type==='focus'?16:e.type==='splitter'||e.type==='combiner'?12:e.type==='mirror'?10:e.type==='portal'?10:7)*this.emitScale()));
      const color=feedbackColor??(e.type==='target'||e.type==='switch'||e.type==='door-open'?Theme.green:e.type==='combiner'||e.type==='splitter'?Theme.cyan:e.type==='mirror'?Theme.beamHot:Theme.beam);
      const budget=this.performance.particleBudget;
      if(e.type==='portal'||e.type==='portal-exit'){
        this.objects.portalImpact(e,now);
        const exiting=e.type==='portal-exit';
        const angle=this.directionAngle(e.incomingDir??0)+(exiting?0:Math.PI);
        this.particles.emit(e.px,e.py,color,Math.ceil((exiting?8:5)*this.emitScale()),budget,
          {angle,spread:exiting?.75:1.4,speedMin:exiting?1.8:.6,speedMax:exiting?4.5:2.2,shape:'spark',stretch:exiting?1.4:.8});
        return;
      }
      if((e.type==='mirror'||e.type==='splitter')&&e.outgoingDirs?.length){
        const each=Math.max(2,Math.ceil(count/e.outgoingDirs.length));
        for(const direction of e.outgoingDirs){
          this.particles.emit(e.px,e.py,color,each,budget,{angle:this.directionAngle(direction),spread:e.type==='splitter'?.9:1.18,speedMin:1.2,speedMax:4.8,shape:'mixed',stretch:1.35});
        }
        return;
      }
      if(e.incomingDir!==undefined){
        this.particles.emit(e.px,e.py,color,count,budget,{angle:this.directionAngle(e.incomingDir)+Math.PI,spread:1.65,speedMin:.8,speedMax:3.8,shape:'mixed',stretch:1.1});
        return;
      }
      this.particles.emit(e.px,e.py,color,count,budget);
    }catch(error){console.warn('[view] impact failed',error);}
  }
  private muzzles(state:GameState){
    if(!this.lastGeometry)return[];
    return levelEmitters(state.level).map(port=>{
      const p=portMuzzle(this.lastGeometry!,port),ang={W:0,E:Math.PI,N:Math.PI/2,S:-Math.PI/2}[port.side];
      return{x:p.x,y:p.y,ang};
    });
  }

  shotStart(state:GameState,now:number){
    try{
      for(const m of this.muzzles(state)){
        this.particles.emit(m.x,m.y,Theme.beamHot,Math.round(9*this.emitScale()),this.performance.particleBudget,{angle:m.ang,spread:2.6,speedMin:.4,speedMax:1.8,shape:'dot'});
      }
    }catch(error){console.warn('[view] shotStart failed',error);}
    this.victoryUntil=0;this.victoryWash.visible=false;this.victoryWash.alpha=0;
  }
  laserLaunch(state:GameState,now:number){
    try{
      const muzzles=this.muzzles(state);if(!muzzles.length)return;
      const scale=this.emitScale();
      for(const m of muzzles){
        this.impacts.triggerLaunch(m.x,m.y,now);
        this.particles.emit(m.x,m.y,Theme.beam,Math.round(15*scale),this.performance.particleBudget,{angle:m.ang,spread:.86,speedMin:1.8,speedMax:5.8,shape:'spark',stretch:1.45});
        this.particles.emit(m.x,m.y,Theme.white,Math.round(8*scale),this.performance.particleBudget,{angle:m.ang,spread:2.25,speedMin:.8,speedMax:2.8,shape:'dot'});
      }
    }catch(error){console.warn('[view] laserLaunch failed',error);}
  }
  victory(now:number,state:GameState){this.victoryUntil=now+900;this.confetti.start(now);const g=computeGeometry(state.level);const points=[...state.targets.map(t=>portPosition(g,t)),...state.items.filter(item=>item.type==='focus').map(item=>cellCenter(g,item.x,item.y))];this.impacts.triggerVictory(points,now);for(const p of points)this.particles.emit(p.x,p.y,Theme.green,Math.round(22*this.emitScale()),this.performance.particleBudget);}
  showToast(text:string,now:number){this.toast.text=text;const pad=20,w=Math.max(180,this.toast.width+pad*2),y=230+this.hudOffset;this.toast.position.set(360,y+22);this.toastBg.clear().roundRect(360-w/2,y,w,40,20).fill({color:Theme.overlay,alpha:.96}).stroke({color:Theme.white,width:1,alpha:.10});this.toast.visible=true;this.toastBg.visible=true;this.toastUntil=now+1200;}
  update(state:GameState,now:number){
    this.tutorialShotHidden=state.firing||state.won;
    this.syncTutorialVisibility();
    this.tutorial.update(now);
    this.objects.update(now,!this.settings.visible&&!this.levelSelect.visible&&!this.result.visible&&!this.poster.visible);
    try{this.laser.update(state,now,this.performance.quality,this.inputCharge);}catch(error){console.warn('[view] laser update failed',error);}
    this.impacts.update(now);
    try{this.particles.update(this.performance.quality);}catch(error){console.warn('[view] particles failed',error);}
    this.levelSelect.update(now);
    this.comboActive=this.combo.update(now,this.performance.quality);
    this.resultActive=this.result.update(now);
    this.posterActive=this.poster.update(now);
    this.confettiActive=this.confetti.update(now,this.performance.quality);
    this.coinsActive=this.coins.update(now);
    if(this.toastUntil&&now>=this.toastUntil){this.toastUntil=0;this.toast.visible=false;this.toastBg.visible=false;}
    if(this.victoryUntil>now){const t=1-(this.victoryUntil-now)/900;this.victoryWash.visible=true;this.victoryWash.alpha=(1-t)*.055;}
    else if(this.victoryUntil){this.victoryUntil=0;this.victoryWash.visible=false;this.victoryWash.alpha=0;}
  }
  resize(viewW:number,viewH:number,safeTopPx=0){
    // Bias tall screens upward so the masthead shares the native menu-button row.
    // The wider design still fits short screens without clipping.
    const safeTop=safeTopPx>0?safeTopPx+8:0;
    const scale=Math.min(viewW/DESIGN_WIDTH,viewH/DESIGN_HEIGHT,(viewH-safeTop)/(DESIGN_HEIGHT-40));
    this.root.scale.set(scale);
    const verticalSlack=Math.max(0,viewH-DESIGN_HEIGHT*scale);
    const chromeAlignedY=safeTopPx>0?safeTop-80*scale:0;
    const rootY=Math.max(verticalSlack*.25,chromeAlignedY);
    this.root.position.set((viewW-DESIGN_WIDTH*scale)/2,rootY);
    const bounds=new Rectangle(-this.root.x/scale,-rootY/scale,viewW/scale,viewH/scale);
    this.bg.setViewport(bounds);
    this.levelSelect.setViewport(bounds);
    this.settings.setViewport(bounds);
    this.result.setViewport(bounds);
    this.poster.setViewport(bounds);
    this.tutorial.setViewport(bounds);
    const extra=0;
    this.hudOffset=extra;
    this.tutorial.setTopOffset(extra);
    this.hud.setTopOffset(extra);
    this.levelSelect.setTopOffset(extra);
    this.coins.setTopOffset(extra);
    this.combo.setTopOffset(extra);
    this.poster.setTopOffset(extra);
    this.toast.position.set(360,252+extra);
  }
  get active(){return this.hud.active||this.tutorial.active||this.laser.active||this.impacts.active||this.particles.active||this.objects.active||this.levelSelect.active||this.toastUntil>0||this.victoryUntil>0||this.comboActive||this.resultActive||this.posterActive||this.confettiActive||this.coinsActive;}
  destroy(){this.poster.hide();this.particles.destroy();this.root.destroy({children:true});}
}
