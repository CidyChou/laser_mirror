import { Application } from 'pixi.js';
import { AudioManager } from '@/audio/AudioManager';
import { MusicManager } from '@/audio/MusicManager';
import { StartupScreen } from './StartupScreen';
import { GameConfig } from '@/config/GameConfig';
import { nowMs } from '@/core/clock';
import { firstClearReward, initializeCoins, saveCoins } from '@/economy/wallet';
import { AD_HEART_REWARD, heartPurchase, heartRefillCost, loadHearts, MAX_HEARTS, nextHeartRecovery, recoverHearts, saveHearts } from '@/economy/hearts';
import { bonusRemaining, COIN_AD_USAGE_KEY, consumeBonus, HINT_COIN_COST, recordFirstClear } from '@/economy/operations';
import { ECONOMY } from '@/economy/config';
import { mirrorHint, type MirrorHint } from '@/gameplay/hints';
import { WECHAT_OPERATIONS } from '@/platform/wechat/config';
import type { CommunityTarget, OperationContext, RewardPlacement } from '@/platform/operations';
import type { ResultCopy } from '@/rendering/layers/ResultLayer';
import type { SupportAction } from '@/rendering/layers/SupportLayer';
import { GameSession } from '@/gameplay/GameSession';
import { TutorialDirector } from '@/gameplay/tutorial';
import { loadTutorialProgress, saveTutorialProgress } from '@/progression/tutorialProgress';
import type { LevelDefinition } from '@/gameplay/types';
import { rewardLevelIndex, stageCompletionLabel, stageFileLabel, stageId, stageLabel } from '@/levels/campaign';
import { LevelRepository } from '@/levels/LevelRepository';
import { PerformanceManager } from '@/performance/PerformanceManager';
import type { HapticKind, IPlatform } from '@/platform/IPlatform';
import { HapticGate } from '@/platform/HapticGate';
import { PixiGameView } from '@/rendering/PixiGameView';
import { createGameShareContent } from './share';
import {
  clearLevelProgress,
  firstIncompleteLevel,
  isLevelUnlocked,
  loadAllLevelsUnlocked,
  loadCampaignAccess,
  loadCompletedLevels,
  loadCurrentLevel,
  saveAllLevelsUnlocked,
  saveCompletedLevels,
  saveCurrentLevel,
} from '@/progression/levelProgress';
import { loadUiAssets, MECHANISM_ASSET_KEYS, uiTexture } from '@/rendering/ui/assets';
import {
  DEFAULT_THEME_ID,
  Theme,
  activeThemeId,
  applyThemeToDocument,
  normalizeLaserColorId,
  normalizeThemeId,
  setActiveLaserColor,
  setActiveTheme,
  themeById,
  type LaserColorId,
  type ThemeId,
} from '@/rendering/theme';

const AUDIO_STORAGE_KEY = 'laser-mirror-audio-enabled';
const MUSIC_STORAGE_KEY = 'laser-mirror-music-enabled';
const HAPTICS_STORAGE_KEY = 'laser-mirror-haptics-enabled';
const THEME_STORAGE_KEY = 'laser-mirror-theme';
const LASER_COLOR_STORAGE_KEY = 'laser-mirror-laser-color';
const TIME_PROGRESS_KEY = 'laser-mirror-time-progress-v1';

export class GameApplication {
  private app=new Application();
  private session:GameSession;
  private tutorial:TutorialDirector;
  private view!:PixiGameView;
  private perf=new PerformanceManager();
  private audio:AudioManager;
  private music:MusicManager;
  private audioEnabled=true;
  private musicEnabled=true;
  private hapticsEnabled=true;
  private themeId:ThemeId=DEFAULT_THEME_ID;
  private laserColorId:LaserColorId='pink';
  private readonly levels:readonly LevelDefinition[];
  private completedLevels=new Set<number>();
  private allLevelsUnlocked=false;
  private unlockedThrough=0;
  private coins=0;
  private timeProgress={usedFailureProtection:new Set<number>(),seenTutorials:new Set<string>()};
  private totalLevels=0;
  private pendingResult:{kind:'win'|'lose';copy:ResultCopy;at:number}|null=null;
  private unresize=()=>{};
  private unaudio=()=>{};
  private unexternal=()=>{};
  private unmenu=()=>{};
  private operationBusy=false;
  private externalActive=false;
  private appVisible=true;
  private operationGeneration=0;
  private winRewardAmount=0;
  private winBonusClaimed=false;
  private winInterstitialDue=false;
  private heartRecoveryTimer:ReturnType<typeof setTimeout>|null=null;
  private supportScreen:'hearts'|'supply'|'community'|null=null;
  private readonly hapticGate=new HapticGate();
  private firePulseAt=0;
  private fireWatchdog:ReturnType<typeof setInterval>|0=0;
  private fireChargeStartedAt:number|null=null;
  private fireChargeHapticStep=0;
  private paidVictory=false;
  private savingPoster=false;
  private readonly sharedLaunch:boolean;
  private loading:StartupScreen|null=null;
  private destroyed=false;

  constructor(private readonly platform:IPlatform){
    const repo=new LevelRepository();
    this.levels=repo.levels;
    this.totalLevels=this.levels.length;
    this.completedLevels=loadCompletedLevels(platform,this.levels);
    this.unlockedThrough=loadCampaignAccess(platform,this.levels,this.completedLevels);
    this.allLevelsUnlocked=false;
    if(loadAllLevelsUnlocked(platform))saveAllLevelsUnlocked(platform,false);
    const requestedStage=platform.getSharedStage?.();
    const sharedIndex=requestedStage?this.levels.findIndex((level,index)=>stageId(level,index)===requestedStage):-1;
    this.sharedLaunch=sharedIndex>=0&&isLevelUnlocked(sharedIndex,this.levels,this.completedLevels,false,this.unlockedThrough);
    const initialLevel=this.sharedLaunch?sharedIndex:loadCurrentLevel(platform,this.levels,this.completedLevels,false);
    try{
      const saved=JSON.parse(platform.storage.get(TIME_PROGRESS_KEY)||'{}');
      if(Array.isArray(saved.failures))this.timeProgress.usedFailureProtection=new Set(saved.failures.filter((n:unknown)=>Number.isInteger(n)));
      if(Array.isArray(saved.tutorials))this.timeProgress.seenTutorials=new Set(saved.tutorials.filter((s:unknown)=>s==='bullet'));
    }catch{/* Recover malformed local progress without dropping ordinary progress. */}
    this.session=new GameSession(this.levels,loadHearts(platform),initialLevel,this.timeProgress);
    this.tutorial=new TutorialDirector(loadTutorialProgress(platform,this.levels,this.completedLevels),seen=>saveTutorialProgress(platform,seen));
    this.tutorial.enter(this.session.state);
    this.audio=new AudioManager(platform);
    this.music=new MusicManager(platform);
    this.coins=initializeCoins(platform,this.completedLevels.size>0);
    this.themeId=normalizeThemeId(this.platform.storage.get(THEME_STORAGE_KEY));
    this.laserColorId=normalizeLaserColorId(this.platform.storage.get(LASER_COLOR_STORAGE_KEY));
    setActiveLaserColor(this.laserColorId);
    const initialTheme=setActiveTheme(this.themeId);
    if(this.platform.kind==='web')applyThemeToDocument(initialTheme);
    const saved=this.platform.storage.get(AUDIO_STORAGE_KEY);
    this.audioEnabled=saved!=='0';
    this.musicEnabled=(this.platform.storage.get(MUSIC_STORAGE_KEY)??saved)!=='0';
    this.hapticsEnabled=this.platform.storage.get(HAPTICS_STORAGE_KEY)!=='0';
    this.audio.setEnabled(this.audioEnabled);
    this.music.setEnabled(this.musicEnabled);
    this.platform.configureShare?.(()=>this.createShareContent());
  }

  private createShareContent() {
    const {level,levelIndex}=this.session.state;
    return createGameShareContent(level,levelIndex);
  }

  async start(canvas?:any,options:{skipLoading?:boolean;onBootPhase?:(phase:string)=>void}={}){
    options.onBootPhase?.('renderer');
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
      // Browser Canvas2D fallback assumes DOM canvas constructors. Native
      // mini-game canvases must stay on the supported WebGL rendering path.
      preference:this.platform.kind==='web'?GameConfig.renderer.preference:['webgl'],preferWebGLVersion,
      powerPreference:'high-performance',antialias:GameConfig.renderer.antialias,
      resolution:this.perf.renderResolution,autoDensity:this.platform.kind==='web',autoStart:false
    });

    this.platform.attachCanvas(this.app.canvas,(this.app.renderer as any).events);
    this.app.stage.eventMode='static';
    this.app.stage.hitArea=this.app.screen;
    this.app.stage.on('pointerdowncapture',()=>{this.platform.community?.onGameInteraction();this.music.unlock();});
    this.unaudio=this.platform.onAudioActiveChange?.(active=>{
      this.appVisible=active;
      this.music.setActive(active&&!this.externalActive);
      if(!active)this.platform.cancelHaptics?.();
      if(!active)this.clearHeartRecoveryTimer();
      else if(this.view)this.refreshHeartRecovery();
      this.syncNativeMenuAd();
    })??(()=>{});
    this.unexternal=this.platform.onExternalActivityChange?.(active=>{
      this.externalActive=active;
      this.music.setActive(this.appVisible&&!active);
      if(active)this.platform.cancelHaptics?.();
      this.syncNativeMenuAd();
    })??(()=>{});
    this.unmenu=this.platform.ads?.onMenuChange?.(()=>{if(!this.destroyed){this.syncNativeMenuAd();this.wake();}})??(()=>{});
    if(!options.skipLoading){
      options.onBootPhase?.('loading-screen');
      this.loading=new StartupScreen(this.app,this.platform);
      options.onBootPhase?.('first-frame');
      this.loading.scene.setProgress(.15);
      // Give the loading screen its own first paint before building the full game view.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      if(this.destroyed)return;
    }
    options.onBootPhase?.('game-view');
    this.createView(false,!this.sharedLaunch);
    this.loading?.scene.setProgress(.35);

    options.onBootPhase?.('assets');
    const uiReady=loadUiAssets(this.platform.kind,ratio=>{
      if(this.destroyed)return;
      this.loading?.scene.setProgress(.35+ratio*.65);
      this.loading?.scene.setTitleTexture(uiTexture(this.platform.kind,'loadingTitle'));
    }).then(()=>{
      if(this.destroyed)return;
      this.applyUiTextures();
      this.renderOnce();
    });

    this.session.on(event=>{
      const now=nowMs();
      const state=this.session.state;
      if(event.type==='first-failure-free')this.saveTimeProgress();
      if(event.type==='skill-tutorial'){
        this.view.showResult('lose',{
          title:'子弹时间',subtitle:'章节挑战 · 技能教学',
          tip:'接下来 3 秒光束会减速。\n旋转镜面消耗神之手次数，激光寿命继续减少。',primary:'明白了 · 启动技能',
        },now);this.wake();
      }
      if(event.type==='level'){
        this.supportScreen=null;
        this.operationGeneration++;
        this.winRewardAmount=0;this.winBonusClaimed=false;this.winInterstitialDue=false;
        this.cancelFireCharge();
        this.collectPendingCoins();this.pendingResult=null;this.paidVictory=false;this.view.hideOverlays();
        saveCurrentLevel(this.platform,state.levelIndex,this.levels);
        this.tutorial.enter(state);
        this.syncTutorial();
      }
      if(event.type==='rotate'){
        this.view.rotateItem(event.x,event.y,event.s,event.dir);
        this.tutorial.rotated(state,event.x,event.y);
        this.syncTutorial();
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
          case 'portal': this.audio.play('portal',.8); break;
          case 'portal-exit': this.audio.play('portal'); break;
          case 'target': this.audio.play('targetHit'); break;
          case 'switch': this.audio.play('switchOn'); break;
          case 'focus': this.audio.play('targetHit'); break;
          case 'combiner': this.audio.play('splitterHit'); break;
          case 'combiner-fire': this.audio.play('laserFire');this.vibrate('heavy');break;
          case 'door': this.audio.play('mirrorHit',.55); break;
          case 'door-open': this.audio.play('mirrorHit',.35); break;
          case 'wall': this.audio.play('mirrorHit',.42); break;
        }
        if(event.impact.type==='target')this.vibrate('heavy');
        else if(event.impact.type==='mirror'||event.impact.type==='splitter'||event.impact.type==='focus')this.vibrate('medium');
        else if(event.impact.type==='portal'||event.impact.type==='portal-exit')this.vibrate('light');
        this.wake();
      }
      if(event.type==='combo'){
        this.view.showCombo(event.count, now);
        this.audio.playCombo(event.count);
        this.wake();
      }
      if(event.type==='toast'){this.view.showToast(event.text,now);this.wake();}
      if(event.type==='shot-start'){
        this.view.shotStart(state,now);
        this.wake();
      }
      if(event.type==='laser-launch'){
        this.audio.play('laserFire');
        this.view.laserLaunch(state,now);
        this.vibrate('launch');
        this.wake();
      }
      if(event.type==='shot-end'){
        this.clearFireWatchdog();
        this.refreshHeartRecovery();
        if(!event.success && !event.aborted){
          saveHearts(this.platform,state.hearts);
          this.audio.play('shotFail');
        }
      }
      if(event.type==='victory'){
        this.tutorial.victory();
        this.syncTutorial();
        const newlyCompleted=!this.completedLevels.has(state.levelIndex);
        this.completedLevels.add(state.levelIndex);
        saveCompletedLevels(this.platform,this.completedLevels,this.levels);
        if(newlyCompleted)saveCurrentLevel(this.platform,firstIncompleteLevel(this.totalLevels,this.completedLevels),this.levels);
        this.audio.play('win');
        this.view.victory(now,state);
        const reward=this.paidVictory?0:firstClearReward(rewardLevelIndex(state.level,state.levelIndex),Boolean(state.level.timeBoss),newlyCompleted);
        this.winRewardAmount=reward;
        if(newlyCompleted&&this.platform.ads?.canInterstitial()){
          const pacing=WECHAT_OPERATIONS.interstitial;
          this.winInterstitialDue=recordFirstClear(this.platform,stageId(state.level,state.levelIndex),pacing.firstAfter,pacing.every);
          this.platform.ads.preloadInterstitial();
        }
        const copy:ResultCopy={
          title:'通关成功',
          subtitle:stageCompletionLabel(state.level,state.levelIndex),
          tip: !newlyCompleted?'已完成的关卡 · 重玩不重复发放金币':state.comboCount>=2 ? `本次连击 ×${state.comboCount}` : '首通奖励已到账',
          primary: state.levelIndex < this.totalLevels - 1 ? '下一关' : '再来一轮',
          reward,
          ...(reward>0&&this.platform.ads?.canReward('double')&&this.bonusAvailable()?{bonus:'看视频 · 本关金币翻倍'}:{}),
          recommend:this.platform.community?.canOpen('recommend')&&!this.platform.community.isRecommended(),
          community:this.platform.community?.canOpen('club'),
        };
        if(copy.bonus)this.platform.ads?.preloadRewards(['double']);
        if(reward){
          this.paidVictory=true;
          this.coins+=reward;
          this.persistCoins();
        }
        this.pendingResult={kind:'win',copy,at:now+(state.comboCount>=2?480:220)};
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
      if(this.loading)return;
      try{
        const now=nowMs();
        this.updateFireCharge(now);
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
          const reward=pending.copy.reward??0;
          if(pending.kind==='win' && reward>0){
            this.view.startWinCoins(now,this.coins-reward,reward);
            this.view.revealWinCoins();
          }
        }
        this.view.update(this.session.state,now);
        this.syncNativeMenuAd();
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
    if(this.loading){
      const loading=this.loading;
      await uiReady;
      if(this.destroyed)return;
      options.onBootPhase?.('ready');
      const started=await loading.waitForStart(()=>this.audio.play('uiClick'));
      if(!started||this.destroyed)return;
      this.view.root.visible=true;
      await loading.dismiss();
      if(this.destroyed)return;
      this.loading=null;
      this.wake();
    }
    options.onBootPhase?.('playing');
    this.refreshHeartRecovery();
    this.platform.ads?.preloadRewards(['hearts','coins']);
    this.platform.ads?.preloadInterstitial();
    this.syncNativeMenuAd();
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
    this.view.root.visible=!this.loading;
    this.app.stage.addChild(this.view.root);
    if(this.loading)this.app.stage.addChild(this.loading.scene);
    this.view.resize(viewport.width,viewport.height,this.platform.safeTop());
    this.view.sync(this.session.state);
    this.applyUiTextures();
    this.bindViewHandlers();
    this.view.setCoinBalance(this.coins);
    this.view.configureOperations(this.platform.kind==='wechat',this.platform.ads?.menuSize()??null);
    this.view.setInteractionBlocked(this.operationBusy);
    this.syncTutorial();
    if(reopenLevels)this.view.showLevelSelect(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough);
    if(reopenSettings)this.view.showSettings(this.audioEnabled,this.hapticsEnabled,this.themeId,this.laserColorId,this.musicEnabled);
    const renderer=this.app.renderer as any;
    if(renderer.background)renderer.background.color=Theme.bg;
    if(this.platform.kind==='web')applyThemeToDocument(themeById(this.themeId));
    this.renderOnce();
  }
  private applyUiTextures(){
    if(!this.view)return;
    this.view.setUiTexture('background',uiTexture(this.platform.kind,'background'));
    this.view.setUiTexture('settings',uiTexture(this.platform.kind,'settings'));
    this.view.setUiTexture('crown',uiTexture(this.platform.kind,'crown'));
    this.view.setUiTexture('coin',uiTexture(this.platform.kind,'coin'));
    this.view.setUiTexture('finger',uiTexture(this.platform.kind,'finger'));
    for (const key of ['heart','emitter','receiver'] as const) this.view.setUiTexture(key,uiTexture(this.platform.kind,key));
    for (const key of MECHANISM_ASSET_KEYS) this.view.setUiTexture(key,uiTexture(this.platform.kind,key));
  }
  private bindViewHandlers(){
    this.view.setHandlers({
      openHearts:()=>this.showHeartRefill(nowMs()),
      coinVideo:()=>{void this.claimCoinVideo();},
      openSupply:()=>this.openSupply(),
      openCommunity:()=>{if(this.view.result.visible&&!this.session.state.won&&this.platform.community?.canOpen('help'))void this.openCommunity('help');else this.openCommunityHub();},
      closeSupport:()=>{this.supportScreen=null;this.view.hideSupport();this.audio.play('uiClick');this.wake();},
      resultBonus:()=>{void this.claimWinBonus();},
      recommendGame:()=>{void this.openCommunity('recommend');},
      bulletTime:()=>{if(!this.overlayLocked()){this.session.startBulletTime();this.wake();}},
      rotate:(x,y)=>this.rotate(x,y),
      firePressStart:()=>this.startFireCharge(),
      firePressEnd:()=>this.endFireCharge(),
      reset:()=>{this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');this.session.reset();this.wake();},
      openSettings:()=>{if(this.session.state.firing||this.view.result.visible||this.view.poster.visible)return;this.audio.play('uiClick');this.view.showSettings(this.audioEnabled,this.hapticsEnabled,this.themeId,this.laserColorId,this.musicEnabled);this.wake();},
      closeSettings:()=>{this.audio.play('uiClick');this.view.closeSettings();this.wake();},
      toggleMusic:()=>{
        this.musicEnabled=!this.musicEnabled;this.music.setEnabled(this.musicEnabled);
        this.platform.storage.set(MUSIC_STORAGE_KEY,this.musicEnabled?'1':'0');
        this.view.setMusicEnabled(this.musicEnabled);
        this.audio.play('uiClick');this.wake();
      },
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
        else this.platform.cancelHaptics?.();
        this.wake();
      },
      selectTheme:(id)=>{
        if(id===this.themeId||id===activeThemeId)return;
        this.audio.play('uiClick');
        const reopenLevels=this.view.levelSelect.visible;
        this.themeId=id;setActiveTheme(id);this.platform.storage.set(THEME_STORAGE_KEY,id);
        Promise.resolve().then(()=>{this.createView(true,reopenLevels);this.wake();});
      },
      selectLaserColor:(id)=>{
        if(id===this.laserColorId)return;
        this.audio.play('uiClick');
        const reopenLevels=this.view.levelSelect.visible;
        this.laserColorId=id;setActiveLaserColor(id);this.platform.storage.set(LASER_COLOR_STORAGE_KEY,id);
        Promise.resolve().then(()=>{this.createView(true,reopenLevels);this.wake();});
      },
      openLevels:()=>{
        if(this.session.state.firing||this.view.result.visible||this.view.poster.visible||this.view.support.visible)return;
        this.audio.play('uiClick');
        this.view.showLevelSelect(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough);
        this.wake();
      },
      selectLevel:(index)=>{
        if(this.session.state.firing||this.view.result.visible||this.view.poster.visible)return;
        if(index<0||index>=this.totalLevels)return;
        if(!isLevelUnlocked(index,this.levels,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough)){
          this.view.showToast('通过当前关卡后解锁下一关',nowMs());this.wake();return;
        }
        this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');
        this.session.load(index);this.wake();
      },
      canSelectLevel:index=>isLevelUnlocked(index,this.levels,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough),
      unlockAllLevels:()=>this.unlockAllLevels(),
      clearHistory:()=>this.clearHistory(),
      uiChanged:()=>this.wake(),
      resultPrimary:()=>{
        if(this.session.state.timeSkill?.tutorial){this.view.result.hide();this.session.confirmSkillTutorial();this.saveTimeProgress();this.wake();return;}
        this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');
        if(this.view.result.kindValue==='win'){void this.leaveWin(()=>this.session.next());return;}
        else if(this.session.state.hearts<=0)this.showHeartRefill(nowMs());
        else this.view.hideOverlays();
        this.wake();
      },
      resultSecondary:()=>{this.showHeartRefill(nowMs());},
      resultPreview:()=>this.openWinPreview(),
      resultLevels:()=>{
        this.collectPendingCoins();this.pendingResult=null;this.audio.play('uiClick');
        const open=()=>{this.view.showLevelSelectFromWin(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough);this.wake();};
        if(this.session.state.won)void this.leaveWin(open);else open();
      },
      closePoster:()=>{this.audio.play('uiClick');this.view.poster.hide();this.wake();},
      savePoster:()=>{void this.saveWinPoster();},
      coinSound:()=>this.audio.play('coin'),
      tutorialNext:()=>{if(this.overlayLocked())return;this.audio.play('uiClick');this.tutorial.next();this.syncTutorial();this.wake();},
      tutorialSkip:()=>{if(this.overlayLocked())return;this.audio.play('uiClick');this.tutorial.skip();this.syncTutorial();this.wake();},
      tutorialTap:()=>{
        const step=this.tutorial.current,anchor=step?.anchors[0];
        if(step?.action==='rotate'&&anchor?.kind==='cell')this.rotate(anchor.x,anchor.y);
      },
      replayTutorial:()=>{
        if(this.session.state.firing){this.view.showToast('请等待本次发射结束',nowMs());this.wake();return;}
        this.collectPendingCoins();this.pendingResult=null;
        if(this.session.state.won)this.session.reset();
        this.view.hideOverlays();
        this.tutorial.enter(this.session.state,true);
        this.syncTutorial();this.audio.play('uiClick');this.wake();
      },
    });
  }
  private rotate(x:number,y:number){
    if((this.session.state.firing&&!this.session.state.timeSkill?.canOperate)||this.session.state.won||this.overlayLocked()||(!this.session.state.firing&&!this.tutorial.allowsRotate(x,y)))return;
    this.session.rotateAt(x,y);
    this.view.mirrorRotateFeedback(x,y,nowMs());
    if(!this.app.ticker.started)this.renderOnce();
    this.wake();this.audio.play('mirrorRotate');this.vibrate('light');
  }
  private fire(precharged=false){
    if(this.overlayLocked())return;
    if(this.session.state.firing&&this.session.state.timeSkill){this.session.endTimeShot();this.wake();return;}
    if(!this.session.state.firing&&!this.tutorial.allowsFire())return;
    if(this.session.state.hearts<=0){this.audio.play('uiClick');this.showHeartRefill(nowMs());this.wake();return;}
    try{this.session.fire(precharged);}
    catch(error){console.warn('[game] fire failed',error);this.session.abortFire();}
    if(this.session.state.firing)this.armFireWatchdog();
    this.wake();
  }
  private startFireCharge(){
    if(this.fireChargeStartedAt!==null||this.overlayLocked())return;
    if(this.session.state.firing){
      if(this.session.state.timeSkill)this.fire();
      return;
    }
    if(!this.tutorial.allowsFire())return;
    if(this.session.state.hearts<=0){this.audio.play('uiClick');this.showHeartRefill(nowMs());this.wake();return;}
    this.fireChargeStartedAt=nowMs();
    this.fireChargeHapticStep=0;
    this.view.setFireCharge(0,this.fireChargeStartedAt);
    this.audio.play('laserCharge');
    this.vibrate('light');
    this.wake();
  }
  private endFireCharge(){
    if(this.fireChargeStartedAt===null)return;
    if(nowMs()-this.fireChargeStartedAt>=GameConfig.laser.inputChargeMs)this.completeFireCharge();
    else this.cancelFireCharge();
  }
  private updateFireCharge(now:number){
    if(this.fireChargeStartedAt===null)return;
    const progress=Math.min(1,(now-this.fireChargeStartedAt)/GameConfig.laser.inputChargeMs);
    this.view.setFireCharge(progress,now);
    const stages=[.25,.50,.72,.87];
    while(this.fireChargeHapticStep<stages.length&&progress>=stages[this.fireChargeHapticStep]){
      const step=this.fireChargeHapticStep++;
      this.vibrate(step<2?'light':step===2?'medium':'heavy');
    }
    if(progress>=1)this.completeFireCharge();
  }
  private completeFireCharge(){
    if(this.fireChargeStartedAt===null)return;
    this.fireChargeStartedAt=null;
    this.audio.stop('laserCharge');
    this.view.setFireCharge(null);
    this.fire(true);
  }
  private cancelFireCharge(){
    if(this.fireChargeStartedAt===null)return;
    this.fireChargeStartedAt=null;
    this.audio.stop('laserCharge');
    this.view?.setFireCharge(null);
  }
  private syncTutorial(){
    if(this.view)this.view.setTutorial(this.tutorial.current,this.session.state,this.tutorial.progress);
  }
  private overlayLocked(){
    return this.operationBusy||this.view.support.visible||this.view.result.visible||this.view.settings.visible||this.view.levelSelect.visible||this.view.poster.visible;
  }
  private openWinPreview(){
    if(this.view.poster.visible)return;
    this.audio.play('uiClick');
    this.vibrate('heavy');
    const state=this.session.state;
    const ok=this.view.showWinPreview({stageLabel:stageLabel(state.level,state.levelIndex),comboCount:state.comboCount},nowMs());
    if(!ok) this.view.showToast('预览失败',nowMs());
    this.wake();
    this.renderOnce();
  }
  private async saveWinPoster(){
    if(this.savingPoster||!this.view.poster.visible)return;
    this.savingPoster=true;
    this.view.poster.setSaveStatus('saving');
    this.audio.play('uiClick');
    this.wake();
    try{
      const canvas=this.view.exportPosterCanvas();
      if(!canvas){
        this.view.poster.setSaveStatus('error');
        this.view.showToast('保存失败',nowMs());
        return;
      }
      const result=await this.platform.saveImageToAlbum({
        canvas,
        filename:`光线急转弯-${stageFileLabel(this.session.state.level,this.session.state.levelIndex)}.png`,
      });
      this.view.poster.setSaveStatus(result.ok?'saved':'error');
      this.view.showToast(result.message,nowMs());
    }catch{
      this.view.poster.setSaveStatus('error');
      this.view.showToast('保存失败',nowMs());
    }finally{
      this.savingPoster=false;
      this.wake();
    }
  }
  private clearHistory(){
    this.timeProgress.usedFailureProtection.clear();this.timeProgress.seenTutorials.clear();this.saveTimeProgress();
    this.audio.play('uiClick');
    this.completedLevels.clear();
    this.unlockedThrough=0;
    clearLevelProgress(this.platform);
    this.tutorial.clear();
    this.coins=0;this.persistCoins();
    this.session.restoreHearts(MAX_HEARTS);saveHearts(this.platform,MAX_HEARTS);
    this.clearHeartRecoveryTimer();this.supportScreen=null;
    this.session.load(0);
    this.view.showLevelSelect(0,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough);
    this.vibrate('medium');this.wake();
  }
  private saveTimeProgress(){
    this.platform.storage.set(TIME_PROGRESS_KEY,JSON.stringify({failures:[...this.timeProgress.usedFailureProtection],tutorials:[...this.timeProgress.seenTutorials]}));
  }
  private unlockAllLevels(){
    this.allLevelsUnlocked=!this.allLevelsUnlocked;
    this.audio.play('uiClick');
    this.vibrate(this.allLevelsUnlocked?'success':'medium');
    this.view.showLevelSelect(this.session.state.levelIndex,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough);
    this.wake();
  }
  private showHeartRefill(now:number){
    if(this.operationBusy||this.session.state.firing)return;
    this.cancelFireCharge();this.refreshHeartRecovery();
    this.supportScreen='hearts';this.renderHeartShop();this.wake();
  }

  private persistCoins(){saveCoins(this.platform,this.coins);this.view?.setCoinBalance(this.coins);}

  private heartActions():SupportAction[]{
    const state=this.session.state,missing=MAX_HEARTS-state.hearts;
    if(missing<=0)return[];
    const expected={state,hearts:state.hearts,coins:this.coins};
    const cost=heartRefillCost(state.hearts);
    const actions:SupportAction[]=[{label:`${cost} 金币 · 补满 ${missing} 颗爱心`,primary:this.coins>=cost,disabled:this.coins<cost,
      run:()=>this.purchaseHearts('fill',expected)}];
    const affordable=Math.min(missing-1,Math.floor(this.coins/ECONOMY.heartPrice));
    if(this.coins<cost&&affordable>=2)actions.push({label:`${affordable*ECONOMY.heartPrice} 金币 · 增加 ${affordable} 颗爱心`,run:()=>this.purchaseHearts(affordable,expected)});
    if(missing>1)actions.push({label:`${ECONOMY.heartPrice} 金币 · 增加 1 颗爱心`,disabled:this.coins<ECONOMY.heartPrice,
      run:()=>this.purchaseHearts('one',expected)});
    if(this.platform.ads?.canReward('hearts'))actions.push({label:'看视频 · 补满爱心',primary:this.coins<cost,run:()=>{void this.watchReward('hearts',()=>this.refillHearts(AD_HEART_REWARD));}});
    return actions;
  }

  private renderHeartShop(){
    const state=this.session.state,actions=this.heartActions();
    if(this.platform.ads?.canReward('coins')&&this.coins<ECONOMY.heartPrice)actions.push({label:`看视频 · 领取 ${WECHAT_OPERATIONS.rewards.coinsPerVideo} 金币`,disabled:!!this.coinVideoReason(),run:()=>{void this.claimCoinVideo();}});
    if(state.hearts>0)actions.push({label:'继续挑战',primary:true,run:()=>{this.supportScreen=null;this.view.hideSupport();this.wake();}});
    if(this.platform.community?.canOpen('help'))actions.push({label:'卡关求助与攻略',run:()=>{void this.openCommunity('help');}});
    actions.push({label:'返回选关',run:()=>{
      this.supportScreen=null;this.view.hideSupport();this.view.showLevelSelectFromWin(state.levelIndex,this.completedLevels,this.allLevelsUnlocked,this.unlockedThrough);this.wake();
    }});
    this.view.showSupport({title:state.hearts<=0?'爱心用完':'爱心补给',
      body:`金币 ${this.coins}  ·  爱心 ${state.hearts} / ${MAX_HEARTS}\n每 ${ECONOMY.heartRecoveryMs/60000} 分钟恢复 1 颗，离线也会恢复\n补充后保留当前镜面布局`,actions});
    this.platform.ads?.preloadRewards(['hearts']);
    this.wake();
  }

  private purchaseHearts(amount:'one'|'fill'|number,expected?:{state:GameSession['state'];hearts:number;coins:number}){
    if(this.operationBusy||this.session.state.firing)return;
    this.refreshHeartRecovery();
    if(expected&&(expected.state!==this.session.state||expected.hearts!==this.session.state.hearts||expected.coins!==this.coins)){
      if(this.supportScreen==='hearts')this.renderHeartShop();else this.openSupply();return;
    }
    const purchase=heartPurchase(this.coins,this.session.state.hearts,amount);
    if(!purchase){this.view.showToast(this.session.state.hearts>=MAX_HEARTS?'爱心已满':'金币不足，通关或观看视频可补充金币',nowMs());this.wake();return;}
    this.coins=purchase.coins;this.persistCoins();
    this.session.restoreHearts(purchase.hearts);saveHearts(this.platform,purchase.hearts);
    this.supportScreen=null;this.view.hideSupport();
    this.view.showToast(`已购买 ${purchase.gained} 颗爱心 · 花费 ${purchase.cost} 金币`,nowMs());
    this.scheduleHeartRecovery();this.audio.play('uiClick');this.wake();
  }

  private clearHeartRecoveryTimer(){
    if(this.heartRecoveryTimer!==null)clearTimeout(this.heartRecoveryTimer);
    this.heartRecoveryTimer=null;
  }

  private scheduleHeartRecovery(retryIn?:number){
    this.clearHeartRecoveryTimer();
    if(this.destroyed||!this.appVisible)return;
    const next=nextHeartRecovery(this.platform);
    if(next===null)return;
    this.heartRecoveryTimer=setTimeout(()=>{
      this.heartRecoveryTimer=null;
      this.refreshHeartRecovery();
      if(this.supportScreen==='hearts'&&this.view.support.visible&&!this.operationBusy)this.renderHeartShop();
    },retryIn??Math.max(50,next-Date.now()));
  }

  private refreshHeartRecovery(){
    if(this.session.state.firing||this.operationBusy){this.scheduleHeartRecovery(1000);return;}
    const recovery=recoverHearts(this.platform,this.session.state.hearts);
    if(recovery.hearts!==this.session.state.hearts){this.session.restoreHearts(recovery.hearts);if(this.view)this.wake();}
    this.scheduleHeartRecovery();
  }

  private context():OperationContext{
    const state=this.session.state;
    return{stage:stageId(state.level,state.levelIndex),screen:this.view.result.visible?(state.won?'win':'lose'):this.view.levelSelect.visible?'menu':this.supportScreen==='hearts'?'hearts':'playing'};
  }

  private bonusAvailable(){return bonusRemaining(this.platform,WECHAT_OPERATIONS.rewards.dailyBonusLimit)>0;}

  private refillHearts(amount:number){
    const before=this.session.state.hearts;
    this.session.restoreHearts(Math.min(MAX_HEARTS,before+amount));
    saveHearts(this.platform,this.session.state.hearts);
    this.supportScreen=null;
    if(this.view.levelSelect.visible)this.view.hideSupport();else this.view.hideOverlays();
    const granted=this.session.state.hearts-before;
    this.view.showToast(`已补充 ${granted} 颗爱心`,nowMs());this.scheduleHeartRecovery();this.wake();
    return granted;
  }

  private openSupply(){
    if(this.operationBusy||this.session.state.firing||(this.session.state.won&&!this.view.levelSelect.visible))return;
    this.cancelFireCharge();this.refreshHeartRecovery();this.supportScreen='supply';
    const state=this.session.state,ads=this.platform.ads;
    const hint=mirrorHint(state);
    const actions:SupportAction[]=[];
    if(state.hearts<MAX_HEARTS)actions.push({label:`爱心补给 · ${ECONOMY.heartPrice} 金币起`,run:()=>this.showHeartRefill(nowMs())});
    if(ads?.canReward('coins'))actions.push({label:`看视频 · 领取 ${WECHAT_OPERATIONS.rewards.coinsPerVideo} 金币`,disabled:!!this.coinVideoReason(),run:()=>{void this.claimCoinVideo();}});
    if(hint){
      actions.push({label:`${HINT_COIN_COST} 金币 · 调整一处镜面`,disabled:this.coins<HINT_COIN_COST,run:()=>{
        if(this.coins<HINT_COIN_COST)return;
        this.coins-=HINT_COIN_COST;this.persistCoins();this.applyHint(hint);
      }});
      if(ads?.canReward('hint'))actions.push({label:'看视频 · 免费调整一处镜面',disabled:!this.bonusAvailable(),run:()=>{void this.watchReward('hint',()=>{this.applyHint(hint);return 1;});}});
    }
    actions.push({label:'查看玩法与攻略',run:()=>this.openCommunityHub(),primary:actions.length===0});
    const bonusCount=ads?.canReward('coins')||ads?.canReward('hint')?`\n今日额外奖励剩余 ${bonusRemaining(this.platform,WECHAT_OPERATIONS.rewards.dailyBonusLimit)} 次`:'';
    this.view.showSupport({title:'补给与提示',body:`金币 ${this.coins}  ·  爱心 ${state.hearts} / ${MAX_HEARTS}${bonusCount}\n${state.level.timeBoss?'章节挑战请根据光束变化及时调整镜面':hint?'提示会调整一处镜面，剩余光路由你完成':'光路准备好后，按住发射试一试'}`,actions});
    ads?.preloadRewards(['hearts','coins','hint']);
    this.audio.play('uiClick');this.wake();
  }

  private applyHint(hint:MirrorHint){
    this.supportScreen=null;this.view.hideSupport();
    // Finish the current teaching card before making a rewarded adjustment.
    this.tutorial.skip();this.syncTutorial();
    for(let turn=0;turn<hint.turns;turn++)this.session.rotateAt(hint.x,hint.y);
    this.view.mirrorRotateFeedback(hint.x,hint.y,nowMs());
    this.view.showToast(hint.text,nowMs());this.wake();
  }

  private async watchReward(placement:RewardPlacement,grant:()=>number){
    const ads=this.platform.ads;
    if(this.operationBusy||!ads?.canReward(placement))return;
    if(placement!=='hearts'&&!this.bonusAvailable()){
      this.view.showToast('今日额外奖励已领完，明天再来',nowMs());this.wake();return;
    }
    const state=this.session.state,generation=this.operationGeneration,context=this.context();
    this.operationBusy=true;this.cancelFireCharge();this.collectPendingCoins();
    this.view.setInteractionBlocked(true);this.view.showToast('正在准备视频…',nowMs());this.wake();
    try{
      const outcome=await ads.showReward(placement,context);
      if(this.destroyed||state!==this.session.state||generation!==this.operationGeneration)return;
      if(outcome==='rewarded'){
        if(placement==='coins'&&this.coinVideoReason()){this.view.showToast(this.coinVideoReason()!,nowMs());return;}
        if(placement!=='hearts'&&!consumeBonus(this.platform,WECHAT_OPERATIONS.rewards.dailyBonusLimit)){
          this.view.showToast('今日额外奖励已领完',nowMs());return;
        }
        if(placement==='coins')consumeBonus(this.platform,WECHAT_OPERATIONS.rewards.coinsDailyLimit,Date.now(),COIN_AD_USAGE_KEY);
        const amount=grant();ads.reportReward(placement,context,amount);
      }else this.view.showToast(outcome==='cancelled'?'视频未看完，未领取奖励':outcome==='busy'?'请先关闭当前页面':'视频暂时不可用，请稍后重试',nowMs());
    }catch{if(!this.destroyed)this.view.showToast('视频暂时不可用，请稍后重试',nowMs());}
    finally{this.operationBusy=false;if(!this.destroyed){this.view.setInteractionBlocked(false);this.refreshHeartRecovery();this.wake();}}
  }

  private coinVideoReason():string|null{
    if(this.coins>=WECHAT_OPERATIONS.rewards.coinSupplyThreshold)return'金币储备充足，先使用金币补给';
    if(!this.bonusAvailable()||bonusRemaining(this.platform,WECHAT_OPERATIONS.rewards.coinsDailyLimit,Date.now(),COIN_AD_USAGE_KEY)<=0)return'今日金币补给已领完，明天再来';
    if(!this.platform.ads?.canReward('coins'))return'金币视频暂未开放，首通关卡可获得金币';
    return null;
  }

  private async claimCoinVideo(){
    if(this.operationBusy||this.session.state.firing)return;
    const reason=this.coinVideoReason();
    if(reason){this.view.showToast(reason,nowMs());this.wake();return;}
    await this.watchReward('coins',()=>{
      const amount=WECHAT_OPERATIONS.rewards.coinsPerVideo;
      this.coins+=amount;this.persistCoins();
      if(this.supportScreen==='hearts'&&this.view.support.visible)this.renderHeartShop();else{this.supportScreen=null;this.view.hideSupport();}
      this.view.showToast(`已获得 ${amount} 金币`,nowMs());return amount;
    });
  }

  private async claimWinBonus(){
    if(!this.session.state.won||!this.view.result.visible||this.winBonusClaimed||this.winRewardAmount<=0)return;
    await this.watchReward('double',()=>{
      this.winBonusClaimed=true;this.winInterstitialDue=false;
      const amount=this.winRewardAmount;
      this.coins+=amount;this.persistCoins();
      this.view.result.markBonusClaimed();this.view.result.setRewardTotal(amount*2);
      this.view.startWinCoins(nowMs(),this.coins-amount,amount);this.view.revealWinCoins();
      this.view.showToast('已领取双倍金币',nowMs());return amount;
    });
  }

  private async leaveWin(continueGame:()=>void){
    if(this.operationBusy)return;
    const state=this.session.state;
    const due=this.winInterstitialDue&&!this.winBonusClaimed;
    this.winInterstitialDue=false;
    if(!due||!this.platform.ads){continueGame();return;}
    this.operationBusy=true;this.view.setInteractionBlocked(true);
    try{await this.platform.ads.showInterstitial(this.context());}
    catch{/* No fill or SDK failures never block continuation. */}
    finally{
      this.operationBusy=false;
      if(!this.destroyed){this.view.setInteractionBlocked(false);if(state===this.session.state)continueGame();this.wake();}
    }
  }

  private openCommunityHub(){
    if(this.operationBusy||this.session.state.firing)return;
    this.cancelFireCharge();this.supportScreen='community';
    const community=this.platform.community,actions:SupportAction[]=[];
    for(const [target,label] of [['club','游戏圈 · 攻略交流'],['help','卡关求助与问题反馈'],['recommend','推荐给微信好友'],['circleRecommend','分享到游戏圈推荐']] as const){
      if(community?.canOpen(target))actions.push({label:target==='recommend'&&community.isRecommended()?'已推荐 · 查看推荐':label,run:()=>{void this.openCommunity(target);}});
    }
    if(this.platform.canShare?.())actions.push({label:'分享当前关卡给好友',run:()=>{this.platform.shareAppMessage?.(this.createShareContent());}});
    actions.push({label:'返回游戏',run:()=>{this.view.hideSupport();this.wake();}});
    const clubReady=community?.canOpen('club');
    this.view.showSupport({title:'攻略与交流',body:`${this.session.state.level.timeBoss?'章节挑战：发射后根据光束变化及时调整镜面':'旋转镜面，让光束到达所有接收器'}\n${clubReady?'卡关时可到游戏圈交流解题思路':'先规划路线，再按住发射；失败后可以继续调整'}`,actions});
    this.audio.play('uiClick');this.wake();
  }

  private async openCommunity(target:CommunityTarget){
    if(this.operationBusy||this.session.state.firing)return;
    const community=this.platform.community;
    if(!community?.canOpen(target))return;
    // A failure-page help button goes directly to the configured help post.
    if(target==='club'&&this.view.result.visible&&!this.session.state.won)target='help';
    this.operationBusy=true;this.cancelFireCharge();this.view.setInteractionBlocked(true);
    this.syncNativeMenuAd();
    try{
      const result=await community.open(target,this.context());
      if(this.destroyed)return;
      if(result!=='opened')this.view.showToast(result==='busy'?'请先关闭当前页面':'页面暂时无法打开，请稍后再试',nowMs());
    }catch{if(!this.destroyed)this.view.showToast('页面暂时无法打开，请稍后再试',nowMs());}
    finally{this.operationBusy=false;if(!this.destroyed){this.view.setInteractionBlocked(false);this.wake();}}
  }

  private syncNativeMenuAd(){
    if(!this.view)return;
    this.view.setMenuAdSize(this.platform.ads?.menuSize()??null);
    this.platform.ads?.setMenuPlacement(!this.loading&&!this.destroyed&&this.appVisible&&!this.externalActive&&!this.operationBusy?this.view.menuAdRect():null);
  }
  private vibrate(type:HapticKind){
    if(!this.hapticsEnabled)return;
    if(!this.hapticGate.allows(type,nowMs()))return;
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
    this.syncNativeMenuAd();
    try{this.app.renderer.render(this.app.stage);}catch(error){console.warn('[game] render failed',error);}
  }
  destroy(){this.destroyed=true;this.clearHeartRecoveryTimer();this.operationGeneration++;this.platform.community?.destroy();this.platform.ads?.destroy();this.loading?.dispose();this.loading=null;this.pendingResult=null;this.cancelFireCharge();this.clearFireWatchdog();this.platform.cancelHaptics?.();this.unresize();this.unaudio();this.unexternal();this.unmenu();this.music.destroy();this.audio.destroy();this.view?.destroy();this.app.destroy(true);}
}
