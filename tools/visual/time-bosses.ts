import { Application } from 'pixi.js';
import { GameSession } from '../../src/gameplay/GameSession';
import { PerformanceManager } from '../../src/performance/PerformanceManager';
import { PixiGameView } from '../../src/rendering/PixiGameView';
import { setActiveTheme,Theme,type ThemeId } from '../../src/rendering/theme';
import campaign from '../../src/levels/levels.json';
import { designBoss } from '../../scripts/time-boss-designs';
import type { LevelDefinition } from '../../src/gameplay/types';

const params=new URLSearchParams(location.search),number=Number(params.get('level')||10);
const theme=(params.get('theme')||'void') as ThemeId,renderer=params.get('renderer')||'gpu';
for(const id of ['level','theme','renderer']){
  const select=document.querySelector<HTMLSelectElement>(`#${id}`)!;
  if(id==='level')for(let n=10;n<=130;n+=10)select.add(new Option(`第${n}关`,String(n)));
  select.value=id==='level'?String(number):id==='theme'?theme:renderer;
  select.onchange=()=>{params.set(id,select.value);location.search=params.toString();};
}
setActiveTheme(theme);
const stage=document.querySelector<HTMLDivElement>('#stage')!,app=new Application();
await app.init({width:375,height:812,resolution:2,autoDensity:true,preference:'webgl',background:Theme.bg});stage.append(app.canvas);
const design=designBoss(number,campaign[number-1] as LevelDefinition),fixtures=Array.from({length:number},()=>design.level),session=new GameSession(fixtures,5,number-1);
const view=new PixiGameView(app.renderer,new PerformanceManager(),theme,fixtures,renderer==='gpu');
app.stage.addChild(view.root);
let clock=0,auto=false,paused=false,next=0,rotate:Array<[number,number]>|null=null;
session.on(e=>{
  if(e.type==='state'||e.type==='level')view.sync(session.state);
  if(e.type==='impact')view.impact(e.impact,clock);
  if(e.type==='timeline-rollback')view.rollbackEffects();
  if(e.type==='shot-start')view.shotStart(session.state,clock);
  if(e.type==='laser-launch')view.laserLaunch(session.state,clock);
  if(e.type==='rotate')view.rotateItem(e.x,e.y,e.s,e.dir);
});
const fire=()=>{if(session.state.firing)session.endTimeShot();else{session.fire();session.update(clock);}};
view.setHandlers({rotate:(x,y)=>session.rotateAt(x,y),fire,bulletTime:()=>session.startBulletTime(),rewindTime:()=>session.startRewind(),reset:()=>{},openSettings:()=>{},closeSettings:()=>{},toggleAudio:()=>{},toggleHaptics:()=>{},selectTheme:()=>{},openLevels:()=>{},selectLevel:()=>{},canSelectLevel:()=>false,unlockAllLevels:()=>{},clearHistory:()=>{},uiChanged:()=>{},resultPrimary:()=>{},resultSecondary:()=>{},resultPreview:()=>{},resultLevels:()=>{},closePoster:()=>{},savePoster:()=>{},coinSound:()=>{}});
view.sync(session.state);view.resize(375,812);
document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>{session.reset();next=0;rotate=null;auto=true;paused=false;fire();};
document.querySelector<HTMLButtonElement>('#pause')!.onclick=()=>{paused=!paused;};
document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{session.reset();auto=false;paused=false;};
function step(delta:number){
  if(!paused){
    clock+=Math.min(delta,100);session.update(clock);
    const t=session.state.timeSkill!;
    if(rotate&&t.canOperate){for(const[x,y]of rotate)session.rotateAt(x,y);rotate=null;}
    const action=design.actions[next];
    if(auto&&session.state.firing&&action&&session.state.shotElapsedMs-480>=action.at&&t.phase==='idle'){
      const ok=action.skill==='adjust'||session.startRewind();
      if(ok){next++;rotate=action.rotate;}
    }
    view.update(session.state,clock);
  }
  document.querySelector<HTMLOutputElement>('#status')!.value=JSON.stringify({name:design.level.name,won:session.state.won,time:session.state.shotElapsedMs,skill:session.state.timeSkill,targets:session.state.targets.map(t=>t.hit),focus:session.state.focusHits},null,2);
}
const pose=params.get('pose');
if(pose){
  auto=true;fire();
  for(let i=0;i<18000;i++){
    step(10);
    const t=session.state.timeSkill!;
    if((pose===t.phase&&t.remainingMs<(pose==='bullet'?2500:pose==='rewind'?400:2000))||(pose==='won'&&session.state.won)){paused=true;break;}
  }
}
app.ticker.add(tick=>step(tick.deltaMS));
