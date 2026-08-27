import { Application } from 'pixi.js';
import { AudioManager } from '@/audio/AudioManager';
import { GameConfig } from '@/config/GameConfig';
import { nowMs } from '@/core/clock';
import { GameSession } from '@/gameplay/GameSession';
import { LevelRepository } from '@/levels/LevelRepository';
import { PerformanceManager } from '@/performance/PerformanceManager';
import type { IPlatform } from '@/platform/IPlatform';
import { PixiGameView } from '@/rendering/PixiGameView';

export class GameApplication {
  private app=new Application();
  private session:GameSession;
  private view!:PixiGameView;
  private perf=new PerformanceManager();
  private audio:AudioManager;
  private unresize=()=>{};

  constructor(private readonly platform:IPlatform){
    const repo=new LevelRepository();
    this.session=new GameSession(repo.levels);
    this.audio=new AudioManager(platform);
  }

  async start(canvas?:any){
    const v=this.platform.viewport();
    const targetCanvas=canvas??this.platform.createCanvas?.();
    await this.app.init({
      width:v.width,height:v.height,canvas:targetCanvas,background:0x090d16,
      preference:GameConfig.renderer.preference,preferWebGLVersion:GameConfig.renderer.preferWebGLVersion,
      powerPreference:'high-performance',antialias:GameConfig.renderer.antialias,
      resolution:Math.min(v.pixelRatio,GameConfig.renderer.maxResolution),autoDensity:this.platform.kind==='web',autoStart:false
    });

    this.platform.attachCanvas(this.app.canvas);
    this.view=new PixiGameView(this.app.renderer,this.perf,50);
    this.app.stage.addChild(this.view.root);
    this.view.resize(v.width,v.height);

    this.view.setHandlers({
      rotate:(x,y)=>{
        if(this.session.state.firing||this.session.state.won)return;
        const now=nowMs();
        this.session.rotateAt(x,y);
        this.view.mirrorRotateFeedback(x,y,now);
        this.audio.play('mirrorRotate');
        this.platform.vibrate('light');
        this.wake();
      },
      fire:()=>{this.session.fire(nowMs());this.wake();},
      reset:()=>{this.audio.play('uiClick');this.session.reset();},
      next:()=>{this.audio.play('uiClick');this.session.next();}
    });

    this.session.on(event=>{
      const now=nowMs();
      if(event.type==='state'||event.type==='level'){
        this.view.sync(this.session.state);this.renderOnce();
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
      if(event.type==='toast'){this.view.showToast(event.text,now);this.wake();}
      if(event.type==='shot-start'){
        this.audio.play('laserCharge');
        this.view.shotStart(this.session.state,now);this.wake();
      }
      if(event.type==='laser-launch') this.audio.play('laserFire');
      if(event.type==='shot-end'&&!event.success) this.audio.play('shotFail');
      if(event.type==='victory'){
        this.audio.play('victory');
        this.view.victory(now,this.session.state);this.platform.vibrate('medium');this.wake();
      }
    });

    this.view.sync(this.session.state);
    this.app.ticker.add((t:any)=>{
      const now=nowMs();
      this.perf.frame(t.deltaMS);
      const logicActive=this.session.update(now);
      this.view.update(this.session.state,now);
      if(!logicActive&&!this.view.active){this.app.ticker.stop();this.renderOnce();}
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
  destroy(){this.unresize();this.audio.destroy();this.view?.destroy();this.app.destroy(true);}
}
