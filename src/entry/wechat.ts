import 'pixi.js/unsafe-eval';
import { GameApplication } from '@/app/GameApplication';
import { installMiniGamePixiAdapter } from '@/platform/minigame/MiniGamePixiAdapter';
import { WeChatPlatform } from '@/platform/wechat/WeChatPlatform';

const api=(globalThis as any).wx;
const boot=(globalThis as any).__laserMirrorBoot;

function reportBootError(error:any){
  if(boot){boot.fail(error);return;}
  const summary=[error?.name,error?.message].filter(Boolean).join(': ');
  const stack=String(error?.stack??'');
  let raw='';
  try{raw=String(error??'Unknown startup error');}catch{}
  let fields='';
  try{fields=JSON.stringify(Object.keys(error??{}).reduce((out:any,key)=>{out[key]=String(error[key]);return out;},{}));}catch{}
  const detail=[summary,raw,fields,stack].filter(Boolean).join('\n\n');
  console.error(error);
  api?.showModal?.({title:'游戏启动失败',content:detail.slice(0,900),showCancel:false});
}

try{
  boot?.phase('adapter');
  installMiniGamePixiAdapter(api);
  const platform=new WeChatPlatform(api);
  // Reserve the first (display) canvas before any engine capability probes.
  const canvas=platform.createCanvas();
  boot?.phase('application');
  new GameApplication(platform).start(canvas,{onBootPhase:phase=>boot?.phase(phase)}).catch(reportBootError);
}catch(error){
  reportBootError(error);
}
