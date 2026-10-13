import type { IPlatform } from '@/platform/IPlatform';

// The source is about -14 LUFS; this gain puts the background near -30 LUFS.
export const MUSIC_VOLUME = .16;

interface MusicPlayer {
  play(): void;
  pause(): void;
  destroy(): void;
}

/** One persistent track, independent of sound effects and view/theme rebuilds. */
export class MusicManager {
  private readonly player: MusicPlayer;
  private enabled = true;
  private active = true;
  private unlocked = false;
  private destroyed = false;

  constructor(platform: IPlatform) {
    const src = platform.kind === 'web' ? './audio/space-loop.mp3' : 'audio/space-loop.mp3';
    this.player = platform.kind === 'web' && typeof AudioContext !== 'undefined'
      ? new WebMusicPlayer(src)
      : new NativeMusicPlayer(platform.createAudio?.(), src);
  }

  /** Call synchronously from a pointer event to satisfy browser audio policies. */
  unlock() {
    if (this.destroyed) return;
    this.unlocked = true;
    this.sync();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.sync();
  }

  setActive(active: boolean) {
    this.active = active;
    this.sync();
  }

  private sync() {
    if (this.destroyed) return;
    if (this.enabled && this.active && this.unlocked) this.player.play();
    else this.player.pause();
  }

  destroy() {
    this.destroyed = true;
    this.player.destroy();
  }
}

class NativeMusicPlayer implements MusicPlayer {
  private playing = false;

  constructor(private readonly audio: any, src: string) {
    if (!audio) return;
    try {
      audio.autoplay = false;
      audio.loop = true;
      audio.volume = MUSIC_VOLUME;
      audio.src = src;
      audio.onError?.(() => { this.playing = false; });
      audio.onPause?.(() => { this.playing = false; });
      audio.load?.();
    } catch { /* Audio availability must not block the game. */ }
  }

  play() {
    if (!this.audio || this.playing) return;
    this.playing = true;
    try {
      this.audio.play?.()?.catch?.(() => { this.playing = false; });
    } catch { this.playing = false; }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    try { this.audio?.pause?.(); } catch {}
  }

  destroy() {
    this.pause();
    try { this.audio?.stop?.(); this.audio?.destroy?.(); } catch {}
  }
}

/** Loop decoded samples, avoiding the scheduling gap of HTML audio looping. */
class WebMusicPlayer implements MusicPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private loading: Promise<AudioBuffer> | null = null;
  private source: AudioBufferSourceNode | null = null;
  private wanted = false;
  private destroyed = false;
  private offset = 0;
  private startedAt = 0;

  constructor(private readonly src: string) {}

  play() {
    if (this.destroyed) return;
    this.wanted = true;
    try {
      const context = this.context ??= new AudioContext();
      const gain = this.gain ??= context.createGain();
      // Resume immediately during the user gesture, before fetching/decoding.
      const resumed = context.resume();
      if (!this.loading) {
        gain.connect(context.destination);
        this.loading = fetch(this.src)
          .then(response => {
            if (!response.ok) throw new Error('Music unavailable');
            return response.arrayBuffer();
          })
          .then(data => context.decodeAudioData(data))
          .catch(error => { this.loading = null; throw error; });
      }
      void Promise.all([resumed, this.loading]).then(([, buffer]) => {
        if (!this.wanted || this.destroyed || this.source || context.state !== 'running') return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setValueAtTime(0, context.currentTime);
        gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, context.currentTime + .4);
        this.offset %= buffer.duration;
        this.startedAt = context.currentTime;
        source.start(0, this.offset);
        this.source = source;
      }).catch(() => { /* Retry on the next interaction if playback was blocked. */ });
    } catch { /* Unsupported/restricted audio must leave the game playable. */ }
  }

  pause() {
    this.wanted = false;
    if (!this.source || !this.context) return;
    this.offset += Math.max(0, this.context.currentTime - this.startedAt);
    try { this.source.stop(); this.source.disconnect(); } catch {}
    this.source = null;
  }

  destroy() {
    this.destroyed = true;
    this.pause();
    void this.context?.close().catch(() => {});
  }
}
