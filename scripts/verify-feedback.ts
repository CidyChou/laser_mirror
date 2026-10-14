import assert from 'node:assert/strict';
import { HapticGate } from '../src/platform/HapticGate';
import { BaseMiniGamePlatform } from '../src/platform/minigame/BaseMiniGamePlatform';
import { ScreenShake } from '../src/rendering/effects/ScreenShake';
import { AudioManager } from '../src/audio/AudioManager';
import type { IPlatform } from '../src/platform/IPlatform';

// Catch-up frames may deliver the last charge tick and launch together.
// Collisions must not steal either that release or the win pulse.
const gate=new HapticGate();
assert(gate.allows('light',0));
assert(!gate.allows('light',30));
assert(gate.allows('medium',35));
assert(gate.allows('heavy',50));
assert(gate.allows('launch',55));
assert(!gate.allows('medium',100));
assert(gate.allows('medium',190));
assert(gate.allows('success',191));
assert(!gate.allows('success',220));
assert(gate.allows('light',330));

const nativePulses:string[]=[];
const platform=new BaseMiniGamePlatform('wechat',{
  vibrateShort:({type}:{type:string})=>nativePulses.push(type),
  vibrateLong:()=>nativePulses.push('long'),
});
platform.vibrate('heavy');
platform.vibrate('launch');
assert.deepEqual(nativePulses,['heavy','heavy'],'Native adapter must not throttle a launch after the charge tick');
await new Promise(resolve=>setTimeout(resolve,120));
assert.deepEqual(nativePulses,['heavy','heavy','medium'],'Launch has a short second pulse');
platform.vibrate('launch');platform.cancelHaptics();
await new Promise(resolve=>setTimeout(resolve,120));
assert.equal(nativePulses.length,4,'Turning haptics off cancels delayed pulses');
platform.vibrate('launch');platform.vibrate('success');platform.cancelHaptics();
await new Promise(resolve=>setTimeout(resolve,120));
assert.deepEqual(nativePulses.slice(4),['heavy','long'],'Victory supersedes a pending release pulse');

const shake=new ScreenShake();
shake.trigger(0,7.5,0,220);
assert.equal(shake.update(0).x,-7.5);
for(let time=1;time<220;time+=8){
  const offset=shake.update(time);
  assert(Math.abs(offset.x)<=8&&Math.abs(offset.y)<=8);
}
assert.deepEqual(shake.update(220),{x:0,y:0});assert(!shake.active);
for(let i=0;i<20;i++)shake.trigger(300,6,i*.4);
const piled=shake.update(300);
assert(Math.abs(piled.x)<=8&&Math.abs(piled.y)<=8,'Simultaneous impacts must have bounded recoil');
shake.clear();assert.deepEqual(shake.update(301),{x:0,y:0});assert(!shake.active);

// The first gesture's audio warm-up must not restart or mute the live charge.
const players:Array<{src:string;volume:number;muted:boolean;plays:number;paused:boolean}>=[];
const audio=new AudioManager({kind:'web',createAudio:()=>{
  const player={src:'',volume:1,muted:false,plays:0,paused:true,
    play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;},stop(){this.paused=true;}};
  players.push(player);return player;
}} as IPlatform);
audio.play('laserCharge');
await new Promise(resolve=>setTimeout(resolve,180));
const charge=players.find(player=>player.src.endsWith('laser_charge.mp3'))!;
assert.equal(charge.plays,1);assert(!charge.muted&&!charge.paused);
audio.stop('laserCharge');assert(charge.paused);
audio.playCombo(2);
assert(Math.abs(players.find(player=>player.src.endsWith('combo-1.mp3'))!.volume-.56*.94)<1e-8);
audio.destroy();
console.log('Feedback verified: charge/launch/victory priority, native double pulse and cancellation, bounded recoil, live charge warm-up/cancellation and restrained combo audio.');
