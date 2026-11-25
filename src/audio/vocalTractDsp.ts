import { VocalTractTarget } from './coarticulation';

class MonoBiquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;
  private lastFreq = -1;
  private lastQ = -1;
  private lastMode: 'bp' | 'notch' | '' = '';

  public reset(): void {
    this.z1 = 0;
    this.z2 = 0;
    this.lastFreq = -1;
    this.lastQ = -1;
    this.lastMode = '';
  }

  public processBandpass(x: number, freqHz: number, q: number, sr: number): number {
    const cf = Math.max(40, Math.min(sr * 0.44, freqHz));
    const cq = Math.max(0.4, Math.min(25, q));
    if (this.lastMode !== 'bp' || Math.abs(cf - this.lastFreq) > 0.5 || Math.abs(cq - this.lastQ) > 0.02) {
      const w = (2 * Math.PI * cf) / sr;
      const alpha = Math.sin(w) / (2 * cq);
      const cosw = Math.cos(w);
      const invA0 = 1 / (1 + alpha);
      this.b0 = alpha * invA0;
      this.b1 = 0;
      this.b2 = -alpha * invA0;
      this.a1 = -2 * cosw * invA0;
      this.a2 = (1 - alpha) * invA0;
      this.lastFreq = cf;
      this.lastQ = cq;
      this.lastMode = 'bp';
    }
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    if (Math.abs(this.z1) < 1e-18) this.z1 = 0;
    if (Math.abs(this.z2) < 1e-18) this.z2 = 0;
    return y;
  }

  public processNotch(x: number, freqHz: number, q: number, sr: number): number {
    const cf = Math.max(60, Math.min(sr * 0.44, freqHz));
    const cq = Math.max(0.5, Math.min(12, q));
    if (this.lastMode !== 'notch' || Math.abs(cf - this.lastFreq) > 0.5 || Math.abs(cq - this.lastQ) > 0.02) {
      const w = (2 * Math.PI * cf) / sr;
      const alpha = Math.sin(w) / (2 * cq);
      const cosw = Math.cos(w);
      const invA0 = 1 / (1 + alpha);
      this.b0 = invA0;
      this.b1 = -2 * cosw * invA0;
      this.b2 = invA0;
      this.a1 = this.b1;
      this.a2 = (1 - alpha) * invA0;
      this.lastFreq = cf;
      this.lastQ = cq;
      this.lastMode = 'notch';
    }
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    if (Math.abs(this.z1) < 1e-18) this.z1 = 0;
    if (Math.abs(this.z2) < 1e-18) this.z2 = 0;
    return y;
  }
}

function rosenbergPulse(phase: number, openQuotient = 0.52, closingQuotient = 0.18): number {
  // Sharper glottal closing quotient increases high-frequency harmonic energy (Vocaloid/UTAU brilliance)
  let base = -0.32;
  if (phase < openQuotient) {
    base = 0.5 * (1 - Math.cos((Math.PI * phase) / openQuotient)) - 0.32;
  } else {
    const closeEnd = openQuotient + closingQuotient;
    if (phase < closeEnd) {
      base = Math.cos((0.5 * Math.PI * (phase - openQuotient)) / closingQuotient) - 0.32;
    }
  }
  // Subtle harmonic brilliance pre-emphasis at glottal closure
  const closureImpulse = Math.exp(-Math.pow((phase - openQuotient) / 0.045, 2)) * 0.24;
  return base + closureImpulse;
}

export class VocalTractSynthesizer {
  private sampleRate = 48000;
  private glottalPhase = 0;
  private trillPhase = 0;
  private growlPhase = 0;
  private rngState = 0x12345678;
  private pinkB0 = 0;
  private pinkB1 = 0;
  private pinkB2 = 0;
  private f1 = new MonoBiquad();
  private f2 = new MonoBiquad();
  private f3 = new MonoBiquad();
  private f4 = new MonoBiquad();
  private f5 = new MonoBiquad();
  private fricativeBp = new MonoBiquad();
  private nasalNotch = new MonoBiquad();
  private customCursor = 0;

  public prepare(sampleRate: number): void {
    this.sampleRate = Math.max(8000, sampleRate);
    this.reset();
  }

  public reset(): void {
    this.glottalPhase = 0;
    this.trillPhase = 0;
    this.growlPhase = 0;
    this.rngState = 0x12345678;
    this.pinkB0 = 0;
    this.pinkB1 = 0;
    this.pinkB2 = 0;
    this.customCursor = 0;
    this.f1.reset();
    this.f2.reset();
    this.f3.reset();
    this.f4.reset();
    this.f5.reset();
    this.fricativeBp.reset();
    this.nasalNotch.reset();
  }

  private nextWhiteNoise(): number {
    this.rngState = (1664525 * this.rngState + 1013904223) >>> 0;
    return this.rngState / 0x80000000 - 1;
  }

  private nextPinkNoise(white: number): number {
    this.pinkB0 = 0.99765 * this.pinkB0 + white * 0.099046;
    this.pinkB1 = 0.963 * this.pinkB1 + white * 0.2965164;
    this.pinkB2 = 0.57 * this.pinkB2 + white * 1.0526913;
    return (this.pinkB0 + this.pinkB1 + this.pinkB2 + white * 0.1848) * 0.22;
  }

  private sampleCustomVoice(customSamples: Float32Array, f0Hz: number): number {
    const len = customSamples.length;
    if (len < 16) return 0;
    const loopStart = len > 8000 ? Math.floor(len * 0.22) : 0;
    const loopEnd = len > 8000 ? Math.floor(len * 0.78) : len - 1;
    const loopLen = Math.max(16, loopEnd - loopStart);

    const rate = Math.max(0.25, Math.min(4.0, f0Hz / 196.0));
    const idx = loopStart + (this.customCursor % loopLen);
    const i0 = Math.floor(idx);
    const i1 = i0 + 1 < loopEnd ? i0 + 1 : loopStart;
    const frac = idx - i0;
    const val = customSamples[i0] + frac * (customSamples[i1] - customSamples[i0]);

    this.customCursor += rate;
    if (this.customCursor >= loopLen) this.customCursor -= loopLen;
    return val;
  }

  public processSample(
    f0Hz: number,
    target: VocalTractTarget,
    breathiness: number,
    plosivePhaseGain: number,
    options?: {
      formantShift?: number; // Default +12% (1.12) for Miku / Vocaloid timbre (GEN)
      brightness?: number; // BRI
      clearness?: number; // CLE
      opening?: number; // OPE
      growl?: number; // GWL (0..1)
      consonantClarity?: number;
      burstBoost?: number;
      customSamples?: Float32Array | null;
    }
  ): number {
    const sr = this.sampleRate;
    const safeF0 = Math.max(55, Math.min(1200, f0Hz));
    const formantShift = Math.max(0.7, Math.min(1.35, options?.formantShift ?? 1.12));
    const brightness = options?.brightness ?? 1.18;
    const clearness = Math.max(0.5, Math.min(1.5, options?.clearness ?? 1.04));
    const opening = Math.max(0.82, Math.min(1.18, options?.opening ?? 1.06));
    const growl = Math.max(0, Math.min(1, options?.growl ?? 0));
    const consonantClarity = options?.consonantClarity ?? 1.15;
    const burstBoost = options?.burstBoost ?? 0.0;

    const white = this.nextWhiteNoise();
    const pink = this.nextPinkNoise(white);

    // Crypton V4X Growl: sub-harmonic (~38 Hz) FM + AM glottal perturbation
    let growlAm = 1.0;
    let growlFm = 0;
    if (growl > 0.01) {
      this.growlPhase += 38.0 / sr;
      if (this.growlPhase >= 1) this.growlPhase -= 1;
      const gWave = Math.sin(2 * Math.PI * this.growlPhase) + 0.35 * white;
      growlAm = 1.0 - growl * 0.34 * (0.5 + 0.5 * gWave);
      growlFm = growl * 0.045 * gWave;
    }

    const jitter = 1 + white * 0.003 + growlFm;

    this.glottalPhase += (safeF0 * jitter) / sr;
    if (this.glottalPhase >= 1) this.glottalPhase -= 1;

    // Layer 1: Periodic F0 glottal pulse train with high harmonic brilliance
    const rosenberg = rosenbergPulse(this.glottalPhase);
    let glottal = rosenberg;

    if (options?.customSamples && options.customSamples.length > 16) {
      const userSample = this.sampleCustomVoice(options.customSamples, safeF0);
      glottal = userSample * 0.65 + rosenberg * 0.45;
    }

    // Rolled 'rr' tongue-tip trill (~26 Hz amplitude modulation)
    let trillEnv = 1.0;
    if (target.trillRateHz > 1.0) {
      this.trillPhase += target.trillRateHz / sr;
      if (this.trillPhase >= 1) this.trillPhase -= 1;
      const osc = 0.5 + 0.5 * Math.cos(2 * Math.PI * this.trillPhase);
      trillEnv = 0.22 + 0.78 * osc;
    }

    const breathSignal = pink * Math.max(0, Math.min(0.65, breathiness)) * 0.52;
    const voicedExcitation = (glottal * target.voiceMix + breathSignal) * trillEnv * growlAm * plosivePhaseGain;

    // Layer 2: WORLD-style 5-Formant Spectral Envelope Bank (F1..F5) with GEN + OPE + CLE
    const f1 = Math.min(sr * 0.4, target.f1 * formantShift * opening);
    const f2 = Math.min(sr * 0.42, target.f2 * formantShift * (0.97 + opening * 0.03));
    const f3 = Math.min(sr * 0.43, target.f3 * formantShift);
    const f4 = Math.min(sr * 0.43, 3450 * formantShift);
    const f5 = Math.min(sr * 0.44, 4450 * formantShift);

    const s1 = this.f1.processBandpass(voicedExcitation, f1, f1 / Math.max(30, target.bw1), sr);
    const s2 = this.f2.processBandpass(voicedExcitation, f2, f2 / Math.max(40, target.bw2), sr);
    const s3 = this.f3.processBandpass(voicedExcitation, f3, (f3 / Math.max(50, target.bw3)) * (0.88 + clearness * 0.14), sr);
    const s4 = this.f4.processBandpass(voicedExcitation, f4, 17.5, sr);
    const s5 = this.f5.processBandpass(voicedExcitation, f5, 21.0, sr);

    const openWeight = 0.85 + (opening - 0.84) * 0.65;
    let vocalOut =
      s1 * (0.70 * openWeight) +
      s2 * (0.54 * brightness * (0.9 + opening * 0.1)) +
      s3 * (0.34 * brightness * clearness) +
      s4 * (0.17 * brightness * clearness) +
      s5 * (0.10 * brightness * clearness);

    // Nasal antiresonance zero notch filter (m, n, ɲ, ŋ)
    if (target.nasalMix > 0.01 && target.antiResonanceHz > 100) {
      const notched = this.nasalNotch.processNotch(vocalOut, target.antiResonanceHz, 3.2, sr);
      vocalOut = vocalOut * (1 - target.nasalMix) + notched * target.nasalMix;
    }

    // Layer 3: Aperiodicity & 25-45ms Plosive Burst Noise Path (3 kHz - 10 kHz)
    let consonantNoise = 0;
    const effectiveNoiseMix = Math.min(1.75, target.noiseMix * consonantClarity * (1 + burstBoost));
    if (effectiveNoiseMix > 0.005) {
      const noiseCenter = Math.max(3000, Math.min(10000, target.noiseCenterHz));
      const shaped = this.fricativeBp.processBandpass(
        pink * 0.45 + white * 0.55,
        noiseCenter,
        Math.max(1.8, target.noiseQ),
        sr
      );
      consonantNoise = shaped * effectiveNoiseMix * 0.72;
    }

    return Math.tanh((vocalOut + consonantNoise) * 1.55);
  }
}
