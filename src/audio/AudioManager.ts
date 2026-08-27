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
  | 'uiClick';

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
  uiClick:      { file:'ui_click.mp3', volume:.24, pool:2, cooldownMs:35, rateJitter:.025 },
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
