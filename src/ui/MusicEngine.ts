import type { MusicSourceMode, ThemeId } from '../types';

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface RealmScoreConfig {
  bpm: number;
  scaleHz: number[];
  bassHz: number[];
  padWave: OscillatorType;
  leadWave: OscillatorType;
  ambienceType: 'fire' | 'wind-chimes' | 'desert' | 'blizzard' | 'forge' | 'cosmos';
  ambienceCutoff: number;
}

const REALM_SCORES: Record<ThemeId, RealmScoreConfig> = {
  // Gothic Sanctum: D Dorian / Aeolian choir & dark strings
  gothic: {
    bpm: 72,
    scaleHz: [293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33],
    bassHz: [73.42, 87.31, 65.41, 82.41],
    padWave: 'sawtooth',
    leadWave: 'triangle',
    ambienceType: 'fire',
    ambienceCutoff: 460,
  },
  // Shogun Dojo: Japanese Hirajoshi pentatonic koto + airy shakuhachi + taiko
  samurai: {
    bpm: 84,
    scaleHz: [293.66, 329.63, 349.23, 440.0, 466.16, 587.33, 659.25, 698.46],
    bassHz: [73.42, 110.0, 87.31, 73.42],
    padWave: 'sine',
    leadWave: 'triangle',
    ambienceType: 'wind-chimes',
    ambienceCutoff: 680,
  },
  // Pharaoh's Temple: Phrygian Dominant (Hijaz) oud & ney flute
  pharaoh: {
    bpm: 78,
    scaleHz: [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33],
    bassHz: [73.42, 77.78, 98.0, 73.42],
    padWave: 'triangle',
    leadWave: 'sawtooth',
    ambienceType: 'desert',
    ambienceCutoff: 380,
  },
  // Frost Citadel: Nordic C# / E minor crystal harp & glacial winds
  frost: {
    bpm: 66,
    scaleHz: [329.63, 369.99, 392.0, 440.0, 493.88, 554.37, 587.33, 659.25],
    bassHz: [82.41, 98.0, 73.42, 92.5],
    padWave: 'sine',
    leadWave: 'sine',
    ambienceType: 'blizzard',
    ambienceCutoff: 820,
  },
  // Infernal Forge: Deep Phrygian war drums & molten brass
  infernal: {
    bpm: 94,
    scaleHz: [220.0, 233.08, 293.66, 329.63, 349.23, 440.0, 466.16, 523.25],
    bassHz: [55.0, 58.27, 73.42, 55.0],
    padWave: 'sawtooth',
    leadWave: 'sawtooth',
    ambienceType: 'forge',
    ambienceCutoff: 300,
  },
  // Astral Observatory: Lydian celesta & floating cosmic shimmer
  astral: {
    bpm: 68,
    scaleHz: [261.63, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88, 523.25],
    bassHz: [65.41, 73.42, 98.0, 82.41],
    padWave: 'sine',
    leadWave: 'sine',
    ambienceType: 'cosmos',
    ambienceCutoff: 950,
  },
};

const MOTIFS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, -1, 2, 4, 3, -1, 1, 0],
  [4, 5, 7, -1, 4, 3, 2, -1],
  [0, 2, 4, 5, 4, 2, 3, 1],
  [7, -1, 5, 4, 3, 2, 0, -1],
];

/**
 * Dual-mode background music & realm ambience engine:
 *  - Supports the extracted reference Video OST (/audio/gothic_video_ost.mp3)
 *  - Synthesizes 6 distinct procedural Web Audio realm soundtracks + ambient environments
 *  - Dynamically raises rhythmic/harmonic tension when a King is in Check
 */
export class MusicEngine {
  private theme: ThemeId = 'gothic';
  private musicEnabled = true;
  private masterSoundEnabled = true;
  private musicSource: MusicSourceMode = 'auto';
  private inCheck = false;

  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;

  private ostAudio: HTMLAudioElement | null = null;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private unlocked = false;

  constructor(
    initialTheme: ThemeId = 'gothic',
    musicEnabled = true,
    masterSoundEnabled = true,
    musicSource: MusicSourceMode = 'auto',
  ) {
    this.theme = initialTheme;
    this.musicEnabled = musicEnabled;
    this.masterSoundEnabled = masterSoundEnabled;
    this.musicSource = musicSource;
  }

  public unlock(): void {
    this.unlocked = true;
    this.ensureWebAudio();
    this.ensureOstAudio();
    this.syncPlaybackState();
  }

  public setTheme(theme: ThemeId): void {
    if (this.theme === theme) return;
    this.theme = theme;
    this.stepIndex = 0;
    this.updateAmbienceFilter();
    this.syncPlaybackState();
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.syncPlaybackState();
  }

  public setMasterSoundEnabled(enabled: boolean): void {
    this.masterSoundEnabled = enabled;
    this.syncPlaybackState();
  }

  public setMusicSource(source: MusicSourceMode): void {
    this.musicSource = source;
    this.syncPlaybackState();
  }

  public setCheckState(inCheck: boolean): void {
    this.inCheck = inCheck;
  }

  public dispose(): void {
    if (this.schedulerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    try {
      this.ambienceSource?.stop();
    } catch {
      // ignore
    }
    if (this.ostAudio) {
      this.ostAudio.pause();
      this.ostAudio.src = '';
      this.ostAudio = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  private shouldUseVideoOst(): boolean {
    if (this.musicSource === 'video-ost') return true;
    if (this.musicSource === 'theme-synth') return false;
    return this.theme === 'gothic';
  }

  private isAudioAudible(): boolean {
    return this.musicEnabled && this.masterSoundEnabled;
  }

  private ensureOstAudio(): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined' || this.ostAudio) {
      return;
    }
    const audio = new Audio('/audio/gothic_video_ost.mp3');
    audio.loop = true;
    audio.volume = 0.28;
    audio.preload = 'auto';
    this.ostAudio = audio;
  }

  private ensureWebAudio(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const win = window as WindowWithWebkitAudio;
      const AudioCtor = window.AudioContext ?? win.webkitAudioContext;
      if (!AudioCtor) return;

      const ctx = new AudioCtor();
      this.ctx = ctx;

      const musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(ctx.destination);
      this.musicGain = musicGain;

      const ambienceGain = ctx.createGain();
      ambienceGain.gain.value = 0;
      const ambienceFilter = ctx.createBiquadFilter();
      ambienceFilter.type = 'bandpass';
      ambienceFilter.Q.value = 0.75;
      ambienceFilter.frequency.value = REALM_SCORES[this.theme].ambienceCutoff;
      ambienceFilter.connect(ambienceGain);
      ambienceGain.connect(ctx.destination);

      this.ambienceGain = ambienceGain;
      this.ambienceFilter = ambienceFilter;

      // 3-second seamless pink/brown ambient noise loop
      const len = Math.max(1, ctx.sampleRate * 3);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.04 * white) / 1.04;
        ch[i] = last * 2.4;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(ambienceFilter);
      src.start();
      this.ambienceSource = src;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Autoplay restriction until user gesture
      });
    }

    if (this.schedulerId === null) {
      this.nextStepTime = this.ctx.currentTime + 0.08;
      this.schedulerId = window.setInterval(() => this.tickSequencer(), 90);
    }
  }

  private updateAmbienceFilter(): void {
    if (!this.ctx || !this.ambienceFilter) return;
    const cfg = REALM_SCORES[this.theme];
    const now = this.ctx.currentTime;
    this.ambienceFilter.type =
      cfg.ambienceType === 'fire' || cfg.ambienceType === 'forge' ? 'lowpass' : 'bandpass';
    this.ambienceFilter.frequency.setTargetAtTime(cfg.ambienceCutoff, now, 0.25);
  }

  private syncPlaybackState(): void {
    const audible = this.isAudioAudible();
    const useOst = this.shouldUseVideoOst();

    if (this.ctx && this.musicGain && this.ambienceGain) {
      const now = this.ctx.currentTime;
      const synthGain = audible && !useOst ? 0.34 : 0.0;
      const ambGain = audible ? 0.14 : 0.0;
      this.musicGain.gain.setTargetAtTime(synthGain, now, 0.22);
      this.ambienceGain.gain.setTargetAtTime(ambGain, now, 0.28);
    }

    if (this.ostAudio) {
      if (audible && useOst && this.unlocked) {
        this.ostAudio.volume = this.inCheck ? 0.34 : 0.26;
        if (this.ostAudio.paused) {
          void this.ostAudio.play().catch(() => {
            // Browser autoplay policy; will retry on next unlock()
          });
        }
      } else if (!this.ostAudio.paused) {
        this.ostAudio.pause();
      }
    }
  }

  private tickSequencer(): void {
    if (!this.ctx || !this.musicGain || !this.isAudioAudible()) return;
    if (this.ctx.state !== 'running') return;

    const useOst = this.shouldUseVideoOst();
    const cfg = REALM_SCORES[this.theme];
    const stepDur = (60 / (cfg.bpm * (this.inCheck ? 1.16 : 1.0))) * 0.5;

    while (this.nextStepTime < this.ctx.currentTime + 0.24) {
      if (!useOst) {
        this.scheduleMusicStep(this.ctx, this.musicGain, this.nextStepTime, this.stepIndex, stepDur);
      }
      this.scheduleAmbienceDetail(this.ctx, this.ambienceGain, this.nextStepTime, this.stepIndex);
      this.nextStepTime += stepDur;
      this.stepIndex = (this.stepIndex + 1) % 64;
    }
  }

  private scheduleMusicStep(
    ctx: AudioContext,
    out: AudioNode,
    time: number,
    step: number,
    stepDur: number,
  ): void {
    const cfg = REALM_SCORES[this.theme];

    // Warm harmonic bass drone every 8 steps (measure change)
    if (step % 8 === 0) {
      const barIdx = Math.floor(step / 8) % cfg.bassHz.length;
      const bassFreq = cfg.bassHz[barIdx];
      this.playPadNote(ctx, out, bassFreq, time, stepDur * 7.8, cfg.padWave, 0.16);
      this.playPadNote(ctx, out, bassFreq * 1.5, time + 0.02, stepDur * 7.5, 'sine', 0.09);
      if (this.inCheck) {
        this.playPadNote(ctx, out, bassFreq * 2.12, time + 0.03, stepDur * 3.6, 'sawtooth', 0.05);
      }
    }

    // Rhythmic pulse (Taiko / Anvil / Timpani / Check pulse)
    if (
      (this.theme === 'samurai' && (step % 8 === 0 || step % 8 === 3 || step % 8 === 6)) ||
      (this.theme === 'infernal' && step % 4 === 0) ||
      (this.inCheck && step % 2 === 0)
    ) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const baseHz = this.theme === 'infernal' ? 92 : 112;
      osc.frequency.setValueAtTime(baseHz, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.16);
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(this.inCheck ? 0.13 : 0.10, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 0.26);
    }

    // Lead melody voice
    const motif = MOTIFS[Math.floor(step / 8) % MOTIFS.length];
    const scaleIdx = motif[step % 8];
    if (scaleIdx >= 0) {
      const freq = cfg.scaleHz[scaleIdx % cfg.scaleHz.length];
      const dur =
        this.theme === 'samurai' || this.theme === 'frost' || this.theme === 'astral'
          ? stepDur * 1.85
          : stepDur * 1.45;
      this.playLeadNote(ctx, out, freq, time, dur, cfg.leadWave, 0.11);
    }
  }

  private scheduleAmbienceDetail(
    ctx: AudioContext,
    out: GainNode | null,
    time: number,
    step: number,
  ): void {
    if (!out) return;
    const cfg = REALM_SCORES[this.theme];

    // Subtle procedural fire crackle pops for Gothic & Infernal
    if ((cfg.ambienceType === 'fire' || cfg.ambienceType === 'forge') && Math.random() < 0.35) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const f = 900 + Math.random() * 2400;
      osc.frequency.setValueAtTime(f, time);
      osc.frequency.exponentialRampToValueAtTime(f * 0.4, time + 0.028);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.035, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
      osc.connect(g);
      g.connect(out);
      osc.start(time);
      osc.stop(time + 0.035);
    }

    // Soft distant wind chimes / crystal sparkles on Samurai, Frost, Astral
    if (
      (cfg.ambienceType === 'wind-chimes' ||
        cfg.ambienceType === 'blizzard' ||
        cfg.ambienceType === 'cosmos') &&
      step % 16 === 6
    ) {
      const chimeHz = cfg.scaleHz[Math.floor(Math.random() * cfg.scaleHz.length)] * 2.0;
      this.playLeadNote(ctx, out, chimeHz, time, 0.9, 'sine', 0.045);
    }
  }

  private playPadNote(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    time: number,
    duration: number,
    wave: OscillatorType,
    peak: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(220, freq * 3.2), time);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(out);
    osc.start(time);
    osc.stop(time + duration + 0.04);
  }

  private playLeadNote(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    time: number,
    duration: number,
    wave: OscillatorType,
    peak: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(4800, freq * 4.5), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.4), time + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.022);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(out);
    osc.start(time);
    osc.stop(time + duration + 0.04);
  }
}
