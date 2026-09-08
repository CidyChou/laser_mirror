import { Application, Container } from 'pixi.js';
import { PixiGameView } from '../../src/rendering/PixiGameView';
import { GameSession } from '../../src/gameplay/GameSession';
import { PerformanceManager } from '../../src/performance/PerformanceManager';
import { setActiveTheme, type ThemeId } from '../../src/rendering/theme';
import { transportedFixture } from '../../scripts/fixtures/optics';
import { ParticleSystem } from '../../src/rendering/effects/ParticleSystem';
const app=new Application();
await app.init({width:360,height:700,preference:'webgl',autoStart:false,antialias:true});
document.body.append(app.canvas);
const output=document.querySelector<HTMLOutputElement>('#result')!;
document.querySelector('#run')!.addEventListener('click',()=>{
  let cycles=0;
  try{
    for(;cycles<20;cycles++){
      const root=new Container(),particles=new ParticleSystem(app.renderer);
      root.addChild(particles.container);
      particles.emit(180,350,0xff5578,24,60);
      app.renderer.render(root);
      particles.destroy();root.destroy({children:true});
    }
    for(let i=0;i<12;i++){
      const theme=(['void','aurora','atelier'] as ThemeId[])[i%3];setActiveTheme(theme);
      const session=new GameSession([transportedFixture]);
      const view=new PixiGameView(app.renderer,new PerformanceManager(),theme,[transportedFixture],i%2===0);
      app.stage.addChild(view.root);view.resize(360,700);view.sync(session.state);
      session.on(event=>{
        if(event.type==='state'||event.type==='level')view.sync(session.state);
        if(event.type==='impact')view.impact(event.impact,session.state.shotElapsedMs);
        if(event.type==='shot-start')view.shotStart(session.state,0);
        if(event.type==='laser-launch')view.laserLaunch(session.state,session.state.shotElapsedMs);
      });
      try{
        for(let shot=0;shot<2;shot++){
          session.reset();session.fire();session.update(0);
          for(let time=0;time<=6500;time+=100){
            session.update(time);view.update(session.state,time);app.renderer.render(app.stage);
          }
        }
      }finally{view.destroy();}
    }
    output.value=`PASS: ${cycles} 次粒子创建 → 渲染 → 销毁 → 重建\nPASS: 12 次完整画面重建，3 套主题，GPU / Graphics，24 次发射与重置`;
  }catch(error){output.value=`FAIL: 第 ${cycles+1} 次渲染\n${(error as Error).stack}`;}
});
