import { Application } from 'pixi.js';
import { AudioManager } from '@/audio/AudioManager';
import { GameConfig } from '@/config/GameConfig';
import { nowMs } from '@/core/clock';
import { loadCoins, saveCoins, winReward } from '@/economy/wallet';
import { AD_HEART_REWARD, loadHearts, MAX_HEARTS, saveHearts } from '@/economy/hearts';
import { GameSession } from '@/gameplay/GameSession';
import type { LevelDefinition } from '@/gameplay/types';
import { LevelRepository } from '@/levels/LevelRepository';
import { PerformanceManager } from '@/performance/PerformanceManager';
import type { IPlatform } from '@/platform/IPlatform';
import { PixiGameView } from '@/rendering/PixiGameView';
import {
  clearLevelProgress,
  firstIncompleteLevel,
  isLevelUnlocked,
  loadAllLevelsUnlocked,
  loadCompletedLevels,
  loadCurrentLevel,
  saveAllLevelsUnlocked,
  saveCompletedLevels,
  saveCurrentLevel,
} from '@/progression/levelProgress';
import { loadUiAssets, uiTexture } from '@/rendering/ui/assets';
import {
  DEFAULT_THEME_ID,
  Theme,
  activeThemeId,
  applyThemeToDocument,
  normalizeThemeId,
  setActiveTheme,
  themeById,
  type ThemeId,
} from '@/rendering/theme';

const AUDIO_STORAGE_KEY = 'laser-mirror-audio-enabled';
const HAPTICS_STORAGE_KEY = 'laser-mirror-haptics-enabled';
const THEME_STORAGE_KEY = 'laser-mirror-theme';

export class GameApplication {
  private app=new Application();
  private session:GameSession;
  private view!:PixiGameView;
  private perf=new PerformanceManager();
  private audio:AudioManager;
  private audioEnabled=true;
  private hapticsEnabled=true;
  private themeId:ThemeId=DEFAULT_THEME_ID;
  private readonly levels:readonly LevelDefinition[];
  private completedLevels=new Set<number>();
  private allLevelsUnlocked=false;
  private coins=0;
  private totalLevels=0;
  private pendingResult:{kind:'win'|'lose';copy:{title:string;subtitle:string;tip:string;primary:string;secondary?:string;reward?:number};at:number}|null=null;
  private unresize=()=>{};
  private lastVibrateAt=-Infinity;
  private firePulseAt=0;
  private fireWatchdog:ReturnType<typeof setInterval>|0=0;

  constructor(private readonly platform:IPlatform){
    const repo=new LevelRepository();
    this.levels=repo.levels;
    this.totalLevels=this.levels.length;
    this.completedLevels=loadCompletedLevels(platform,this.totalLevels);
    this.allLevelsUnlocked=false;
    if(loadAllLevelsUnlocked(platform))saveAllLevelsUnlocked(platform,false);
    const initialLevel=loadCurrentLevel(platform,this.totalLevels,this.completedLevels,false);
    this.session=new GameSession(this.levels,loadHearts(platform),initialLevel);
    this.audio=new AudioManager(platform);
    this.coins=loadCoins(platform);
    this.themeId=normalizeThemeId(this.platform.storage.get(THEME_STORAGE_KEY));
    const initialTheme=setActiveTheme(this.themeId);
    if(this.platform.kind==='web')applyThemeToDocument(initialTheme);
    const saved=this.platform.storage.get(AUDIO_STORAGE_KEY);
    this.audioEnabled=saved!=='0';
    this.hapticsEnabled=this.platform.storage.get(HAPTICS_STORAGE_KEY)!=='0';
    this.audio.setEnabled(this.audioEnabled);
  }

  async start(canvas?:any){
    const v=this.platform.viewport();
    const touch=typeof navigator!=='undefined'&&(navigator.maxTouchPoints>0||/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent||''));
    this.perf.seedFromDevice({kind:this.platform.kind,touch,viewport:v});
    const targetCanvas=canvas??this.platform.createCanvas?.();
    const preferWebGLVersion=typeof location!=='undefined'&&/[?&]webgl=1(?:&|$)/.test(location.search)
      ?1:GameConfig.renderer.preferWebGLVersion;
    await this.app.init({
      width:v.width,height:v.height,canvas:targetCanvas,background:Theme.bg,
      // Prefer WebGL2 where the mini-game runtime exposes it; Pixi falls back
      // to WebGL1 automatically. Rendering features still target WebGL1.
      preference:GameConfig.renderer.preference,preferWebGLVersion,
      powerPreference:'high-performance',antialias:GameConfig.renderer.antialias,
      resolution:this.perf.renderResolution,autoDensity:this.platform.kind==='web',autoStart:false
    });

    this.platform.attachCanvas(this.app.canvas,(this.app.renderer as any).events);
    this.createView(false,true);

    // UI sprites are optional decoration. Never block gameplay or the first
    // frame on mini-game image callbacks; the vector fallbacks are complete.
    void loadUiAssets(this.platform.kind).then(()=>{
      this.applyUiTextures();
      this.renderOnce();
    });

    this.session.on(event=>{
      const now=nowMs();
      const state=this.session.state;
      if(event.type==='level'){
        this.collectPendingCoins();this.pendingResult=null;this.view.hideOverlays();
        saveCurrentLevel(this.platform,state.levelIndex);
      }
      if(event.type==='rotate'){
        this.view.rotateItem(event.x,event.y,event.s,event.dir);
        return;
      }
      if(event.type==='state'||event.type==='level'){
        this.view.sync(state);
        if(!this.app.ticker.started) this.renderOnce();
      }
      if(event.type==='impact'){
        this.view.impact(event.impact,now);
        switch(event.impact.type){
          case 'mirror': this.audio.play('mirrorHit'); break;
          case 'splitter': this.audio.play('splitterHit'); break;
          case 'portal': this.audio.play('portal'); break;
          case 'target': this.audio.play('targetHit'); break;
          case 'switch': this.audio.play('switchOn'); break;
          case 'focus': this.audio.play('targetHit'); break;
          case 'combiner': this.audio.play('splitterHit'); break;
          case 'combiner-fire': this.audio.play('laserFire');this.vibrate('heavy');break;
          case 'door': this.audio.play('mirrorHit',.55); break;
          case 'wall': this.audio.play('mirrorHit',.42); break;
        }
        if(event.impact.type==='target')this.vibrate('medium');
        else if(event.impact.type==='mirror'||event.impact.type==='splitter'||event.impact.type==='portal')this.vibrate('light');
        this.wake();
      }
      if(event.type==='combo'){
        this.view.showCombo(event.count, now);
        this.audio.playCombo(event.count);
        this.vibrate(event.count>=3?'medium':'light');
        this.wake();
      }
      if(event.type==='toast'){this.view.showToast(event.text,now);this.wake();}
      if(event.type==='shot-start'){
        this.audio.play('laserCharge');
        this.view.shotStart(state,now);
        this.vibrate('medium');
        this.wake();
      }
      if(event.type==='laser-launch'){
        this.audio.play('laserFire');
        this.view.laserLaunch(state,now);
        this.vibrate('heavy');
        this.wake();
      }
      if(event.type==='shot-end'){
        this.clearFireWatchdog();
        if(!event.success && !event.aborted){
          saveHearts(this.platform,state.hearts);
          this.audio.play('shotFail');
        }
      }
      if(event.type==='victory'){
        const newlyCompleted=!this.completedLevels.has(state.levelIndex);
        this.completedLevels.add(state.levelIndex);
        saveCompletedLevels(this.platform,this.completedLevels);
        if(newlyCompleted)saveCurrentLevel(this.platform,firstIncompleteLevel(this.totalLevels,this.completedLevels));
        this.audio.play('win');
        this.view.victory(now,state);
        const reward=winReward(state.levelIndex);
        const copy={
          title:'通关成功',
          subtitle:`第 ${state.levelIndex+1} 关已完成`,
          tip: state.comboCount>=2 ? `本次连击 ×${state.comboCount}` : '光路接通',
          primary: state.levelIndex < this.totalLevels - 1 ? '下一关' : '再来一轮',
          reward,
        };
        if(reward){
          this.coins+=reward;
          saveCoins(this.platform,this.coins);
        }
        this.view.startWinCoins(now, this.coins-reward, reward);
        this.pendingResult={kind:'win',copy,at:now+(state.comboCount>=2?900:280)};
        this.vibrate('success');this.wake();
      }
      if(event.type==='defeat'){
        this.audio.play('lose');
        this.showHeartRefill(now);
        this.vibrate('heavy');
        this.wake();
      }
    });

    this.view.sync(this.session.state);
    this.app.ticker.add((t:any)=>{
      try{
        const now=nowMs();
        if(this.session.state.firing) this.firePulseAt=Date.now();
        const logicActive=this.session.update(now);
        // A quality change is queued while a beam is travelling, then committed
        // between shots so the laser never changes character halfway through.
        if(this.perf.frame(t.deltaMS,!this.session.state.firing)){
          const viewport=this.platform.viewport();
          this.app.renderer.resize(viewport.width,viewport.height,this.perf.renderResolution);
          this.view.resize(viewport.width,viewport.height,this.platform.safeTop());
        }
        if(this.pendingResult&&now>=this.pendingResult.at){
          const pending=this.pendingResult; this.pendingResult=null;
          this.view.showResult(pending.kind, pending.copy, now);
          if(pending.kind==='win') this.view.revealWinCoins();
        }
        this.view.update(this.session.state,now);
        if(!logicActive&&!this.view.active&&!this.pendingResult){this.app.ticker.stop();this.renderOnce();}
      }catch(error){
        // Pixi does not schedule the next rAF if a ticker listener throws, which
        // freezes the whole mini-game with firing still true.
        console.warn('[game] frame failed', error);
        this.recoverStuckShot();
      }
    });

    this.unresize=this.platform.onResize(next=>{
      this.app.renderer.resize(next.width,next.height);
      this.view.resize(next.width,next.height,this.platform.safeTop());
      if(this.platform.kind==='web'){
        const c=this.app.canvas as HTMLCanvasElement;
        c.style.width=`${next.width}px`;c.style.height=`${next.height}px`;
      }
      this.renderOnce();
    });
    this.renderOnce();
  }

  private collectPendingCoins(){
    if(!this.view) return;
    this.view.settleCoins();
  }
  private createView(reopenSettings=false,reopenLevels=false){
    if(this.view){
      this.app.stage.removeChild(this.view.root);
      this.view.destroy();
    }
    const viewport=this.platform.viewport();
    // Mini-game GPUs have hung on the custom laser mesh at fire; Graphics fallback is the same visual path as ?beam=fallback.
    this.view=new PixiGameView(this.app.renderer,this.perf,this.themeId,this.levels,this.platform.kind==='web');
    this.app.stage.addChild(this.view.root);
    this.view.resize(viewport.width,viewport.height,this.platform.safeTop());
    this.view.sync(this.session.state);
    this.applyUiTextures();
    this.bindViewHandlers();
    if(reopenLevels)this.view.showLevelSelect(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked);
    if(reopenSettings)this.view.showSettings(this.audioEnabled,this.hapticsEnabled,this.themeId);
    const renderer=this.app.renderer as any;
    if(renderer.background)renderer.background.color=Theme.bg;
    if(this.platform.kind==='web')applyThemeToDocument(themeById(this.themeId));
    this.renderOnce();
  }
  private applyUiTextures(){
    if(!this.view)return;
    this.view.setUiTexture('settings',uiTexture(this.platform.kind,'settings'));
    this.view.setUiTexture('crown',uiTexture(this.platform.kind,'crown'));
    this.view.setUiTexture('coin',uiTexture(this.platform.kind,'coin'));
  }
  private bindViewHandlers(){
    this.view.setHandlers({
      rotate:(x,y)=>{
        if(this.session.state.firing||this.session.state.won||this.view.result.visible||this.view.settings.visible||this.view.levelSelect.visible)return;
        const now=nowMs();
        this.session.rotateAt(x,y);
        this.view.mirrorRotateFeedback(x,y,now);
        if(!this.app.ticker.started)this.renderOnce();
        this.wake();this.audio.play('mirrorRotate');this.vibrate('light');
      },
      fire:()=>{
        if(this.view.result.visible||this.view.settings.visible||this.view.levelSelect.visible)return;
        if(this.session.state.hearts<=0){this.audio.play('uiClick');this.showHeartRefill(nowMs());this.wake();return;}
        try{this.session.fire();}
        catch(error){
          console.warn('[game] fire failed', error);
          this.session.abortFire();
        }
        if(this.session.state.firing) this.armFireWatchdog();
        this.wake();
      },
      reset:()=>{this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');this.session.reset();this.wake();},
      openSettings:()=>{if(this.view.result.visible)return;this.audio.play('uiClick');this.view.showSettings(this.audioEnabled,this.hapticsEnabled,this.themeId);this.wake();},
      closeSettings:()=>{this.audio.play('uiClick');this.view.closeSettings();this.wake();},
      toggleAudio:()=>{
        this.audioEnabled=!this.audioEnabled;this.audio.setEnabled(this.audioEnabled);
        this.platform.storage.set(AUDIO_STORAGE_KEY,this.audioEnabled?'1':'0');
        this.view.setAudioEnabled(this.audioEnabled);
        if(this.audioEnabled)this.audio.play('uiClick');
        this.wake();
      },
      toggleHaptics:()=>{
        this.hapticsEnabled=!this.hapticsEnabled;
        this.platform.storage.set(HAPTICS_STORAGE_KEY,this.hapticsEnabled?'1':'0');
        this.view.setHapticsEnabled(this.hapticsEnabled);
        if(this.hapticsEnabled)this.vibrate('light');
        this.wake();
      },
      selectTheme:(id)=>{
        if(id===this.themeId||id===activeThemeId)return;
        this.audio.play('uiClick');
        const reopenLevels=this.view.levelSelect.visible;
        this.themeId=id;setActiveTheme(id);this.platform.storage.set(THEME_STORAGE_KEY,id);
        Promise.resolve().then(()=>{this.createView(true,reopenLevels);this.wake();});
      },
      openLevels:()=>{
        if(this.session.state.firing||this.view.result.visible)return;
        this.audio.play('uiClick');
        this.view.showLevelSelect(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked);
        this.wake();
      },
      selectLevel:(index)=>{
        if(!isLevelUnlocked(index,this.totalLevels,this.completedLevels,this.allLevelsUnlocked))return;
        this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');
        this.session.load(index);this.wake();
      },
      unlockAllLevels:()=>this.unlockAllLevels(),
      clearHistory:()=>this.clearHistory(),
      uiChanged:()=>this.wake(),
      resultPrimary:()=>{
        this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');
        if(this.view.result.kindValue==='win')this.session.next();
        else if(this.session.state.hearts<=0){
          this.session.restoreHearts(Math.min(MAX_HEARTS,this.session.state.hearts+AD_HEART_REWARD));
          saveHearts(this.platform,this.session.state.hearts);
          // Keep the player's current mirror setup when returning from the
          // rewarded-ad flow. The failed shot has already been cleared by the
          // session; reloading the level here would discard all their work.
          this.view.hideOverlays();
          this.view.showToast(`广告功能暂未接入 · 已增加 ${AD_HEART_REWARD} 颗爱心`,nowMs());
        }else this.session.reset();
        this.wake();
      },
      resultSecondary:()=>{this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');this.session.reset();this.wake();},
      coinSound:()=>this.audio.play('coin'),
    });
  }
  private clearHistory(){
    this.audio.play('uiClick');
    this.completedLevels.clear();
    clearLevelProgress(this.platform);
    this.coins=0;saveCoins(this.platform,0);
    this.session.restoreHearts(MAX_HEARTS);saveHearts(this.platform,MAX_HEARTS);
    this.session.load(0);
    this.view.showLevelSelect(0,this.completedLevels,this.allLevelsUnlocked);
    this.vibrate('medium');this.wake();
  }
  private unlockAllLevels(){
    this.allLevelsUnlocked=!this.allLevelsUnlocked;
    this.audio.play('uiClick');
    this.vibrate(this.allLevelsUnlocked?'success':'medium');
    this.view.showLevelSelect(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked);
    this.wake();
  }
  private showHeartRefill(now:number){
    this.view.showResult('lose',{
      title:'爱心用完',
      subtitle:`增加 ${AD_HEART_REWARD} 颗爱心`,
      tip:'观看广告即可继续挑战\n广告功能暂未接入，本次可直接领取',
      primary:`领取 ${AD_HEART_REWARD} 颗爱心`,
    },now);
  }
  private vibrate(type:'light'|'medium'|'heavy'|'success'){
    if(!this.hapticsEnabled)return;
    const now=nowMs();
    const gap=type==='light'?90:type==='success'?120:70;
    if(now-this.lastVibrateAt<gap)return;
    this.lastVibrateAt=now;
    try{this.platform.vibrate(type);}catch{}
  }
  private armFireWatchdog(){
    this.firePulseAt=Date.now();
    if(this.fireWatchdog)return;
    this.fireWatchdog=setInterval(()=>{
      if(!this.session.state.firing){this.clearFireWatchdog();return;}
      if(Date.now()-this.firePulseAt<2500)return;
      this.recoverStuckShot();
    },1000);
  }
  private clearFireWatchdog(){
    if(!this.fireWatchdog)return;
    clearInterval(this.fireWatchdog);
    this.fireWatchdog=0;
  }
  private recoverStuckShot(){
    const wasFiring=this.session.state.firing;
    try{if(wasFiring)this.session.abortFire();}catch{}
    this.clearFireWatchdog();
    if(wasFiring){
      try{this.view.showToast('发射中断',nowMs());}catch{}
    }
    this.wake();
    this.renderOnce();
  }
  private wake(){
    const ticker=this.app.ticker as any;
    if(!ticker.started){
      ticker.start();
      return;
    }
    // A thrown tick leaves `started` true but cancels the next animation frame.
    if(ticker._requestId==null){
      ticker.lastTime=nowMs();
      ticker._requestIfNeeded?.();
    }
  }
  private renderOnce(){
    try{this.app.renderer.render(this.app.stage);}catch(error){console.warn('[game] render failed',error);}
  }
  destroy(){this.pendingResult=null;this.clearFireWatchdog();this.unresize();this.audio.destroy();this.view?.destroy();this.app.destroy(true);}
}
