import { Application } from 'pixi.js';
import { AudioManager } from '@/audio/AudioManager';
import { GameConfig } from '@/config/GameConfig';
import { nowMs } from '@/core/clock';
import { GameSession } from '@/gameplay/GameSession';
import { LevelRepository } from '@/levels/LevelRepository';
import { PerformanceManager } from '@/performance/PerformanceManager';
import type { IPlatform } from '@/platform/IPlatform';
import { PixiGameView } from '@/rendering/PixiGameView';
import { loadUiAssets, uiTexture } from '@/rendering/ui/assets';

const AUDIO_STORAGE_KEY = 'laser-mirror-audio-enabled';

export class GameApplication {
  private app=new Application();
  private session:GameSession;
  private view!:PixiGameView;
  private perf=new PerformanceManager();
  private audio:AudioManager;
  private audioEnabled=true;
  private totalLevels=0;
  private pendingResult:{kind:'win'|'lose';copy:{title:string;subtitle:string;tip:string;primary:string;secondary?:string};at:number}|null=null;
  private unresize=()=>{};

  constructor(private readonly platform:IPlatform){
    const repo=new LevelRepository();
    this.totalLevels=repo.levels.length;
    this.session=new GameSession(repo.levels);
    this.audio=new AudioManager(platform);
    const saved=this.platform.storage.get(AUDIO_STORAGE_KEY);
    this.audioEnabled=saved!=='0';
    this.audio.setEnabled(this.audioEnabled);
  }

  async start(canvas?:any){
    const v=this.platform.viewport();
    const targetCanvas=canvas??this.platform.createCanvas?.();
    await this.app.init({
      width:v.width,height:v.height,canvas:targetCanvas,background:0x0d1218,
      preference:GameConfig.renderer.preference,preferWebGLVersion:GameConfig.renderer.preferWebGLVersion,
      powerPreference:'high-performance',antialias:GameConfig.renderer.antialias,
      resolution:Math.min(v.pixelRatio,GameConfig.renderer.maxResolution),autoDensity:this.platform.kind==='web',autoStart:false
    });

    this.platform.attachCanvas(this.app.canvas);
    this.view=new PixiGameView(this.app.renderer,this.perf);
    this.app.stage.addChild(this.view.root);
    this.view.resize(v.width,v.height);
    await loadUiAssets(this.platform.kind);
    this.view.setUiTexture('settings', uiTexture(this.platform.kind, 'settings'));
    this.view.setUiTexture('crown', uiTexture(this.platform.kind, 'crown'));

    this.view.setHandlers({
      rotate:(x,y)=>{
        if(this.session.state.firing||this.session.state.won||this.view.result.visible||this.view.settings.visible)return;
        const now=nowMs();
        this.session.rotateAt(x,y);
        this.view.mirrorRotateFeedback(x,y,now);
        this.audio.play('mirrorRotate');
        this.platform.vibrate('light');
        this.wake();
      },
      fire:()=>{
        if(this.view.result.visible||this.view.settings.visible)return;
        this.session.fire(nowMs());this.wake();
      },
      reset:()=>{this.pendingResult=null;this.audio.play('uiClick');this.session.reset();this.wake();},
      openSettings:()=>{
        if(this.view.result.visible)return;
        this.audio.play('uiClick');
        this.view.showSettings(this.audioEnabled);
        this.wake();
      },
      closeSettings:()=>{this.audio.play('uiClick');this.view.closeSettings();this.wake();},
      toggleAudio:()=>{
        this.audioEnabled=!this.audioEnabled;
        this.audio.setEnabled(this.audioEnabled);
        this.platform.storage.set(AUDIO_STORAGE_KEY, this.audioEnabled?'1':'0');
        this.view.setAudioEnabled(this.audioEnabled);
        if(this.audioEnabled) this.audio.play('uiClick');
        this.wake();
      },
      resultPrimary:()=>{
        this.pendingResult=null;
        this.audio.play('uiClick');
        if(this.view.result.kindValue==='win') this.session.next();
        else this.session.reset();
        this.wake();
      },
      resultSecondary:()=>{this.pendingResult=null;this.audio.play('uiClick');this.session.reset();this.wake();},
    });

    this.session.on(event=>{
      const now=nowMs();
      const state=this.session.state;
      if(event.type==='level'){this.pendingResult=null;this.view.hideOverlays();}
      if(event.type==='state'||event.type==='level'){
        this.view.sync(state);this.renderOnce();
      }
      if(event.type==='impact'){
        this.view.impact(event.impact,now);
        switch(event.impact.type){
          case 'mirror': this.audio.play('mirrorHit'); break;
          case 'splitter': this.audio.play('splitterHit'); break;
          case 'portal': this.audio.play('portal'); break;
          case 'target': this.audio.play('targetHit'); break;
          case 'switch': this.audio.play('switchOn'); break;
          case 'door': this.audio.play('mirrorHit',.55); break;
          case 'wall': this.audio.play('mirrorHit',.42); break;
        }
        if(event.impact.type==='mirror'||event.impact.type==='splitter')this.platform.vibrate('light');
        this.wake();
      }
      if(event.type==='combo'){
        this.view.showCombo(event.count, now);
        this.audio.playCombo(event.count);
        this.wake();
      }
      if(event.type==='toast'){this.view.showToast(event.text,now);this.wake();}
      if(event.type==='shot-start'){
        this.audio.play('laserCharge');
        this.view.shotStart(state,now);this.wake();
      }
      if(event.type==='laser-launch'){
        this.audio.play('laserFire');
        this.view.laserLaunch(state,now);
        this.platform.vibrate('medium');
        this.wake();
      }
      if(event.type==='shot-end'&&!event.success) this.audio.play('shotFail');
      if(event.type==='victory'){
        this.audio.play('win');
        this.view.victory(now,state);
        const copy={
          title:'通关成功',
          subtitle:`第 ${state.levelIndex+1} 关已完成`,
          tip: state.comboCount>=2 ? `本次连击 ×${state.comboCount}` : '光路接通',
          primary: state.levelIndex < this.totalLevels - 1 ? '下一关' : '再来一轮',
        };
        this.pendingResult={kind:'win',copy,at:now+(state.comboCount>=2?900:280)};
        this.platform.vibrate('medium');this.wake();
      }
      if(event.type==='defeat'){
        this.audio.play('lose');
        this.view.showResult('lose', {
          title:'挑战失败',
          subtitle:`关卡 ${state.levelIndex+1}`,
          tip:'激光次数已经用完。先把镜子路线转对，再发射。',
          primary:'重新挑战',
          secondary:'再试一次',
        }, now);
        this.wake();
      }
    });

    this.view.sync(this.session.state);
    this.app.ticker.add((t:any)=>{
      const now=nowMs();
      this.perf.frame(t.deltaMS);
      const logicActive=this.session.update(now);
      if(this.pendingResult&&now>=this.pendingResult.at){
        const pending=this.pendingResult; this.pendingResult=null;
        this.view.showResult(pending.kind, pending.copy, now);
      }
      this.view.update(this.session.state,now);
      if(!logicActive&&!this.view.active&&!this.pendingResult){this.app.ticker.stop();this.renderOnce();}
    });

    this.unresize=this.platform.onResize(next=>{
      this.app.renderer.resize(next.width,next.height);
      this.view.resize(next.width,next.height);
      if(this.platform.kind==='web'){
        const c=this.app.canvas as HTMLCanvasElement;
        c.style.width=`${next.width}px`;c.style.height=`${next.height}px`;
      }
      this.renderOnce();
    });
    this.renderOnce();
  }

  private wake(){if(!this.app.ticker.started)this.app.ticker.start();}
  private renderOnce(){this.app.renderer.render(this.app.stage);}
  destroy(){this.pendingResult=null;this.unresize();this.audio.destroy();this.view?.destroy();this.app.destroy(true);}
}
