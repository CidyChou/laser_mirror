import assert from 'node:assert/strict';
import { MusicManager, MUSIC_VOLUME } from '../src/audio/MusicManager';
import type { IPlatform } from '../src/platform/IPlatform';
import { BaseMiniGamePlatform } from '../src/platform/minigame/BaseMiniGamePlatform';

let plays=0,pauses=0,disposed=0,blocked=false;
const player={
  src:'',volume:1,loop:false,autoplay:true,
  play:()=>{plays++;if(blocked)throw new Error('interrupted');},
  pause:()=>{pauses++;},
  destroy:()=>{disposed++;},
};
const music=new MusicManager({kind:'wechat',createAudio:()=>player} as IPlatform);
assert.equal(player.src,'audio/space-loop.mp3');
assert.equal(player.volume,MUSIC_VOLUME);
assert.equal(player.loop,true);
assert.equal(player.autoplay,false);
music.setEnabled(true);
music.setActive(true);
assert.equal(plays,0,'wait for the first player interaction');
music.unlock();
music.unlock();
assert.equal(plays,1,'repeated input must not restart the track');
music.setActive(false);
assert.equal(pauses,1);
music.unlock();
assert.equal(plays,1,'background input must not resume audio');
music.setActive(true);
assert.equal(plays,2);
music.setEnabled(false);
music.setActive(false);
music.setActive(true);
music.unlock();
assert.equal(plays,2,'disabled music stays silent after returning to the game');
blocked=true;
music.setEnabled(true);
assert.equal(plays,3);
blocked=false;
music.unlock();
assert.equal(plays,4,'a blocked native player can retry on the next interaction');
music.destroy();
music.unlock();
music.setEnabled(true);
music.setActive(true);
assert.equal(plays,4,'destroyed music must not restart');
assert.equal(disposed,1);

const callbacks=new Map<string,()=>void>();
const api:Record<string,unknown>={};
for(const event of ['Hide','Show','AudioInterruptionBegin','AudioInterruptionEnd']){
  api[`on${event}`]=(handler:()=>void)=>callbacks.set(event,handler);
  api[`off${event}`]=(handler:()=>void)=>{
    assert.equal(callbacks.get(event),handler);
    callbacks.delete(event);
  };
}
const states:boolean[]=[];
const platform=new BaseMiniGamePlatform('wechat',api);
const detach=platform.onAudioActiveChange(active=>states.push(active));
callbacks.get('Hide')!();
callbacks.get('AudioInterruptionBegin')!();
callbacks.get('Show')!();
assert.equal(states.at(-1),false,'returning to the foreground must respect audio interruption');
callbacks.get('AudioInterruptionEnd')!();
assert.equal(states.at(-1),true);
callbacks.get('Hide')!();
callbacks.get('AudioInterruptionEnd')!();
assert.equal(states.at(-1),false,'ending an interruption must not play audio in the background');
detach();
assert.equal(callbacks.size,0,'remove all native lifecycle listeners');
assert.doesNotThrow(()=>{
  const silent=new MusicManager({kind:'wechat'} as IPlatform);
  silent.unlock();silent.setActive(false);silent.destroy();
});
console.log('Music verified: quiet volume, looping, gesture unlock, pause/resume, saved mute behavior, interruption recovery and cleanup.');
