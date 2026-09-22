import { Application, Assets, Texture } from 'pixi.js';
import { AudioManager } from '../../src/audio/AudioManager';
import { WebPlatform } from '../../src/platform/web/WebPlatform';
import { GameConfig } from '../../src/config/GameConfig';
import { GameSession, type GameEvent } from '../../src/gameplay/GameSession';
import { laserMsAtDistance } from '../../src/gameplay/laserTiming';
import { PerformanceManager } from '../../src/performance/PerformanceManager';
import { PixiGameView } from '../../src/rendering/PixiGameView';
import { normalizeThemeId, setActiveTheme, Theme } from '../../src/rendering/theme';
import { boardFixture, chainedFixture, collectorFixture, transportedFixture, mechanismsFixture, denseMechanismsFixture } from '../../scripts/fixtures/optics';
import campaign from '../../src/levels/levels.json';
import solvedCampaign from './campaign-solutions.json';
import type { LevelDefinition } from '../../src/gameplay/types';
import { applyLaserPalette, LASER_PALETTES } from './laser-palettes';

const stage=document.querySelector<HTMLDivElement>('#stage')!;
const status=document.querySelector<HTMLOutputElement>('#status')!;
const scene=document.querySelector<HTMLSelectElement>('#scene')!;
const theme=document.querySelector<HTMLSelectElement>('#theme')!;
const renderer=document.querySelector<HTMLSelectElement>('#renderer')!;
const laserColor=document.querySelector<HTMLSelectElement>('#laser-color')!;
const colorPreview=document.querySelector<HTMLDivElement>('#laser-color-preview')!;
for(const palette of LASER_PALETTES)laserColor.add(new Option(palette.name,palette.id));
const fixtures:Record<string,LevelDefinition>={collector:collectorFixture,chain:chainedFixture,transport:transportedFixture,board:boardFixture,mechanisms:mechanismsFixture,dense:denseMechanismsFixture};
campaign.forEach((level,index)=>{
  const number=index+1;
  fixtures[`level-${number}`]=level as LevelDefinition;
  const solved=(solvedCampaign as Record<string,LevelDefinition>)[number];
  if(solved)fixtures[`solved-${number}`]=solved;
  scene.add(new Option(`${number} · ${level.name} · 开局`,`level-${number}`));
  if(solved)scene.add(new Option(`${number} · ${level.name} · 解法`,`solved-${number}`));
});
const preset=new URLSearchParams(location.search);
for(const select of [scene,theme,renderer,laserColor]){
  const value=preset.get(select.id);
  if(value&&[...select.options].some(option=>option.value===value))select.value=value;
}
const app=new Application();
await app.init({width:stage.clientWidth,height:stage.clientHeight,resolution:Math.min(devicePixelRatio,2),autoDensity:true,
  antialias:true,preference:'webgl',preferWebGLVersion:preset.get('webgl')==='1'?1:2,background:Theme.bg});
stage.append(app.canvas);
const quality=new PerformanceManager();
const assetBase=new URL('../../',location.href).href;
const rewardAudio=new AudioManager(new WebPlatform(), `${assetBase}audio/`);
let rewardAudioEnabled=true;
const rewardTextures=await Promise.all(['coin','crown'].map(async key=>{
  try { return await Assets.load<Texture>(`${assetBase}ui/victory-${key}.png`); }
  catch { return Texture.EMPTY; }
}));
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
  playing=false;overlay=false;clock=0;
  session=new GameSession([fixtures[scene.value]]);session.on(event);
  mountView();
}
function mountView(){
  view?.destroy();
  setActiveTheme(normalizeThemeId(theme.value));app.renderer.background.color=Theme.bg;
  applyLaserPalette(Theme,laserColor.value);
  const colors=[Theme.laserMist,Theme.beam2,Theme.laserBody,Theme.laserPlasma,Theme.laserCore,Theme.laserPlasma,Theme.laserBody,Theme.beam2,Theme.laserMist];
  colorPreview.style.background=`linear-gradient(90deg,${colors.map(color=>`#${color.toString(16).padStart(6,'0')}`).join(',')})`;
  const level=session.state.level;
  quality.quality=renderer.value==='fallback'?'low':'high';
  view=new PixiGameView(app.renderer,quality,normalizeThemeId(theme.value),[level],renderer.value==='gpu');
  app.stage.addChild(view.root);view.sync(session.state);
  view.setUiTexture('coin',rewardTextures[0]);
  view.setUiTexture('crown',rewardTextures[1]);
  view.setHandlers({rotate:(x,y)=>session.rotateAt(x,y),firePressStart:()=>play(),firePressEnd:()=>{},bulletTime:()=>session.startBulletTime(),reset:()=>reset(),openSettings:()=>showOverlay(),
    tutorialNext:()=>{},tutorialSkip:()=>{},tutorialTap:()=>{},replayTutorial:()=>{},canSelectLevel:()=>false,
    toggleAudio:()=>{},toggleHaptics:()=>{},selectTheme:()=>{},closeSettings:()=>showOverlay(),openLevels:()=>{},
    selectLevel:()=>{},unlockAllLevels:()=>{},clearHistory:()=>{},uiChanged:()=>{},resultPrimary:()=>{},resultSecondary:()=>{},resultPreview:()=>{},resultLevels:()=>{},closePoster:()=>{},savePoster:()=>{},coinSound:()=>rewardAudio.play('coin')});
  resize();view.update(session.state,clock);report();
}
function reset(){playing=false;overlay=false;clock=0;session.reset();view.hideOverlays();view.update(session.state,clock);report();}
function play(){playing=false;overlay=false;clock=0;view.hideOverlays();session.fire();session.update(clock);playing=true;report();}
function showOverlay(){overlay=!overlay;if(overlay)view.showSettings(true,true,normalizeThemeId(theme.value));else view.closeSettings();report();}
function seek(phase:string){
  reset();session.fire();session.update(0);
  const trace=session.state.result!,pulse=Object.values(trace.combinerPulses)[0];
  const hits=trace.impactEvents.filter(e=>e.type==='combiner');
  const sw=trace.impactEvents.find(e=>e.type==='switch');
  const door=trace.impactEvents.find(e=>e.type==='door-open');
  const portal=trace.impactEvents.find(e=>e.type==='portal');
  const mirror=trace.impactEvents.find(e=>e.type==='mirror');
  let t:number;
  if(phase==='launch')t=80;
  else if(phase==='reflection'&&mirror)t=laserMsAtDistance(mirror.at)+65;
  else if(portal&&phase.startsWith('portal-'))t=laserMsAtDistance(portal.at)+(phase==='portal-enter'?80:phase==='portal-wait'?360:GameConfig.laser.portalTransitMs+80);
  else if(phase==='complete'||phase==='poster')t=laserMsAtDistance(trace.maxTravel)+800;
  else if(phase==='signal'&&sw)t=laserMsAtDistance(sw.at)+GameConfig.laser.doorSignalMs*.5;
  else if(phase==='opening'&&door)t=laserMsAtDistance(door.at)-GameConfig.laser.doorOpenMs*.5;
  else if(phase==='open'&&door)t=laserMsAtDistance(door.at)+80;
  else if(pulse&&hits.length)t=phase==='partial'?laserMsAtDistance(hits[0].at)+90:phase==='charge'?pulse.readyMs+750:pulse.launchMs+210;
  else {report();return;}
  const end=t+GameConfig.laser.chargeMs;
  for(clock=10;clock<end;clock+=10){session.update(clock);view.update(session.state,clock);}
  clock=end;session.update(clock);view.update(session.state,clock);report();
  if(phase==='poster'&&session.state.won){
    showPoster();
  }
}
function showPoster(){
  const number=scene.value.match(/^(?:solved|level)-(\d+)$/)?.[1];
  view.showWinPreview({stageLabel:number?`第 ${number} 关`:session.state.level.name,comboCount:session.state.comboCount},clock-600);
  view.update(session.state,clock);
}
function report(){
  const s=session.state,counts=Object.entries(s.combinerHits).map(([key,count])=>`${key}: ${count}${s.combinerOn[key]?' → 已释放':''}`);
  const widest=Math.max(1,...(s.result?.segments.filter(p=>p.startDist<s.beamDistance).map(p=>p.widthScale??1)??[]));
  status.value=`${s.won?'已接通':s.firing?'发射中':'待发射'} · ${(s.shotElapsedMs/1000).toFixed(2)} s\n集光 ${counts.join(' / ')||'0'}\n开关 ${[...s.activeSwitches].join('、')||'无'} · 开门 ${Object.keys(s.activeDoorStates).filter(id=>s.activeDoorStates[id]).join('、')||'无'}\n当前光束 ${widest}×\n动画 ${view.active?'运行':'静止'}${playing?' · 播放':' · 定格'}`;
}
document.querySelector('#play')!.addEventListener('click',play);
document.querySelector('#pause')!.addEventListener('click',()=>{playing=!playing;report();});
document.querySelector('#reset')!.addEventListener('click',reset);
document.querySelector('#coins')!.addEventListener('click',()=>{
  reset();
  rewardAudio.play('uiClick',.4);
  view.showResult('win',{title:'通关成功',subtitle:'金币动效预览',tip:'放大悬浮 → 加速入账',primary:'下一关',reward:12},clock);
  view.startWinCoins(clock,100,12);
  view.revealWinCoins();
  playing=true;
  view.update(session.state,clock);report();
});
document.querySelector('#coin-audio')!.addEventListener('click',event=>{
  rewardAudioEnabled=!rewardAudioEnabled;
  rewardAudio.setEnabled(rewardAudioEnabled);
  const button=event.currentTarget as HTMLButtonElement;
  button.textContent=`金币音效：${rewardAudioEnabled?'开':'关'}`;
  button.setAttribute('aria-pressed',String(rewardAudioEnabled));
});
window.addEventListener('pagehide',()=>rewardAudio.destroy(),{once:true});
document.querySelector('#overlay')!.addEventListener('click',showOverlay);
document.querySelectorAll<HTMLButtonElement>('[data-phase]').forEach(button=>button.addEventListener('click',()=>seek(button.dataset.phase!)));
laserColor.addEventListener('change',()=>{
  const posterVisible=view.poster.visible;
  // Recreate colour-dependent textures while preserving the live simulation,
  // mirror arrangement, playback clock and paused frame for a fair comparison.
  mountView();
  if(posterVisible)showPoster();
  else if(overlay)view.showSettings(true,true,normalizeThemeId(theme.value));
  if(!session.state.result)play();
  const params=new URLSearchParams(location.search);
  params.set(laserColor.id,laserColor.value);
  history.replaceState(null,'',`${location.pathname}?${params}`);
});
for(const select of [scene,theme,renderer])select.addEventListener('change',()=>{
  // Theme materials belong to the renderer. A fresh document also makes each
  // comparison independent of old pooled GPU resources and transient effects.
  const params=new URLSearchParams(location.search);
  for(const control of [scene,theme,renderer,laserColor])params.set(control.id,control.value);
  params.delete('play');params.delete('phase');
  if(session.state.result)params.set('phase','complete');
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
