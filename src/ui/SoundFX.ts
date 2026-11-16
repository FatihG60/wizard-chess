interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Procedural Web Audio synthesizer for Wizard Chess sanctum acoustics.
 * Produces stone, marble, steel, and cathedral brass effects without external assets.
 */
export class SoundFX {
  private enabled: boolean;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      if (this.masterGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(enabled ? 0.72 : 0, now, 0.02);
      }
    } catch {
      // Ignore audio state errors in restricted or headless environments
    }
  }

  public unlock(): void {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          // Ignore autoplay restriction rejections
        });
      }
    } catch {
      // Safe no-op in headless environments
    }
  }

  public playSelect(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;
      // Subtle crystal ping
      this.playTone(ctx, out, {
        type: 'triangle',
        freqStart: 1180,
        freqEnd: 880,
        startTime: t,
        duration: 0.065,
        peakGain: 0.11,
      });
      // Soft stone tap
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: 320,
        freqEnd: 160,
        startTime: t,
        duration: 0.045,
        peakGain: 0.12,
      });
      // Crisp micro-click transient
      this.playFilteredNoise(ctx, out, {
        filterType: 'highpass',
        freqStart: 2200,
        q: 1.4,
        startTime: t,
        duration: 0.022,
        peakGain: 0.08,
      });
    } catch {
      // Ignore synthesis errors
    }
  }

  public playMove(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;
      this.triggerStoneSlide(ctx, out, t, 0.17, 1.0);
    } catch {
      // Ignore synthesis errors
    }
  }

  public playCastle(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;
      // King slide + heavy Rook slide
      this.triggerStoneSlide(ctx, out, t, 0.16, 0.95);
      this.triggerStoneSlide(ctx, out, t + 0.15, 0.21, 1.15, 0.85);
    } catch {
      // Ignore synthesis errors
    }
  }

  public playCapture(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;

      // 1. Metallic sword clash (inharmonic ring partials + sharp transient)
      const clashPartials = [980, 1545, 2380, 3190];
      clashPartials.forEach((freq, idx) => {
        this.playTone(ctx, out, {
          type: idx % 2 === 0 ? 'triangle' : 'sawtooth',
          freqStart: freq,
          freqEnd: freq * 0.96,
          startTime: t,
          duration: 0.26 - idx * 0.03,
          peakGain: 0.085 / (1 + idx * 0.35),
          highpassFreq: 750,
        });
      });

      this.playFilteredNoise(ctx, out, {
        filterType: 'bandpass',
        freqStart: 3200,
        freqEnd: 1600,
        q: 1.8,
        startTime: t,
        duration: 0.09,
        peakGain: 0.28,
      });

      // 2. Deep stone shatter impact & sub rumble
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: 122,
        freqEnd: 34,
        startTime: t + 0.01,
        duration: 0.36,
        peakGain: 0.38,
      });

      this.playFilteredNoise(ctx, out, {
        filterType: 'lowpass',
        freqStart: 420,
        freqEnd: 85,
        q: 1.1,
        startTime: t + 0.015,
        duration: 0.44,
        peakGain: 0.34,
      });

      // 3. Scattered marble debris crunch grains
      const debrisOffsets = [0.055, 0.105, 0.165, 0.235, 0.31];
      debrisOffsets.forEach((offset, idx) => {
        this.playFilteredNoise(ctx, out, {
          filterType: 'bandpass',
          freqStart: 1500 + idx * 280,
          freqEnd: 950 + idx * 140,
          q: 3.2,
          startTime: t + offset,
          duration: 0.045,
          peakGain: 0.14 * Math.pow(0.76, idx),
        });
      });
    } catch {
      // Ignore synthesis errors
    }
  }

  public playCheck(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;
      // Resonant cathedral bell + brass warning interval (D4 + F4 + Ab4 / A3 undertone)
      const bellFreqs = [293.66, 349.23, 415.3];
      bellFreqs.forEach((freq, idx) => {
        this.playTone(ctx, out, {
          type: 'sine',
          freqStart: freq,
          freqEnd: freq,
          startTime: t + idx * 0.035,
          duration: 0.65,
          attack: 0.012,
          peakGain: 0.13,
        });
        // Bell metallic overtone
        this.playTone(ctx, out, {
          type: 'triangle',
          freqStart: freq * 2.41,
          freqEnd: freq * 2.4,
          startTime: t + idx * 0.035,
          duration: 0.32,
          attack: 0.008,
          peakGain: 0.04,
        });
      });

      // Low brass warning swell
      this.playBrassVoice(ctx, out, 146.83, t, 0.58, 0.14);
      this.playBrassVoice(ctx, out, 220.0, t + 0.02, 0.56, 0.1);
    } catch {
      // Ignore synthesis errors
    }
  }

  public playCheckmate(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;

      // Phase 1: Solemn minor cathedral toll (D minor)
      this.playBrassVoice(ctx, out, 73.42, t, 1.95, 0.18); // D2 sub pedal
      this.playBrassVoice(ctx, out, 146.83, t, 0.55, 0.14); // D3
      this.playBrassVoice(ctx, out, 293.66, t + 0.02, 0.45, 0.11); // D4
      this.playBrassVoice(ctx, out, 349.23, t + 0.04, 0.42, 0.1); // F4

      // Phase 2: Majestic Picardie-third triumph chord (D Major cathedral organ + brass)
      const resolveAt = t + 0.44;
      const triumphChord = [146.83, 220.0, 293.66, 369.99, 440.0, 587.33];
      triumphChord.forEach((freq, idx) => {
        this.playBrassVoice(
          ctx,
          out,
          freq,
          resolveAt + idx * 0.018,
          1.65,
          0.11 - idx * 0.008,
        );
      });

      // Deep ceremonial gong/bell impact on resolution
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: 146.83,
        freqEnd: 73.42,
        startTime: resolveAt,
        duration: 0.9,
        attack: 0.015,
        peakGain: 0.22,
      });
      this.playFilteredNoise(ctx, out, {
        filterType: 'bandpass',
        freqStart: 900,
        freqEnd: 320,
        q: 1.5,
        startTime: resolveAt,
        duration: 0.22,
        peakGain: 0.1,
      });
    } catch {
      // Ignore synthesis errors
    }
  }

  public playPromote(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const out = this.masterGain;
      if (!ctx || !out) return;

      const t = ctx.currentTime;
      // Ascending D major harmonic shimmer
      const notes = [587.33, 739.99, 880.0, 1174.66, 1479.98];
      notes.forEach((freq, idx) => {
        const noteStart = t + idx * 0.055;
        this.playTone(ctx, out, {
          type: 'sine',
          freqStart: freq,
          freqEnd: freq,
          startTime: noteStart,
          duration: 0.48 + idx * 0.06,
          attack: 0.015,
          peakGain: 0.1,
        });
        this.playTone(ctx, out, {
          type: 'triangle',
          freqStart: freq * 2,
          freqEnd: freq * 2,
          startTime: noteStart,
          duration: 0.28,
          attack: 0.01,
          peakGain: 0.035,
        });
      });
    } catch {
      // Ignore synthesis errors
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const win = window as WindowWithWebkitAudio;
      const AudioCtor = window.AudioContext ?? win.webkitAudioContext;
      if (!AudioCtor) return null;

      this.ctx = new AudioCtor();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      const master = this.ctx.createGain();
      master.gain.value = this.enabled ? 0.72 : 0;

      master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.masterGain = master;
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 1.0);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Ignore resume rejection before user gesture
      });
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private triggerStoneSlide(
    ctx: AudioContext,
    out: AudioNode,
    startTime: number,
    slideDuration: number,
    gainScale: number,
    pitchScale = 1.0,
  ): void {
    // Marble surface scrape
    this.playFilteredNoise(ctx, out, {
      filterType: 'bandpass',
      freqStart: 540 * pitchScale,
      freqEnd: 310 * pitchScale,
      q: 2.2,
      startTime,
      duration: slideDuration,
      peakGain: 0.14 * gainScale,
    });

    // Soft heavy stone set-down thud
    const thudTime = startTime + slideDuration * 0.68;
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: 145 * pitchScale,
      freqEnd: 56 * pitchScale,
      startTime: thudTime,
      duration: 0.14,
      attack: 0.006,
      peakGain: 0.24 * gainScale,
    });
    this.playTone(ctx, out, {
      type: 'triangle',
      freqStart: 220 * pitchScale,
      freqEnd: 95 * pitchScale,
      startTime: thudTime,
      duration: 0.08,
      attack: 0.004,
      peakGain: 0.09 * gainScale,
    });
  }

  private playBrassVoice(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
  ): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(320, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(420, freq * 3.4),
      startTime + Math.min(0.16, duration * 0.35),
    );
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(240, freq * 1.4),
      startTime + duration,
    );

    const env = ctx.createGain();
    const attack = Math.min(0.06, duration * 0.2);
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    filter.connect(env);
    env.connect(out);

    const detunes = [-4, 4];
    for (const detune of detunes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.detune.setValueAtTime(detune, startTime);
      osc.connect(filter);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.03);
    }
  }

  private playTone(
    ctx: AudioContext,
    out: AudioNode,
    opts: {
      type: OscillatorType;
      freqStart: number;
      freqEnd: number;
      startTime: number;
      duration: number;
      peakGain: number;
      attack?: number;
      highpassFreq?: number;
    },
  ): void {
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(Math.max(20, opts.freqStart), opts.startTime);
    if (opts.freqEnd !== opts.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.freqEnd),
        opts.startTime + opts.duration,
      );
    }

    const env = ctx.createGain();
    const attack = opts.attack ?? 0.004;
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(opts.peakGain, opts.startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.startTime + opts.duration);

    if (opts.highpassFreq) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(opts.highpassFreq, opts.startTime);
      osc.connect(hp);
      hp.connect(env);
    } else {
      osc.connect(env);
    }

    env.connect(out);
    osc.start(opts.startTime);
    osc.stop(opts.startTime + opts.duration + 0.02);
  }

  private playFilteredNoise(
    ctx: AudioContext,
    out: AudioNode,
    opts: {
      filterType: BiquadFilterType;
      freqStart: number;
      freqEnd?: number;
      q: number;
      startTime: number;
      duration: number;
      peakGain: number;
    },
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.Q.value = opts.q;
    filter.frequency.setValueAtTime(Math.max(40, opts.freqStart), opts.startTime);
    if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, opts.freqEnd),
        opts.startTime + opts.duration,
      );
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(opts.peakGain, opts.startTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.startTime + opts.duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(out);

    src.start(opts.startTime);
    src.stop(opts.startTime + opts.duration + 0.02);
  }
}
