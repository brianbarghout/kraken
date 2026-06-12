/**
 * P5 — Web Audio sound engine. Kenney CC0 samples (docs/ASSETS.md) for
 * weapon voices and impacts; tread rumble and wind ambience are
 * synthesized brown noise (zero payload). Unlocked by the first user
 * gesture per browser autoplay rules; default ON, mute is per-session
 * (no storage, GDD §17).
 */

export type SoundName =
  | 'shot-main'
  | 'shot-secondary'
  | 'shot-ap'
  | 'shot-defender'
  | 'missile-launch'
  | 'artillery-fire'
  | 'shell-incoming'
  | 'ricochet'
  | 'explosion-small'
  | 'explosion-med'
  | 'explosion-big'
  | 'crunch';

const FILES: Record<SoundName, { file: string; gain: number }> = {
  'shot-main': { file: 'lowFrequency_explosion_000.ogg', gain: 0.9 },
  'shot-secondary': { file: 'laserLarge_001.ogg', gain: 0.5 },
  'shot-ap': { file: 'laserSmall_000.ogg', gain: 0.45 },
  'shot-defender': { file: 'laserRetro_000.ogg', gain: 0.35 },
  'missile-launch': { file: 'thrusterFire_000.ogg', gain: 0.45 },
  'artillery-fire': { file: 'impactPlate_heavy_000.ogg', gain: 0.5 },
  'shell-incoming': { file: 'forceField_000.ogg', gain: 0.3 },
  ricochet: { file: 'impactMetal_light_000.ogg', gain: 0.5 },
  'explosion-small': { file: 'explosionCrunch_000.ogg', gain: 0.6 },
  'explosion-med': { file: 'explosionCrunch_002.ogg', gain: 0.75 },
  'explosion-big': { file: 'explosionCrunch_004.ogg', gain: 0.9 },
  crunch: { file: 'impactMetal_heavy_004.ogg', gain: 0.85 },
};

export function weaponVoice(weapon: string): SoundName {
  if (weapon === 'mainBattery') return 'shot-main';
  if (weapon.startsWith('secondary')) return 'shot-secondary';
  if (weapon.startsWith('antiPersonnel')) return 'shot-ap';
  return 'missile-launch';
}

export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private noiseBuffer: AudioBuffer | null = null;
  private scheduled: AudioBufferSourceNode[] = [];
  private mutedFlag = false;

  get muted(): boolean {
    return this.mutedFlag;
  }

  /** Test harness introspection. */
  get debugInfo(): { ctxState: string; buffersLoaded: number } {
    return { ctxState: this.ctx?.state ?? 'none', buffersLoaded: this.buffers.size };
  }

  /** Call from a user gesture (browser autoplay rules). Idempotent. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.mutedFlag ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeBrownNoise();
    void this.loadAll();
    this.startAmbience();
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  private async loadAll(): Promise<void> {
    await Promise.all(
      (Object.keys(FILES) as SoundName[]).map(async (name) => {
        try {
          const res = await fetch(`/assets/audio/${FILES[name].file}`);
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch {
          // missing sample is non-fatal — the game just plays quieter
        }
      }),
    );
  }

  /** Fire a one-shot, optionally delayed (synced to playback timeline). */
  play(name: SoundName, delayMs = 0): void {
    if (!this.ctx || !this.master) return;
    const spec = FILES[name];
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const start = this.ctx.currentTime + delayMs / 1000;
    const fire = (buf: AudioBuffer, gain: number) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buf;
      const g = this.ctx!.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.master!);
      src.start(start);
      this.scheduled.push(src);
      src.onended = () => {
        this.scheduled = this.scheduled.filter((s) => s !== src);
      };
    };
    fire(buffer, spec.gain);
    // big detonations get a low-end layer (converging salvos, shell strikes)
    if (name === 'explosion-big') {
      const low = this.buffers.get('shot-main');
      if (low) fire(low, 0.7);
    }
  }

  /** Cancel everything not yet heard — used by tap-to-skip. */
  cancelScheduled(): void {
    for (const src of this.scheduled) {
      try {
        src.stop();
      } catch {
        /* already done */
      }
    }
    this.scheduled = [];
  }

  /** 200 tonnes on the move: low synthesized rumble for the move segment. */
  rumble(durationMs: number, delayMs = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delayMs / 1000;
    const t1 = t0 + durationMs / 1000;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.15);
    g.gain.setValueAtTime(0.5, t1 - 0.2);
    g.gain.linearRampToValueAtTime(0, t1);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t1 + 0.05);
    this.scheduled.push(src);
  }

  private startAmbience(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.018; // barely-there wind
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  private makeBrownNoise(): AudioBuffer {
    const sr = this.ctx!.sampleRate;
    const buf = this.ctx!.createBuffer(1, sr * 2, sr);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }
}
