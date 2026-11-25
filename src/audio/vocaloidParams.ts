export type VocaloidParamKey =
  | 'VEL'
  | 'DYN'
  | 'BRE'
  | 'BRI'
  | 'CLE'
  | 'OPE'
  | 'GEN'
  | 'GWL'
  | 'PIT';

export type VibratoPresetId = 'none' | 'normal' | 'fast' | 'slow' | 'deep' | 'soft';

export interface VibratoPresetSpec {
  id: VibratoPresetId;
  label: string;
  rateHz: number;
  depthSemitones: number;
  delayRatio: number; // fraction before vibrato fades in
}

export const VIBRATO_PRESETS: Record<VibratoPresetId, VibratoPresetSpec> = {
  none: { id: 'none', label: 'Sin vibrato', rateHz: 6.0, depthSemitones: 0, delayRatio: 0.5 },
  normal: { id: 'normal', label: 'Normal (Pop 6.0Hz)', rateHz: 6.0, depthSemitones: 0.24, delayRatio: 0.28 },
  fast: { id: 'fast', label: 'Fast (Anime 6.8Hz)', rateHz: 6.8, depthSemitones: 0.28, delayRatio: 0.22 },
  slow: { id: 'slow', label: 'Slow (Balada 4.8Hz)', rateHz: 4.8, depthSemitones: 0.26, delayRatio: 0.35 },
  deep: { id: 'deep', label: 'Deep (Dramático)', rateHz: 5.8, depthSemitones: 0.44, delayRatio: 0.25 },
  soft: { id: 'soft', label: 'Soft (Suave)', rateHz: 5.4, depthSemitones: 0.14, delayRatio: 0.32 },
};

export interface VocaloidParamMeta {
  key: VocaloidParamKey;
  shortLabel: string;
  name: string;
  description: string;
  min: number;
  max: number;
  defaultVal: number;
  color: string;
  bipolar?: boolean;
}

export const VOCALOID_PARAM_SPECS: VocaloidParamMeta[] = [
  {
    key: 'DYN',
    shortLabel: 'DYN',
    name: 'Dynamics',
    description: 'Expresión y volumen dinámico de la voz a lo largo de la frase (0–127).',
    min: 0,
    max: 127,
    defaultVal: 84,
    color: '#EA580C',
  },
  {
    key: 'PIT',
    shortLabel: 'PIT',
    name: 'Pitch Bend',
    description: 'Curva continua de afinación (escalada por PBS en semitonos).',
    min: -64,
    max: 63,
    defaultVal: 0,
    color: '#F97316',
    bipolar: true,
  },
  {
    key: 'VEL',
    shortLabel: 'VEL',
    name: 'Velocity',
    description: 'Velocidad y duración de ataque de las consonantes por nota (0–127).',
    min: 0,
    max: 127,
    defaultVal: 64,
    color: '#84CC16',
  },
  {
    key: 'BRE',
    shortLabel: 'BRE',
    name: 'Breathiness',
    description: 'Cantidad de aire aspirado mezclado con la voz (0–127).',
    min: 0,
    max: 127,
    defaultVal: 24,
    color: '#38BDF8',
  },
  {
    key: 'BRI',
    shortLabel: 'BRI',
    name: 'Brightness',
    description: 'Brillo de armónicos altos y formantes agudos F2–F5 (0–127).',
    min: 0,
    max: 127,
    defaultVal: 86,
    color: '#FACC15',
  },
  {
    key: 'CLE',
    shortLabel: 'CLE',
    name: 'Clearness',
    description: 'Claridad espectral tipo Piapro / V4X que define la dicción en mezcla (0–127).',
    min: 0,
    max: 127,
    defaultVal: 68,
    color: '#2DD4BF',
  },
  {
    key: 'OPE',
    shortLabel: 'OPE',
    name: 'Opening',
    description: 'Apertura bucal de las vocales: cerrada/íntima (0) a abierta/potente (127).',
    min: 0,
    max: 127,
    defaultVal: 100,
    color: '#FB7185',
  },
  {
    key: 'GEN',
    shortLabel: 'GEN',
    name: 'Gender Factor',
    description: 'Timbre vocal: <64 juvenil/femenino (48 ≈ +12% Miku), >64 grave/masculino.',
    min: 0,
    max: 127,
    defaultVal: 48,
    color: '#A78BFA',
  },
  {
    key: 'GWL',
    shortLabel: 'GWL',
    name: 'Growl (V4X)',
    description: 'Gruñido subarmónico vocal V4X para énfasis rock o pop enérgico (0–127).',
    min: 0,
    max: 127,
    defaultVal: 0,
    color: '#EF4444',
  },
];

export interface ParamAutomationPoint {
  beat: number;
  value: number; // 0..127 for CC lanes, -64..63 for PIT
}

export type ParamAutomationMap = Partial<Record<Exclude<VocaloidParamKey, 'VEL'>, ParamAutomationPoint[]>>;

// Converts Crypton Gender Factor (0..127, 64=neutral, 48=+12%) to formant multiplier
export function genToFormantShift(gen: number): number {
  const clamped = Math.max(0, Math.min(127, Number.isFinite(gen) ? gen : 48));
  if (clamped <= 64) {
    // 64 -> 1.00, 48 -> 1.12 (+12%), 0 -> 1.48 (clamped to 1.35)
    return Math.min(1.35, 1 + (64 - clamped) * 0.0075);
  }
  // 64 -> 1.00, 86 -> 0.879, 127 -> 0.72
  return Math.max(0.72, 1 - (clamped - 64) * 0.00444);
}

export function formantShiftToGen(shift: number): number {
  const s = Math.max(0.72, Math.min(1.35, Number.isFinite(shift) ? shift : 1.12));
  if (s >= 1) {
    return Math.round(Math.max(0, 64 - (s - 1) / 0.0075));
  }
  return Math.round(Math.min(127, 64 + (1 - s) / 0.00444));
}

// Crypton VEL (0..127, 64=normal): higher VEL = shorter, punchier consonant onset
export function velToConsonantScale(vel: number): number {
  const v = Math.max(0, Math.min(127, Number.isFinite(vel) ? vel : 64));
  return 1.45 - (v / 127) * 0.9; // 1.45 at 0, ~1.0 at 64, 0.55 at 127
}

export function dynToGain(dyn: number): number {
  const d = Math.max(0, Math.min(127, Number.isFinite(dyn) ? dyn : 84));
  return 0.15 + (d / 127) * 1.25; // ~0.98 at 84, 1.40 at 127
}

export function breToAmount(bre: number): number {
  const b = Math.max(0, Math.min(127, Number.isFinite(bre) ? bre : 24));
  return (b / 127) * 0.5; // ~0.094 at 24
}

export function briToFactor(bri: number): number {
  const b = Math.max(0, Math.min(127, Number.isFinite(bri) ? bri : 86));
  return 0.55 + (b / 127) * 0.95; // ~1.19 at 86
}

export function cleToFactor(cle: number): number {
  const c = Math.max(0, Math.min(127, Number.isFinite(cle) ? cle : 68));
  return 0.5 + (c / 127) * 1.0; // ~1.04 at 68
}

export function opeToFactor(ope: number): number {
  const o = Math.max(0, Math.min(127, Number.isFinite(ope) ? ope : 100));
  return 0.84 + (o / 127) * 0.32; // ~1.09 at 100
}

export function gwlToAmount(gwl: number): number {
  const g = Math.max(0, Math.min(127, Number.isFinite(gwl) ? gwl : 0));
  return g / 127;
}

export function pitToSemitones(pitValue: number, pbsSemitones = 4): number {
  const clamped = Math.max(-64, Math.min(63, Number.isFinite(pitValue) ? pitValue : 0));
  const pbs = Math.max(1, Math.min(24, pbsSemitones));
  return (clamped / 64) * pbs;
}

// Evaluates a Crypton parameter automation lane at any beat position.
export function evaluateParamLaneAtBeat(
  points: ParamAutomationPoint[] | undefined,
  beat: number,
  defaultValue: number,
  maxGapBeats = 1.5
): number {
  if (!points || points.length === 0) return defaultValue;

  // Assumes callers pass pre-sorted or small arrays; sort safely if out of order
  let sorted = points;
  for (let i = 1; i < points.length; i++) {
    if (points[i].beat < points[i - 1].beat) {
      sorted = [...points].sort((a, b) => a.beat - b.beat);
      break;
    }
  }

  if (beat < sorted[0].beat - 0.12) return defaultValue;
  if (beat <= sorted[0].beat) {
    const t = 1 - (sorted[0].beat - beat) / 0.12;
    return defaultValue + (sorted[0].value - defaultValue) * Math.max(0, Math.min(1, t));
  }

  const last = sorted[sorted.length - 1];
  if (beat > last.beat + 0.12) return defaultValue;
  if (beat >= last.beat) {
    const t = (beat - last.beat) / 0.12;
    return last.value + (defaultValue - last.value) * Math.max(0, Math.min(1, t));
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const p = sorted[i];
    const next = sorted[i + 1];
    if (beat >= p.beat && beat <= next.beat) {
      const span = next.beat - p.beat;
      if (span <= maxGapBeats) {
        const t = (beat - p.beat) / Math.max(0.0001, span);
        return p.value + (next.value - p.value) * t;
      }
      // Fade back to default across large gaps between edited regions
      if (beat - p.beat <= 0.12) {
        const t = (beat - p.beat) / 0.12;
        return p.value + (defaultValue - p.value) * t;
      }
      if (next.beat - beat <= 0.12) {
        const t = 1 - (next.beat - beat) / 0.12;
        return defaultValue + (next.value - defaultValue) * t;
      }
      return defaultValue;
    }
  }

  return defaultValue;
}

export type RobotVoiceMode = 'off' | 'soft' | 'hard';
export type BreathMode = 'off' | 'sometimes' | 'always';
export type StylePresetId =
  | 'megpoid-default'
  | 'pop-electro'
  | 'ballad-soft'
  | 'rock-power'
  | 'robot-synth';

export interface VocaloidStyleSettings {
  stylePreset: StylePresetId;
  robotVoice: RobotVoiceMode;
  breathMode: BreathMode;
  exhalation: number; // 0..20
  voiceColorEnabled: boolean;
  expression: number; // 0..100 (rotary knob)
  air: number; // 0..100
  character: number; // -50..+50
  attack: number; // 0..100
  take: number; // 1..4
}

export const DEFAULT_STYLE_SETTINGS: VocaloidStyleSettings = {
  stylePreset: 'megpoid-default',
  robotVoice: 'off',
  breathMode: 'sometimes',
  exhalation: 6,
  voiceColorEnabled: true,
  expression: 79,
  air: 10,
  character: 0,
  attack: 40,
  take: 1,
};

export const STYLE_PRESETS: Record<
  StylePresetId,
  { label: string; patch: Partial<VocaloidStyleSettings> }
> = {
  'megpoid-default': {
    label: 'Megpoid Default*',
    patch: {
      robotVoice: 'off',
      breathMode: 'sometimes',
      exhalation: 6,
      voiceColorEnabled: true,
      expression: 79,
      air: 10,
      character: 0,
      attack: 40,
    },
  },
  'pop-electro': {
    label: 'Pop / Electro Rápido',
    patch: {
      robotVoice: 'soft',
      breathMode: 'sometimes',
      exhalation: 8,
      voiceColorEnabled: true,
      expression: 86,
      air: 18,
      character: 8,
      attack: 72,
    },
  },
  'ballad-soft': {
    label: 'Balada / Whisper',
    patch: {
      robotVoice: 'off',
      breathMode: 'always',
      exhalation: 14,
      voiceColorEnabled: true,
      expression: 68,
      air: 48,
      character: -6,
      attack: 22,
    },
  },
  'rock-power': {
    label: 'Rock / Power V4X',
    patch: {
      robotVoice: 'off',
      breathMode: 'sometimes',
      exhalation: 10,
      voiceColorEnabled: true,
      expression: 95,
      air: 12,
      character: -8,
      attack: 88,
    },
  },
  'robot-synth': {
    label: 'Robot / Vocoder',
    patch: {
      robotVoice: 'hard',
      breathMode: 'off',
      exhalation: 0,
      voiceColorEnabled: false,
      expression: 35,
      air: 0,
      character: 12,
      attack: 90,
    },
  },
};

export interface VocalTrackChannel {
  id: string;
  name: string;
  voiceLabel: string;
  role: 'lead' | 'third' | 'fifth' | 'bass';
  muted: boolean;
  solo: boolean;
  effectEnabled: boolean;
  armed: boolean;
  volumeDb: number; // -24..+6 dB
  pan: number; // -1..+1
  color: string;
}

export const DEFAULT_VOCAL_TRACKS: VocalTrackChannel[] = [
  {
    id: 'track-main',
    name: 'Main',
    voiceLabel: 'Miku Pop (V4X)',
    role: 'lead',
    muted: false,
    solo: false,
    effectEnabled: true,
    armed: false,
    volumeDb: 0.0,
    pan: 0.0,
    color: '#229A5B',
  },
];

export function dbToLinearGain(db: number): number {
  if (db <= -36) return 0;
  return Math.pow(10, Math.max(-36, Math.min(12, db)) / 20);
}

export function formatPanLabel(pan: number): string {
  if (Math.abs(pan) < 0.04) return 'C';
  return pan < 0 ? `L${Math.round(Math.abs(pan) * 64)}` : `R${Math.round(pan * 64)}`;
}

// Applies VOCALOID Style & Voice Color dials on top of base DSP params
export function applyStyleSettingsToDsp<
  T extends {
    vel: number;
    dyn: number;
    breathiness: number;
    gen: number;
    genderFormantShift: number;
    phraseEndBreathiness: number;
    vibratoDepth: number;
    vibratoRate: number;
    portamentoMs: number;
    consonantClarity: number;
  },
>(base: T, style: VocaloidStyleSettings): T {
  const exprNorm = style.voiceColorEnabled ? style.expression / 100 : 0.5;
  const effectiveVel = Math.round(Math.max(0, Math.min(127, (style.attack / 100) * 110 + 14)));
  const effectiveDyn = Math.round(Math.max(25, Math.min(127, 44 + exprNorm * 76)));
  const effectiveBreath = style.breathMode === 'off' ? 0.01 : Math.min(0.5, (style.air / 100) * 0.42 + 0.03);
  const effectiveExhale =
    style.breathMode === 'off' ? 0 : Math.min(0.65, (style.exhalation / 20) * 0.58);
  const effectiveGen = Math.round(Math.max(0, Math.min(127, base.gen - style.character * 0.55)));
  const vibScale =
    style.robotVoice === 'hard'
      ? 0
      : style.robotVoice === 'soft'
        ? 0.35
        : 0.5 + exprNorm * 0.8;
  const effectivePort =
    style.robotVoice === 'hard'
      ? 0
      : style.robotVoice === 'soft'
        ? Math.min(18, base.portamentoMs)
        : base.portamentoMs;

  return {
    ...base,
    vel: effectiveVel,
    dyn: effectiveDyn,
    breathiness: effectiveBreath,
    phraseEndBreathiness: effectiveExhale,
    gen: effectiveGen,
    genderFormantShift: genToFormantShift(effectiveGen),
    vibratoDepth: Number((base.vibratoDepth * vibScale).toFixed(3)),
    portamentoMs: effectivePort,
    consonantClarity: Number((0.8 + (style.attack / 100) * 0.85).toFixed(2)),
  };
}

