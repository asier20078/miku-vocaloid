import {
  breToAmount,
  formantShiftToGen,
  genToFormantShift,
} from './vocaloidParams';

export interface DspParams {
  masterGain: number; // 0..2
  drive: number; // 1..6
  highPassHz: number; // 20..2000
  lowPassHz: number; // 400..20000
  delayTimeMs: number; // 10..1200
  delayFeedback: number; // 0..0.85
  delayMix: number; // 0..1
  reverbRoomSize: number; // 0.1..0.98
  reverbDamping: number; // 0..0.95
  reverbMix: number; // 0..1
  attackMs: number; // 1..500
  decayMs: number; // 10..1000
  sustainLevel: number; // 0.05..1
  releaseMs: number; // 10..2000
  pitchRatio: number; // 0.5..2.0
  unisonVoices: number; // 1..5
  unisonDetune: number; // 0..0.05
  unisonSpread: number; // 0..1
  pan: number; // -1..1
  coarticulationMs: number; // 15..50 ms S-curve transition
  portamentoMs: number; // 10..120 ms S-curve pitch glide (35ms default)
  genderFormantShift: number; // 0.72..1.35 (+12% = 1.12 default Vocaloid shift)
  breathiness: number; // 0..0.5
  phraseEndBreathiness: number; // 0..0.65
  vibratoDepth: number; // 0..0.6 semitones
  vibratoRate: number; // 3..8 Hz (5.5-6.5 Hz Vocaloid)
  consonantClarity: number; // 0.4..1.8
  harmonyMode: 'solo' | 'chords-3-5' | 'choir-full' | 'octave-bass';
  // Crypton VOCALOID / Piapro Studio parameters (0..127 MIDI CC scale + PBS)
  vel: number; // Velocity (consonant speed & crispness, 0..127)
  dyn: number; // Dynamics (0..127)
  bri: number; // Brightness (0..127)
  cle: number; // Clearness (0..127)
  ope: number; // Opening (0..127)
  gen: number; // Gender Factor (0..127, 64=neutral, 48=+12%)
  gwl: number; // Growl V4X (0..127)
  pbs: number; // Pitch Bend Sensitivity (1..24 semitones)
}

export const DEFAULT_DSP_PARAMS: DspParams = {
  masterGain: 0.85,
  drive: 1.15,
  highPassHz: 85,
  lowPassHz: 16500,
  delayTimeMs: 260,
  delayFeedback: 0.28,
  delayMix: 0.16,
  reverbRoomSize: 0.58,
  reverbDamping: 0.42,
  reverbMix: 0.20,
  attackMs: 10,
  decayMs: 65,
  sustainLevel: 0.88,
  releaseMs: 180,
  pitchRatio: 1.0,
  unisonVoices: 1,
  unisonDetune: 0.012,
  unisonSpread: 0.65,
  pan: 0.0,
  coarticulationMs: 30,
  portamentoMs: 35,
  genderFormantShift: 1.12,
  breathiness: 0.09,
  phraseEndBreathiness: 0.36,
  vibratoDepth: 0.24,
  vibratoRate: 6.0,
  consonantClarity: 1.15,
  harmonyMode: 'choir-full',
  vel: 64,
  dyn: 84,
  bri: 86,
  cle: 68,
  ope: 100,
  gen: 48,
  gwl: 0,
  pbs: 4,
};

export interface DspPreset {
  id: string;
  name: string;
  description: string;
  patch: Partial<DspParams>;
}

export const DSP_PRESETS: DspPreset[] = [
  {
    id: 'vocaloid-pop',
    name: 'Vocaloid Pop (Miku + Coros)',
    description: 'GEN 48 (+12%), BRI 86, CLE 68, OPE 100, portamento 35ms, vibrato 6Hz >250ms y coro en 3ª/5ª.',
    patch: {
      ...DEFAULT_DSP_PARAMS,
      genderFormantShift: 1.12,
      gen: 48,
      bri: 88,
      cle: 72,
      ope: 105,
      gwl: 0,
      portamentoMs: 35,
      vibratoRate: 6.0,
      vibratoDepth: 0.24,
      consonantClarity: 1.22,
      harmonyMode: 'choir-full',
    },
  },
  {
    id: 'clean-studio',
    name: 'Voz Limpia de Estudio',
    description: 'Paso-alto a 85 Hz para limpiar graves, compresión suave y ambiente sutil.',
    patch: {
      ...DEFAULT_DSP_PARAMS,
      genderFormantShift: 1.04,
      gen: 59,
      bri: 74,
      cle: 64,
      ope: 92,
      harmonyMode: 'solo',
    },
  },
  {
    id: 'cinematic-choir',
    name: 'Coro Amplio (Unison x5)',
    description: '5 capas vocales panoramizadas con micro-desafinación, delay ping-pong y reverb amplia.',
    patch: {
      highPassHz: 110,
      lowPassHz: 13500,
      drive: 1.4,
      unisonVoices: 5,
      unisonDetune: 0.018,
      unisonSpread: 0.88,
      delayTimeMs: 340,
      delayFeedback: 0.42,
      delayMix: 0.26,
      reverbRoomSize: 0.86,
      reverbDamping: 0.35,
      reverbMix: 0.45,
      attackMs: 35,
      releaseMs: 420,
      harmonyMode: 'chords-3-5',
    },
  },
  {
    id: 'warm-radio',
    name: 'Presencia Cálida / Radio',
    description: 'Saturación armónica moderada, corte de graves y eco corto tipo slapback.',
    patch: {
      highPassHz: 120,
      lowPassHz: 11000,
      drive: 2.35,
      unisonVoices: 2,
      unisonDetune: 0.006,
      unisonSpread: 0.35,
      delayTimeMs: 115,
      delayFeedback: 0.16,
      delayMix: 0.14,
      reverbRoomSize: 0.32,
      reverbDamping: 0.6,
      reverbMix: 0.12,
      attackMs: 5,
      releaseMs: 120,
      genderFormantShift: 1.0,
      harmonyMode: 'solo',
    },
  },
  {
    id: 'deep-formant',
    name: 'Voz Grave Cinemática',
    description: 'Tono descendente (-5 semitonos), formantes graves y cola larga de reverb.',
    patch: {
      pitchRatio: 0.75,
      genderFormantShift: 0.88,
      highPassHz: 60,
      lowPassHz: 5200,
      drive: 1.9,
      unisonVoices: 3,
      unisonDetune: 0.014,
      unisonSpread: 0.72,
      delayTimeMs: 420,
      delayFeedback: 0.48,
      delayMix: 0.28,
      reverbRoomSize: 0.92,
      reverbDamping: 0.55,
      reverbMix: 0.5,
      attackMs: 45,
      releaseMs: 650,
      harmonyMode: 'octave-bass',
    },
  },
];

export interface UnisonLayer {
  playbackRate: number;
  pan: number;
  gainScale: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampDspParams(params: DspParams): DspParams {
  const safeShift = clamp(params.genderFormantShift ?? genToFormantShift(params.gen ?? 48), 0.72, 1.35);
  const safeGen = Math.round(clamp(params.gen ?? formantShiftToGen(safeShift), 0, 127));
  const safeBreath = clamp(params.breathiness ?? breToAmount(24), 0, 0.5);
  return {
    masterGain: clamp(params.masterGain, 0, 2),
    drive: clamp(params.drive, 1, 6),
    highPassHz: clamp(params.highPassHz, 20, 2000),
    lowPassHz: clamp(params.lowPassHz, 400, 20000),
    delayTimeMs: clamp(params.delayTimeMs, 10, 1200),
    delayFeedback: clamp(params.delayFeedback, 0, 0.85),
    delayMix: clamp(params.delayMix, 0, 1),
    reverbRoomSize: clamp(params.reverbRoomSize, 0.1, 0.98),
    reverbDamping: clamp(params.reverbDamping, 0, 0.95),
    reverbMix: clamp(params.reverbMix, 0, 1),
    attackMs: clamp(params.attackMs, 1, 500),
    decayMs: clamp(params.decayMs, 10, 1000),
    sustainLevel: clamp(params.sustainLevel, 0.05, 1),
    releaseMs: clamp(params.releaseMs, 10, 2000),
    pitchRatio: clamp(params.pitchRatio, 0.5, 2.0),
    unisonVoices: Math.round(clamp(params.unisonVoices, 1, 5)),
    unisonDetune: clamp(params.unisonDetune, 0, 0.05),
    unisonSpread: clamp(params.unisonSpread, 0, 1),
    pan: clamp(params.pan, -1, 1),
    coarticulationMs: clamp(params.coarticulationMs, 15, 50),
    portamentoMs: clamp(params.portamentoMs ?? 35, 10, 120),
    genderFormantShift: safeShift,
    breathiness: safeBreath,
    phraseEndBreathiness: clamp(params.phraseEndBreathiness, 0, 0.65),
    vibratoDepth: clamp(params.vibratoDepth, 0, 0.6),
    vibratoRate: clamp(params.vibratoRate, 3, 8),
    consonantClarity: clamp(params.consonantClarity, 0.4, 1.8),
    harmonyMode: ['solo', 'chords-3-5', 'choir-full', 'octave-bass'].includes(params.harmonyMode)
      ? params.harmonyMode
      : 'choir-full',
    vel: Math.round(clamp(params.vel ?? 64, 0, 127)),
    dyn: Math.round(clamp(params.dyn ?? 84, 0, 127)),
    bri: Math.round(clamp(params.bri ?? 86, 0, 127)),
    cle: Math.round(clamp(params.cle ?? 68, 0, 127)),
    ope: Math.round(clamp(params.ope ?? 100, 0, 127)),
    gen: safeGen,
    gwl: Math.round(clamp(params.gwl ?? 0, 0, 127)),
    pbs: Math.round(clamp(params.pbs ?? 4, 1, 24)),
  };
}

// Mirrors C++ VoicePool::trigger unison distribution
export function computeUnisonLayers(
  basePitchRatio: number,
  basePan: number,
  unisonVoices: number,
  unisonDetune: number,
  unisonSpread: number
): UnisonLayer[] {
  const count = Math.round(clamp(unisonVoices, 1, 5));
  const gainScale = 1 / Math.sqrt(count);
  const layers: UnisonLayer[] = [];

  for (let i = 0; i < count; i++) {
    if (count === 1) {
      layers.push({
        playbackRate: clamp(basePitchRatio, 0.25, 4),
        pan: clamp(basePan, -1, 1),
        gainScale,
      });
    } else {
      const norm = (2 * i) / (count - 1) - 1;
      layers.push({
        playbackRate: clamp(basePitchRatio * (1 + norm * unisonDetune), 0.25, 4),
        pan: clamp(basePan + norm * unisonSpread, -1, 1),
        gainScale,
      });
    }
  }

  return layers;
}

export function buildSoftClipCurve(drive: number, length = 1024): Float32Array<ArrayBuffer> {
  const safeDrive = clamp(drive, 1, 6);
  const buffer = new ArrayBuffer(length * 4);
  const curve = new Float32Array(buffer);
  const norm = safeDrive > 1.001 ? Math.tanh(safeDrive) : 1;

  for (let i = 0; i < length; i++) {
    const x = (i * 2) / (length - 1) - 1;
    curve[i] = safeDrive > 1.001 ? Math.tanh(x * safeDrive) / norm : Math.tanh(x);
  }
  return curve;
}

export function generateReverbImpulseData(
  sampleRate: number,
  roomSize: number,
  damping: number
): { left: Float32Array; right: Float32Array } {
  const durationSec = 0.4 + clamp(roomSize, 0.1, 0.98) * 2.6;
  const length = Math.max(128, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  // Deterministic LCG PRNG so tests & rendering are reproducible
  let seedL = 1337;
  let seedR = 7331;
  const nextRand = (s: number): [number, number] => {
    const next = (1664525 * s + 1013904223) >>> 0;
    return [next, (next / 0xffffffff) * 2 - 1];
  };

  const dampAlpha = 1 - clamp(damping, 0, 0.95) * 0.75;
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const decay = Math.pow(1 - t, 2.2 + (1 - roomSize) * 3.0);

    const [nL, rL] = nextRand(seedL);
    seedL = nL;
    const [nR, rR] = nextRand(seedR);
    seedR = nR;

    lpL += dampAlpha * (rL - lpL);
    lpR += dampAlpha * (rR - lpR);

    left[i] = lpL * decay;
    right[i] = lpR * decay;
  }

  return { left, right };
}

export function extractWaveformPeaks(channelData: Float32Array, buckets = 96): number[] {
  if (channelData.length === 0 || buckets <= 0) return [];
  const step = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: number[] = [];

  for (let b = 0; b < buckets; b++) {
    const start = b * step;
    const end = Math.min(channelData.length, start + step);
    let maxVal = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > maxVal) maxVal = abs;
    }
    peaks.push(Math.min(1, maxVal));
  }
  return peaks;
}

// Generates realistic vowel-formant vocal phrase samples locally (zero external assets)
export function synthesizeVocalFormantBuffer(
  sampleRate: number,
  durationSec: number,
  fundamentalHz: number,
  formantsHz: [number, number, number]
): Float32Array {
  const length = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(length);
  const twoPi = Math.PI * 2;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const vibrato = 1 + 0.008 * Math.sin(twoPi * 5.2 * t);
    const f0 = fundamentalHz * vibrato;

    // Glottal pulse train approximation + three formant resonances
    let sample = 0;
    const maxHarmonic = Math.min(18, Math.floor((sampleRate * 0.42) / f0));
    for (let h = 1; h <= maxHarmonic; h++) {
      const freq = h * f0;
      let formantGain = 0.08 / h;
      for (let fIdx = 0; fIdx < 3; fIdx++) {
        const fc = formantsHz[fIdx];
        const bw = 90 + fIdx * 45;
        const dist = (freq - fc) / bw;
        formantGain += (1.0 / (1 + dist * dist)) * (fIdx === 0 ? 0.55 : fIdx === 1 ? 0.35 : 0.2);
      }
      sample += Math.sin(twoPi * freq * t) * formantGain;
    }

    // Smooth syllable envelope
    const attack = Math.min(1, t / 0.045);
    const release = Math.min(1, (durationSec - t) / 0.12);
    const breathMod = 0.85 + 0.15 * Math.sin(twoPi * 2.1 * t);
    out[i] = Math.tanh(sample * 0.35) * attack * release * breathMod;
  }

  return out;
}

// Encodes stereo/mono Float32 channels into a standard 16-bit PCM WAV file buffer
export function encodeWavBuffer(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = Math.max(1, channels.length);
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const dataSize = frameCount * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = clamp(channels[ch][i] ?? 0, -1, 1);
      const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return buffer;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00 s';
  return `${seconds.toFixed(2)} s`;
}

export function linearToDb(amp: number): string {
  if (amp <= 0.0001) return '-∞ dB';
  const db = 20 * Math.log10(amp);
  return `${db.toFixed(1)} dB`;
}
