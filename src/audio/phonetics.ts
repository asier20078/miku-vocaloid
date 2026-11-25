import {
  convertLyricsToG2P,
  G2PLanguage,
  PunctuationTone,
  syllableToG2P,
} from './g2p';
import { evaluateProsodyOffset } from './prosody';

import {
  evaluateParamLaneAtBeat,
  ParamAutomationPoint,
  pitToSemitones,
  RobotVoiceMode,
  VIBRATO_PRESETS,
  VibratoPresetId,
} from './vocaloidParams';

export type VowelKey = 'a' | 'e' | 'i' | 'o' | 'u';

export interface PhonemeAnalysis {
  syllable: string;
  phonetic: string; // Display above note, e.g. "m o", "th e l"
  onsetConsonant: string;
  onsetType: 'none' | 'plosive' | 'fricative' | 'nasal' | 'liquid';
  vowel: VowelKey;
  codaConsonant: string;
  codaType: 'none' | 'fricative' | 'nasal' | 'plosive';
}

export interface VocalNote {
  id: string;
  midi: number; // 36 (C2) .. 84 (C6)
  startBeat: number; // Beat position (4 beats = 1 bar in 4/4)
  durationBeats: number;
  lyric: string;
  phonetic: string;
  vibratoDepth: number; // Semitones (0..0.6)
  vibratoRate: number; // Hz (3..8)
  portamentoMs: number; // Glide time from previous note
  isStressed?: boolean;
  punctuation?: PunctuationTone;
  g2pLanguage?: G2PLanguage;
  // Crypton VOCALOID / Piapro per-note properties
  velocity?: number; // VEL (0..127, consonant speed)
  opening?: number; // OPE (0..127, vowel openness)
  accent?: number; // 0..100%
  decay?: number; // 0..100%
  vibratoType?: VibratoPresetId;
  portamentoEnabled?: boolean;
}

export interface PitchControlPoint {
  beat: number;
  offsetSemitones: number; // Relative pitch bend (-4..+4)
}

export interface VoicebankProfile {
  id: string;
  name: string;
  subtitle: string;
  baseFormantShift: number; // 0.85 (baritone) .. 1.22 (soprano)
  breathiness: number; // 0..0.35
  brightness: number; // 0.7..1.35
  vibratoDepth: number;
  vibratoRate: number;
  defaultGen?: number;
  defaultBri?: number;
  defaultCle?: number;
  defaultOpe?: number;
  defaultBre?: number;
  defaultGwl?: number;
  customSlotId?: string; // If backed by an uploaded/recorded user voice sample
}

export const BUILTIN_VOICEBANKS: VoicebankProfile[] = [
  {
    id: 'miku-pop',
    name: 'Miku Pop (V4X)',
    subtitle: 'Soprano brillante · GEN 48 (+12%) · Pop / Electrónica',
    baseFormantShift: 1.12,
    breathiness: 0.11,
    brightness: 1.18,
    vibratoDepth: 0.24,
    vibratoRate: 6.0,
    defaultGen: 48,
    defaultBri: 88,
    defaultCle: 72,
    defaultOpe: 105,
    defaultBre: 22,
    defaultGwl: 0,
  },
  {
    id: 'miku-dark',
    name: 'Miku Dark / Whisper',
    subtitle: 'Susurro suave y aireado · Balada / Ambient',
    baseFormantShift: 1.09,
    breathiness: 0.26,
    brightness: 0.92,
    vibratoDepth: 0.22,
    vibratoRate: 5.2,
    defaultGen: 52,
    defaultBri: 58,
    defaultCle: 52,
    defaultOpe: 82,
    defaultBre: 58,
    defaultGwl: 0,
  },
  {
    id: 'rin-power',
    name: 'Rin Power',
    subtitle: 'Aguda enérgica con Growl V4X · Rock / Electro',
    baseFormantShift: 1.15,
    breathiness: 0.08,
    brightness: 1.28,
    vibratoDepth: 0.26,
    vibratoRate: 6.4,
    defaultGen: 44,
    defaultBri: 96,
    defaultCle: 80,
    defaultOpe: 112,
    defaultBre: 16,
    defaultGwl: 22,
  },
  {
    id: 'luka-bilingual',
    name: 'Luka Contralto (EN/ES)',
    subtitle: 'Contralto cálida y nítida bilingüe · Pop / Jazz',
    baseFormantShift: 0.98,
    breathiness: 0.15,
    brightness: 1.04,
    vibratoDepth: 0.24,
    vibratoRate: 5.5,
    defaultGen: 68,
    defaultBri: 66,
    defaultCle: 64,
    defaultOpe: 96,
    defaultBre: 32,
    defaultGwl: 0,
  },
  {
    id: 'kaito-baritone',
    name: 'Kaito Baritone',
    subtitle: 'Voz masculina profunda · Balada / Coro grave',
    baseFormantShift: 0.89,
    breathiness: 0.09,
    brightness: 0.94,
    vibratoDepth: 0.20,
    vibratoRate: 5.1,
    defaultGen: 84,
    defaultBri: 56,
    defaultCle: 60,
    defaultOpe: 90,
    defaultBre: 18,
    defaultGwl: 8,
  },
];

export const VOWEL_FORMANTS: Record<VowelKey, [number, number, number]> = {
  a: [760, 1180, 2520],
  e: [510, 1890, 2550],
  i: [310, 2320, 3020],
  o: [460, 840, 2580],
  u: [330, 710, 2490],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

function normalizeChar(ch: string): string {
  return ch
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u');
}

function isVowelChar(ch: string): boolean {
  const n = normalizeChar(ch);
  return n === 'a' || n === 'e' || n === 'i' || n === 'o' || n === 'u';
}

// Splits a word into natural singable syllables (Spanish/English/Romaji friendly).
export function splitWordIntoSyllables(rawWord: string): string[] {
  const cleaned = rawWord.replace(/[.,!?;:"'()[\]{}]/g, '').trim();
  if (!cleaned) return [];

  // Respect explicit hyphens written by the songwriter (e.g. "co-ra-zón")
  if (cleaned.includes('-')) {
    return cleaned.split('-').map((s) => s.trim()).filter(Boolean);
  }

  const chars = Array.from(cleaned);
  const vowelIndices: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (isVowelChar(chars[i])) {
      vowelIndices.push(i);
    }
  }

  // Group diphthongs / adjacent vowels into single vowel nuclei
  const nuclei: { start: number; end: number }[] = [];
  for (const idx of vowelIndices) {
    const prev = nuclei[nuclei.length - 1];
    if (prev && idx === prev.end + 1) {
      prev.end = idx;
    } else {
      nuclei.push({ start: idx, end: idx });
    }
  }

  if (nuclei.length <= 1) {
    return [cleaned];
  }

  const syllables: string[] = [];
  let cursor = 0;

  for (let n = 0; n < nuclei.length - 1; n++) {
    const curr = nuclei[n];
    const next = nuclei[n + 1];
    const consonantSpan = next.start - curr.end - 1;

    let splitAt = curr.end + 1;
    if (consonantSpan >= 2) {
      // Keep common onset clusters together (br, cr, dr, fr, gr, pr, tr, bl, cl, fl, gl, pl, ch, ll, rr, th, sh)
      const pair = (chars[next.start - 2] + chars[next.start - 1]).toLowerCase();
      const clusters = new Set([
        'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr',
        'bl', 'cl', 'fl', 'gl', 'pl',
        'ch', 'll', 'rr', 'th', 'sh', 'qu', 'gu',
      ]);
      if (consonantSpan === 2 && clusters.has(pair)) {
        splitAt = curr.end + 1;
      } else {
        splitAt = curr.end + 2;
      }
    }

    syllables.push(chars.slice(cursor, splitAt).join(''));
    cursor = splitAt;
  }

  if (cursor < chars.length) {
    syllables.push(chars.slice(cursor).join(''));
  }

  return syllables.filter(Boolean);
}

export interface ParsedLyricToken {
  syllable: string;
  isLineEnd: boolean;
}

// Parses full multi-line song lyrics into sequential syllables with phrase-break hints.
export function parseLyricsToSyllables(lyricsText: string): ParsedLyricToken[] {
  const lines = lyricsText.split(/\r?\n/);
  const tokens: ParsedLyricToken[] = [];

  for (const line of lines) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    const lineStartIdx = tokens.length;

    for (const word of words) {
      const sylls = splitWordIntoSyllables(word);
      for (const syl of sylls) {
        tokens.push({ syllable: syl, isLineEnd: false });
      }
    }

    if (tokens.length > lineStartIdx) {
      tokens[tokens.length - 1].isLineEnd = true;
    }
  }

  return tokens;
}

export function syllableToPhonemes(rawSyllable: string): PhonemeAnalysis {
  const syl = rawSyllable.trim() || 'la';
  const norm = Array.from(syl).map(normalizeChar).join('');

  let firstVowelIdx = -1;
  let lastVowelIdx = -1;
  for (let i = 0; i < norm.length; i++) {
    if (isVowelChar(norm[i])) {
      if (firstVowelIdx === -1) firstVowelIdx = i;
      lastVowelIdx = i;
    }
  }

  const onset = firstVowelIdx > 0 ? norm.slice(0, firstVowelIdx) : '';
  const vowelCluster =
    firstVowelIdx >= 0 && lastVowelIdx >= firstVowelIdx
      ? norm.slice(firstVowelIdx, lastVowelIdx + 1)
      : 'a';
  const coda = lastVowelIdx >= 0 && lastVowelIdx + 1 < norm.length ? norm.slice(lastVowelIdx + 1) : '';

  // Pick dominant vowel for formant synthesis (open vowels a/e/o take priority over glides i/u)
  let dominantVowel: VowelKey = 'a';
  if (vowelCluster.includes('a')) dominantVowel = 'a';
  else if (vowelCluster.includes('e')) dominantVowel = 'e';
  else if (vowelCluster.includes('o')) dominantVowel = 'o';
  else if (vowelCluster.includes('i')) dominantVowel = 'i';
  else if (vowelCluster.includes('u')) dominantVowel = 'u';

  const classifyOnset = (c: string): PhonemeAnalysis['onsetType'] => {
    if (!c) return 'none';
    if (/^(s|f|z|j|h|sh|ch|th)/.test(c)) return 'fricative';
    if (/^(m|n|ñ)/.test(c)) return 'nasal';
    if (/^(l|r|y|w)/.test(c)) return 'liquid';
    return 'plosive';
  };

  const classifyCoda = (c: string): PhonemeAnalysis['codaType'] => {
    if (!c) return 'none';
    if (/^(s|z|f|sh|th)/.test(c)) return 'fricative';
    if (/^(m|n|ng)/.test(c)) return 'nasal';
    return 'plosive';
  };

  // Build readable phonetic spacing like Vocaloid ("m o", "th e l", "c ua n")
  const rawTokens: string[] = [];
  if (onset) rawTokens.push(onset);
  for (const ch of vowelCluster) {
    if (isVowelChar(ch)) rawTokens.push(ch);
  }
  if (coda) rawTokens.push(coda);

  return {
    syllable: syl,
    phonetic: rawTokens.join(' '),
    onsetConsonant: onset,
    onsetType: classifyOnset(onset),
    vowel: dominantVowel,
    codaConsonant: coda,
    codaType: classifyCoda(coda),
  };
}

// Evaluates the continuous orange pitch curve (MIDI float) at any beat position.
export function evaluatePitchAtBeat(
  notes: VocalNote[],
  pitchPoints: PitchControlPoint[],
  beat: number,
  bpm: number,
  pitLanePoints?: ParamAutomationPoint[],
  pbsSemitones = 4,
  robotVoice: RobotVoiceMode = 'off'
): number | null {
  if (notes.length === 0) return null;

  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);

  let activeIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    if (beat >= n.startBeat && beat <= n.startBeat + n.durationBeats) {
      activeIdx = i;
      break;
    }
  }

  let baseMidi: number | null = null;
  let vibrato = 0;

  if (activeIdx >= 0) {
    const curr = sorted[activeIdx];
    const prev = activeIdx > 0 ? sorted[activeIdx - 1] : null;
    const elapsedBeats = beat - curr.startBeat;
    const elapsedSec = (elapsedBeats * 60) / bpm;

    const gapBeats = prev ? curr.startBeat - (prev.startBeat + prev.durationBeats) : 999;
    const portEnabled = robotVoice !== 'hard' && curr.portamentoEnabled !== false;
    const glideSec = portEnabled
      ? Math.max(0.01, (curr.portamentoMs || 35) * (robotVoice === 'soft' ? 0.45 : 1) * 0.001)
      : 0;
    const LEGATO_GAP_BEATS = 0.05 + 1e-6;

    // Legato notes (gap <= 0.05 beats): apply crisp 35ms S-curve portamento at note onset.
    // Gapped notes already arrive at curr.midi at the end of the inter-note glide, avoiding any spike.
    if (portEnabled && prev && gapBeats <= LEGATO_GAP_BEATS && elapsedSec < glideSec) {
      const t = Math.max(0, Math.min(1, elapsedSec / glideSec));
      const smoothT = t * t * (3 - 2 * t);
      baseMidi = prev.midi + (curr.midi - prev.midi) * smoothT;
    } else if (robotVoice === 'off' && (!prev || gapBeats > 1.25) && elapsedSec < 0.03) {
      const scoop = (1 - elapsedSec / 0.03) * -0.22;
      baseMidi = curr.midi + scoop;
    } else {
      baseMidi = curr.midi;
    }

    // Crypton Accent (%) onset pitch inflection on stressed/accented notes
    const accentNorm = ((curr.accent ?? 50) - 50) / 50; // -1..+1
    if (robotVoice !== 'hard' && accentNorm > 0.05 && elapsedSec < 0.055) {
      const env = Math.sin((elapsedSec / 0.055) * Math.PI);
      baseMidi += env * 0.25 * accentNorm;
    }

    const totalSec = (curr.durationBeats * 60) / bpm;
    const vibPreset = curr.vibratoType ? VIBRATO_PRESETS[curr.vibratoType] : null;
    const vibRate = vibPreset ? vibPreset.rateHz : (curr.vibratoRate || 6.0);
    const rawVibDepth = vibPreset
      ? (curr.vibratoType === 'none' ? 0 : Math.max(vibPreset.depthSemitones, curr.vibratoDepth * 0.5))
      : curr.vibratoDepth;
    const vibDepth =
      robotVoice === 'hard' ? 0 : robotVoice === 'soft' ? rawVibDepth * 0.35 : rawVibDepth;

    const prosody = evaluateProsodyOffset(
      elapsedSec,
      totalSec,
      robotVoice === 'hard' ? false : Boolean(noteIsStressed(curr)),
      robotVoice === 'hard' ? 'none' : (curr.punctuation ?? 'none'),
      {
        vibratoRateHz: vibRate,
        vibratoDepthSemitones: vibDepth,
        vibratoAmplitudeDepth: 0.06,
        vibratoDelaySec: 0.15,
        stressPitchBoostSemitones: 0.55,
        baseBreathiness: 0.09,
        phraseEndBreathiness: 0.36,
      },
      vibDepth > 0.001
    );
    vibrato = prosody.pitchOffsetSemitones;
  } else if (robotVoice !== 'hard') {
    // Crisp S-curve portamento across gaps between consecutive notes, arriving at right.midi seamlessly
    const LEGATO_GAP_BEATS = 0.05 + 1e-6;
    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i];
      const right = sorted[i + 1];
      const leftEnd = left.startBeat + left.durationBeats;
      if (beat > leftEnd && beat < right.startBeat) {
        const gap = right.startBeat - leftEnd;
        const portEnabled = right.portamentoEnabled !== false;
        if (gap <= LEGATO_GAP_BEATS) {
          baseMidi = left.midi;
        } else if (gap <= 1.25) {
          if (!portEnabled) {
            baseMidi = left.midi;
          } else {
            const glideBeats = Math.min(gap, Math.max(0.06, ((right.portamentoMs || 35) * 0.001 * bpm) / 60));
            const glideStart = right.startBeat - glideBeats;
            if (beat <= glideStart) {
              baseMidi = left.midi;
            } else {
              const t = (beat - glideStart) / Math.max(0.001, glideBeats);
              const smoothT = t * t * (3 - 2 * t);
              baseMidi = left.midi + (right.midi - left.midi) * smoothT;
            }
          }
        }
        break;
      }
    }
  }

  if (baseMidi === null) return null;

  // Add user-drawn pitch bend offsets (legacy pitchPoints + Crypton PIT lane scaled by PBS)
  if (pitchPoints.length > 0) {
    const sortedPts = [...pitchPoints].sort((a, b) => a.beat - b.beat);
    let offset = 0;
    for (let i = 0; i < sortedPts.length; i++) {
      const p = sortedPts[i];
      if (Math.abs(p.beat - beat) < 0.001) {
        offset = p.offsetSemitones;
        break;
      }
      if (i < sortedPts.length - 1) {
        const next = sortedPts[i + 1];
        if (beat >= p.beat && beat <= next.beat && next.beat - p.beat <= 0.75) {
          const t = (beat - p.beat) / Math.max(0.001, next.beat - p.beat);
          offset = p.offsetSemitones + (next.offsetSemitones - p.offsetSemitones) * t;
          break;
        }
      }
    }
    baseMidi += offset;
  }

  if (pitLanePoints && pitLanePoints.length > 0) {
    const pitRaw = evaluateParamLaneAtBeat(pitLanePoints, beat, 0);
    baseMidi += pitToSemitones(pitRaw, pbsSemitones);
  }

  return baseMidi + vibrato;
}

function noteIsStressed(note: VocalNote): boolean {
  return Boolean(note.isStressed);
}

// Generates a full song note sequence from pasted lyrics using G2P IPA + stress + prosody hints.
export function buildNotesFromLyrics(
  lyricsText: string,
  baseMidi = 60,
  stepBeats = 0.75,
  lang: G2PLanguage = 'auto'
): VocalNote[] {
  const tokens = convertLyricsToG2P(lyricsText, lang);
  if (tokens.length === 0) return [];

  // Expressive pop/ballad scale degrees in semitones relative to root (Major scale)
  const melodyPattern = [0, 2, 4, 7, 5, 4, 2, 4, 7, 9, 7, 5, 4, 2, 0, -3];
  const notes: VocalNote[] = [];
  let cursorBeat = 0.5;

  tokens.forEach((tok, idx) => {
    const degree = melodyPattern[idx % melodyPattern.length];
    const isPhraseEnd = tok.isLineEnd || tok.punctuation !== 'none' || idx === tokens.length - 1;
    const duration = isPhraseEnd ? Math.max(stepBeats * 1.65, 1.25) : stepBeats;

    notes.push({
      id: `note-${Date.now()}-${idx}`,
      midi: Math.max(48, Math.min(79, baseMidi + degree + (tok.isStressed ? 1 : 0))),
      startBeat: Number(cursorBeat.toFixed(2)),
      durationBeats: Number(duration.toFixed(2)),
      lyric: tok.text,
      phonetic: tok.ipaDisplay,
      vibratoDepth: isPhraseEnd ? 0.3 : 0.16,
      vibratoRate: 6.0,
      portamentoMs: 35,
      isStressed: tok.isStressed,
      punctuation: tok.punctuation,
      g2pLanguage: tok.language,
    });

    cursorBeat += duration + (isPhraseEnd ? 0.5 : 0.08);
  });

  return notes;
}

export const DEMO_SONG_LYRICS = `Cuan-do sa-le el sol
bri-lla en tu voz!
Tell me why we sing?
de mo wo si te`;

export const FAST_POP_ENGLISH_LYRICS = `We're wai-ting ev-ry night
to fi-nal-ly roam and in-vite!
Five Nights at Fred-dy's,
is this where you want to stay?`;

export function createDemoSongNotes(): VocalNote[] {
  const spec: Array<{
    lyric: string;
    midi: number;
    start: number;
    dur: number;
    vib: number;
    stressed?: boolean;
    punctuation?: PunctuationTone;
    lang?: G2PLanguage;
  }> = [
    { lyric: 'Cuan', midi: 64, start: 0.5, dur: 0.75, vib: 0.15, stressed: true, lang: 'es' },
    { lyric: 'do', midi: 66, start: 1.35, dur: 0.75, vib: 0.15, stressed: false, lang: 'es' },
    { lyric: 'sa', midi: 69, start: 2.2, dur: 1.1, vib: 0.28, stressed: true, lang: 'es' },
    { lyric: 'le', midi: 67, start: 3.4, dur: 0.65, vib: 0.15, stressed: false, lang: 'es' },
    { lyric: 'el', midi: 66, start: 4.2, dur: 0.65, vib: 0.12, stressed: false, lang: 'es' },
    { lyric: 'sol', midi: 69, start: 5.0, dur: 1.5, vib: 0.34, stressed: true, punctuation: 'comma', lang: 'es' },

    { lyric: 'bri', midi: 67, start: 7.0, dur: 0.75, vib: 0.15, stressed: true, lang: 'es' },
    { lyric: 'lla', midi: 69, start: 7.85, dur: 0.75, vib: 0.18, stressed: false, lang: 'es' },
    { lyric: 'en', midi: 71, start: 8.7, dur: 0.75, vib: 0.18, stressed: false, lang: 'es' },
    { lyric: 'tu', midi: 69, start: 9.55, dur: 0.7, vib: 0.16, stressed: false, lang: 'es' },
    { lyric: 'voz!', midi: 72, start: 10.35, dur: 1.65, vib: 0.36, stressed: true, punctuation: 'exclamation', lang: 'es' },

    { lyric: 'Tell', midi: 62, start: 12.5, dur: 0.9, vib: 0.22, stressed: true, lang: 'en' },
    { lyric: 'me', midi: 69, start: 13.5, dur: 0.9, vib: 0.24, stressed: false, lang: 'en' },
    { lyric: 'why?', midi: 67, start: 14.5, dur: 0.95, vib: 0.2, stressed: true, punctuation: 'question', lang: 'en' },
    { lyric: 'sing', midi: 69, start: 15.55, dur: 0.6, vib: 0.22, stressed: true, lang: 'en' },
    { lyric: 'do', midi: 64, start: 16.25, dur: 0.85, vib: 0.25, stressed: false, lang: 'es' },
    { lyric: 'wo', midi: 69, start: 17.5, dur: 0.65, vib: 0.2, stressed: false, lang: 'en' },
    { lyric: 'Si', midi: 67, start: 18.25, dur: 0.85, vib: 0.22, stressed: false, lang: 'es' },
    { lyric: 'te', midi: 69, start: 19.2, dur: 1.55, vib: 0.34, stressed: false, punctuation: 'period', lang: 'es' },
  ];

  return spec.map((item, idx) => {
    const g2p = syllableToG2P(
      item.lyric,
      item.lang ?? 'auto',
      item.punctuation ?? 'none',
      Boolean(item.stressed)
    );
    return {
      id: `demo-note-${idx}`,
      midi: item.midi,
      startBeat: item.start,
      durationBeats: item.dur,
      lyric: g2p.text,
      phonetic: g2p.ipaDisplay,
      vibratoDepth: item.vib,
      vibratoRate: 6.0,
      portamentoMs: 35,
      isStressed: g2p.isStressed,
      punctuation: g2p.punctuation,
      g2pLanguage: g2p.language,
    };
  });
}
