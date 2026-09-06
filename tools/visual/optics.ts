import { Application } from 'pixi.js';
import { GameConfig } from '../../src/config/GameConfig';
import { GameSession, type GameEvent } from '../../src/gameplay/GameSession';
import { laserMsAtDistance } from '../../src/gameplay/laserTiming';
import { PerformanceManager } from '../../src/performance/PerformanceManager';
import { PixiGameView } from '../../src/rendering/PixiGameView';
import { setActiveTheme, Theme, type ThemeId } from '../../src/rendering/theme';
import { boardFixture, chainedFixture, collectorFixture, transportedFixture, mechanismsFixture, denseMechanismsFixture } from '../../scripts/fixtures/optics';
import campaign from '../../src/levels/levels.json';
import solvedCampaign from './campaign-solutions.json';
import type { LevelDefinition } from '../../src/gameplay/types';

const stage=document.querySelector<HTMLDivElement>('#stage')!;
const status=document.querySelector<HTMLOutputElement>('#status')!;
const scene=document.querySelector<HTMLSelectElement>('#scene')!;
const theme=document.querySelector<HTMLSelectElement>('#theme')!;
const renderer=document.querySelector<HTMLSelectElement>('#renderer')!;
const fixtures:Record<string,LevelDefinition>={collector:collectorFixture,chain:chainedFixture,transport:transportedFixture,board:boardFixture,mechanisms:mechanismsFixture,dense:denseMechanismsFixture};
campaign.forEach((level,index)=>{
  const number=index+1;
  fixtures[`level-${number}`]=level as LevelDefinition;
  fixtures[`solved-${number}`]=(solvedCampaign as Record<string,LevelDefinition>)[number];
  scene.add(new Option(`${number} · ${level.name} · 开局`,`level-${number}`));
  scene.add(new Option(`${number} · ${level.name} · 解法`,`solved-${number}`));
});
const preset=new URLSearchParams(location.search);
for(const select of [scene,theme,renderer]){
  const value=preset.get(select.id);
  if(value&&[...select.options].some(option=>option.value===value))select.value=value;
}
const app=new Application();
await app.init({width:stage.clientWidth,height:stage.clientHeight,resolution:Math.min(devicePixelRatio,2),autoDensity:true,
  antialias:true,preference:'webgl',background:Theme.bg});
stage.append(app.canvas);
const quality=new PerformanceManager();
let session:GameSession,view:PixiGameView,clock=0,playing=false,overlay=false;

function event(e:GameEvent){
  if(e.type==='state'||e.type==='level')view.sync(session.state);
  if(e.type==='impact')view.impact(e.impact,clock);
  if(e.type==='shot-start')view.shotStart(session.state,clock);
  if(e.type==='laser-launch')view.laserLaunch(session.state,clock);
  if(e.type==='rotate'){view.rotateItem(e.x,e.y,e.s,e.dir);view.mirrorRotateFeedback(e.x,e.y,clock);}
}
function resize(){
  app.renderer.resize(stage.clientWidth,stage.clientHeight);
  view?.resize(stage.clientWidth,stage.clientHeight);
}
function build(){
  playing=false;overlay=false;clock=0;view?.destroy();
  setActiveTheme(theme.value as ThemeId);app.renderer.background.color=Theme.bg;
  const level=fixtures[scene.value as keyof typeof fixtures];
  quality.quality=renderer.value==='gpu'?'high':'low';
  session=new GameSession([level]);
  view=new PixiGameView(app.renderer,quality,theme.value as ThemeId,[level],renderer.value==='gpu');
  app.stage.addChild(view.root);session.on(event);view.sync(session.state);
  view.setHandlers({rotate:(x,y)=>session.rotateAt(x,y),fire:()=>play(),reset:()=>reset(),openSettings:()=>showOverlay(),
    toggleAudio:()=>{},toggleHaptics:()=>{},selectTheme:()=>{},closeSettings:()=>showOverlay(),openLevels:()=>{},
    selectLevel:()=>{},unlockAllLevels:()=>{},clearHistory:()=>{},uiChanged:()=>{},resultPrimary:()=>{},resultSecondary:()=>{},resultPreview:()=>{},resultLevels:()=>{},closePoster:()=>{},savePoster:()=>{},coinSound:()=>{}});
  resize();view.update(session.state,clock);report();
}
function reset(){playing=false;overlay=false;clock=0;session.reset();view.hideOverlays();view.update(session.state,clock);report();}
function play(){playing=false;overlay=false;clock=0;view.hideOverlays();session.fire();session.update(clock);playing=true;report();}
function showOverlay(){overlay=!overlay;if(overlay)view.showSettings(true,true,theme.value as ThemeId);else view.closeSettings();report();}
function seek(phase:string){
  reset();session.fire();session.update(0);
  const trace=session.state.result!,pulse=Object.values(trace.combinerPulses)[0];
  const hits=trace.impactEvents.filter(e=>e.type==='combiner');
  const sw=trace.impactEvents.find(e=>e.type==='switch');
  const door=trace.impactEvents.find(e=>e.type==='door-open');
  let t:number;
  if(phase==='signal'&&sw)t=laserMsAtDistance(sw.at)+GameConfig.laser.doorSignalMs*.5;
  else if(phase==='opening'&&door)t=laserMsAtDistance(door.at)-GameConfig.laser.doorOpenMs*.5;
  else if(phase==='open'&&door)t=laserMsAtDistance(door.at)+80;
  else if(pulse&&hits.length)t=phase==='partial'?laserMsAtDistance(hits[0].at)+90:phase==='charge'?pulse.readyMs+750:pulse.launchMs+210;
  else {report();return;}
  const end=t+GameConfig.laser.chargeMs;
  for(clock=10;clock<end;clock+=10){session.update(clock);view.update(session.state,clock);}
  clock=end;session.update(clock);view.update(session.state,clock);report();
}
function report(){
  const s=session.state,counts=Object.entries(s.combinerHits).map(([key,count])=>`${key}: ${count}${s.combinerOn[key]?' → 已释放':''}`);
  const widest=Math.max(1,...(s.result?.segments.filter(p=>p.startDist<s.beamDistance).map(p=>p.widthScale??1)??[]));
  status.value=`${s.won?'已接通':s.firing?'发射中':'待发射'} · ${(s.shotElapsedMs/1000).toFixed(2)} s\n集光 ${counts.join(' / ')||'0'}\n开关 ${[...s.activeSwitches].join('、')||'无'} · 开门 ${Object.keys(s.activeDoorStates).filter(id=>s.activeDoorStates[id]).join('、')||'无'}\n当前光束 ${widest}×\n动画 ${view.active?'运行':'静止'}${playing?' · 播放':' · 定格'}`;
}
document.querySelector('#play')!.addEventListener('click',play);
document.querySelector('#pause')!.addEventListener('click',()=>{playing=!playing;report();});
document.querySelector('#reset')!.addEventListener('click',reset);
document.querySelector('#overlay')!.addEventListener('click',showOverlay);
document.querySelectorAll<HTMLButtonElement>('[data-phase]').forEach(button=>button.addEventListener('click',()=>seek(button.dataset.phase!)));
for(const select of [scene,theme,renderer])select.addEventListener('change',()=>{
  // Theme materials belong to the renderer. A fresh document also makes each
  // comparison independent of old pooled GPU resources and transient effects.
  const params=new URLSearchParams({scene:scene.value,theme:theme.value,renderer:renderer.value});
  location.search=params.toString();
});
new ResizeObserver(resize).observe(stage);
build();
if(preset.has('phase'))seek(preset.get('phase')!);
else if(preset.has('play'))play();
app.ticker.add(tick=>{
  if(playing||!session.state.firing){clock+=Math.min(40,tick.deltaMS);session.update(clock);view.update(session.state,clock);}
  report();
});
