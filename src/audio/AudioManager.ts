import { comboAudioIndex } from '@/gameplay/combo';
import type { IPlatform } from '@/platform/IPlatform';

export type SfxName =
  | 'mirrorRotate'
  | 'laserCharge'
  | 'laserFire'
  | 'mirrorHit'
  | 'splitterHit'
  | 'portal'
  | 'targetHit'
  | 'switchOn'
  | 'shotFail'
  | 'victory'
  | 'uiClick'
  | 'win'
  | 'lose'
  | 'combo1'
  | 'combo2'
  | 'combo3'
  | 'combo4'
  | 'combo5'
  | 'combo6';

type SoundDef = { file:string; volume:number; pool:number; cooldownMs?:number; rateJitter?:number };
type Player = any;
type Bank = { players:Player[]; cursor:number; lastPlayed:number };

const SOUND_DEFS: Record<SfxName, SoundDef> = {
  mirrorRotate: { file:'mirror_rotate.mp3', volume:.32, pool:2, cooldownMs:24, rateJitter:.035 },
  laserCharge:  { file:'laser_charge.mp3', volume:.42, pool:1, cooldownMs:100 },
  laserFire:    { file:'laser_fire.mp3', volume:.52, pool:1, cooldownMs:80, rateJitter:.018 },
  mirrorHit:    { file:'mirror_hit.mp3', volume:.34, pool:2, cooldownMs:34, rateJitter:.04 },
  splitterHit:  { file:'splitter_hit.mp3', volume:.38, pool:2, cooldownMs:38, rateJitter:.025 },
  portal:       { file:'portal.mp3', volume:.34, pool:2, cooldownMs:55, rateJitter:.02 },
  targetHit:    { file:'target_hit.mp3', volume:.42, pool:2, cooldownMs:55, rateJitter:.018 },
  switchOn:     { file:'switch_on.mp3', volume:.30, pool:1, cooldownMs:60, rateJitter:.025 },
  shotFail:     { file:'shot_fail.mp3', volume:.30, pool:1, cooldownMs:150 },
  victory:      { file:'victory.mp3', volume:.46, pool:1, cooldownMs:500 },
  uiClick:      { file:'button-select.mp3', volume:.62, pool:2, cooldownMs:35, rateJitter:.025 },
  win:          { file:'level-victory.mp3', volume:.88, pool:1, cooldownMs:500 },
  lose:         { file:'game-over.mp3', volume:.78, pool:1, cooldownMs:400 },
  combo1:       { file:'combo-1.mp3', volume:.90, pool:1, cooldownMs:40 },
  combo2:       { file:'combo-2.mp3', volume:.90, pool:1, cooldownMs:40 },
  combo3:       { file:'combo-3.mp3', volume:.90, pool:1, cooldownMs:40 },
  combo4:       { file:'combo-4.mp3', volume:.90, pool:1, cooldownMs:40 },
  combo5:       { file:'combo-5.mp3', volume:.92, pool:1, cooldownMs:40 },
  combo6:       { file:'combo-6.mp3', volume:.96, pool:1, cooldownMs:40 },
};

export class AudioManager {
  private readonly banks = new Map<SfxName, Bank>();
  private masterVolume = 1;
  private enabled = true;

  constructor(private readonly platform:IPlatform) {
    for (const [name, def] of Object.entries(SOUND_DEFS) as [SfxName, SoundDef][]) {
      const players:Player[] = [];
      for (let i=0;i<def.pool;i++) {
        const player = this.platform.createAudio?.();
        if (!player) continue;
        const src = `${this.platform.kind === 'web' ? './' : ''}audio/${def.file}`;
        try {
          player.src = src;
          player.volume = def.volume;
          if ('preload' in player) player.preload = 'auto';
          player.load?.();
        } catch {}
        players.push(player);
      }
      this.banks.set(name, { players, cursor:0, lastPlayed:-Infinity });
    }
  }

  setEnabled(enabled:boolean){this.enabled=enabled;}
  setMasterVolume(volume:number){this.masterVolume=Math.max(0,Math.min(1,volume));}

  playCombo(count:number) {
    const name = `combo${comboAudioIndex(count)}` as SfxName;
    this.stopCombo();
    this.play(name);
  }

  private stopCombo() {
    for (let i=1;i<=6;i++) {
      const bank=this.banks.get(`combo${i}` as SfxName);
      if(!bank) continue;
      for(const player of bank.players){
        try{player.pause?.();player.stop?.();if('currentTime' in player) player.currentTime=0;}catch{}
      }
    }
  }

  play(name:SfxName, volumeScale=1) {
    if (!this.enabled || this.masterVolume <= 0) return;
    const def=SOUND_DEFS[name]; const bank=this.banks.get(name); if(!bank?.players.length)return;
    const now=typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (def.cooldownMs && now-bank.lastPlayed < def.cooldownMs) return;
    bank.lastPlayed=now;
    const player=bank.players[bank.cursor++ % bank.players.length];
    try {
      player.pause?.();
      player.stop?.();
      if ('currentTime' in player) player.currentTime=0;
      player.volume=Math.max(0,Math.min(1,def.volume*this.masterVolume*volumeScale));
      if ('playbackRate' in player) {
        const jitter=def.rateJitter ?? 0;
        player.playbackRate=1+(Math.random()*2-1)*jitter;
      }
      const result=player.play?.();
      result?.catch?.(()=>{});
    } catch {}
  }

  destroy(){
    for(const bank of this.banks.values())for(const player of bank.players){
      try{player.pause?.();player.stop?.();player.destroy?.();}catch{}
    }
    this.banks.clear();
  }
}
