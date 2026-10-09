import assert from 'node:assert/strict';
import { GameApplication } from '../src/app/GameApplication';
import { SHARE_IMAGE_URLS } from '../src/app/share';
import type { GameSession } from '../src/gameplay/GameSession';
import { stageId } from '../src/levels/campaign';
import { LevelRepository } from '../src/levels/LevelRepository';
import type { ShareContent, ShareContentProvider } from '../src/platform/IPlatform';
import { WeChatPlatform } from '../src/platform/wechat/WeChatPlatform';
import { WebPlatform } from '../src/platform/web/WebPlatform';

type AppProbe={session:GameSession;sharedLaunch:boolean;createShareContent:()=>ShareContent};
const levels=new LevelRepository().levels;
const handlers:{friend?:ShareContentProvider;timeline?:ShareContentProvider}={};
const menus:unknown[]=[];
const shares:ShareContent[]=[];
const storage=new Map<string,string>();
let requestedStage=stageId(levels[0],0);
const api={
  getStorageSync:(key:string)=>storage.get(key)??null,
  setStorageSync:(key:string,value:string)=>{storage.set(key,value);},
  getLaunchOptionsSync:()=>({query:{stage:requestedStage}}),
  showShareMenu:(options:unknown)=>{menus.push(options);},
  updateShareMenu:(options:unknown)=>{menus.push(options);},
  onShareAppMessage:(handler:ShareContentProvider)=>{handlers.friend=handler;},
  onShareTimeline:(handler:ShareContentProvider)=>{handlers.timeline=handler;},
  shareAppMessage:(content:ShareContent)=>{shares.push(content);},
};
const platform=new WeChatPlatform(api);
const app=new GameApplication(platform) as unknown as AppProbe;
assert.equal(app.sharedLaunch,true);
assert.equal(app.session.state.levelIndex,0);
assert.deepEqual(menus,[
  {withShareTicket:true,menus:['shareAppMessage','shareTimeline']},
  {withShareTicket:true},
]);
assert.deepEqual(SHARE_IMAGE_URLS,[]);
assert.deepEqual(handlers.friend?.(),{
  title:'来挑战光线急转弯第 1 关！',
  query:`stage=${encodeURIComponent(stageId(levels[0],0))}`,
});
assert.deepEqual(handlers.timeline?.(),handlers.friend?.());
app.session.load(1);
assert.equal(handlers.friend?.().query,`stage=${encodeURIComponent(stageId(levels[1],1))}`);
platform.shareAppMessage(app.createShareContent());
assert.deepEqual(shares,[handlers.friend?.()]);

const bossIndex=levels.findIndex(level=>level.campaign?.kind==='boss');
app.session.load(bossIndex);
assert.equal(handlers.friend?.().title,'来挑战光线急转弯第 1 章 · 挑战！');
assert.equal(handlers.friend?.().query,'stage=boss%3A1');

requestedStage=stageId(levels[1],1);
const locked=new GameApplication(platform) as unknown as AppProbe;
assert.equal(locked.sharedLaunch,false,'sharing must not bypass progression locks');
assert.equal(locked.session.state.levelIndex,0);
storage.set('laser-mirror-completed-stages-v2',JSON.stringify([stageId(levels[0],0)]));
const unlocked=new GameApplication(platform) as unknown as AppProbe;
assert.equal(unlocked.sharedLaunch,true);
assert.equal(unlocked.session.state.levelIndex,1);
requestedStage='missing-stage';
assert.equal((new GameApplication(platform) as unknown as AppProbe).sharedLaunch,false);

const artwork:ShareContent={title:'挑战',query:'stage=level%3A1',imageUrl:'friend.png',imageUrlId:'friend-id',imagePreviewUrl:'timeline.png',imagePreviewUrlId:'preview-id'};
platform.configureShare(()=>artwork);
assert.deepEqual(handlers.timeline?.(),{...artwork,imageUrl:'timeline.png',imageUrlId:'preview-id'});
platform.configureShare(()=>({...artwork,imagePreviewUrlId:undefined}));
assert.equal(handlers.timeline?.().imageUrlId,undefined);
const restricted=new WeChatPlatform({
  ...api,
  showShareMenu:()=>{throw new Error('unsupported option');},
  updateShareMenu:()=>Promise.reject(new Error('unsupported update')),
  shareAppMessage:()=>Promise.reject(new Error('cancelled')),
});
assert.doesNotThrow(()=>restricted.configureShare(()=>artwork));
assert.deepEqual(handlers.friend?.(),artwork);
assert.doesNotThrow(()=>restricted.shareAppMessage(artwork));
assert.doesNotThrow(()=>new WeChatPlatform({shareAppMessage:()=>{throw new Error('restricted');}}).shareAppMessage(artwork));
const oldPlatform=new WeChatPlatform({});
assert.equal(oldPlatform.canShare(),false);
assert.equal(oldPlatform.getSharedStage(),null);
assert.doesNotThrow(()=>oldPlatform.configureShare(()=>artwork));
assert.doesNotThrow(()=>oldPlatform.shareAppMessage(artwork));

const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
const webShares:ShareData[]=[];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{
  href:'https://example.com/game/?stage=level%3A2&lang=zh',search:'?stage=level%3A2&lang=zh',
}}});
const web=new WebPlatform();
assert.equal(web.canShare(),false);
assert.equal(web.getSharedStage(),'level:2');
Object.defineProperty(navigator,'share',{configurable:true,value:(content:ShareData)=>{webShares.push(content);return Promise.resolve();}});
assert.equal(web.canShare(),true);
web.shareAppMessage(artwork);
assert.deepEqual(webShares,[{title:artwork.title,text:artwork.title,url:'https://example.com/game/?stage=level%3A1&lang=zh'}]);
Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new Error('cancelled'))});
assert.doesNotThrow(()=>web.shareAppMessage(artwork));
await new Promise(resolve=>setImmediate(resolve));
if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);
else Reflect.deleteProperty(globalThis,'navigator');
if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);
else Reflect.deleteProperty(globalThis,'window');

console.log('Sharing verified: native menus, dynamic stage metadata, unlocked launch, empty artwork, browser URLs and graceful cancellation.');
