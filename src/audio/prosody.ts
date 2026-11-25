import { PunctuationTone } from './g2p';

export interface ProsodyParams {
  vibratoRateHz: number;
  vibratoDepthSemitones: number;
  vibratoAmplitudeDepth: number;
  vibratoDelaySec: number;
  stressPitchBoostSemitones: number;
  baseBreathiness: number;
  phraseEndBreathiness: number;
}

export interface ProsodyFrame {
  pitchOffsetSemitones: number;
  amplitudeGain: number;
  breathiness: number;
}

export function evaluateProsodyOffset(
  elapsedSec: number,
  totalSec: number,
  isStressed: boolean,
  punctuation: PunctuationTone,
  params: ProsodyParams,
  includeVibrato = true
): ProsodyFrame {
  const progress = totalSec > 0.001 ? Math.max(0, Math.min(1, elapsedSec / totalSec)) : 0;
  let pitchOffsetSemitones = 0;

  // 1. Word stress accentuation arch
  if (isStressed) {
    pitchOffsetSemitones += params.stressPitchBoostSemitones * Math.sin(Math.PI * progress);
  }

  // 2. Punctuation inflection over final 35% of phrase-ending syllable
  if (progress > 0.65 && punctuation !== 'none') {
    const tail = (progress - 0.65) / 0.35;
    const curve = tail * tail;
    switch (punctuation) {
      case 'question':
        pitchOffsetSemitones += 2.6 * curve;
        break;
      case 'comma':
        pitchOffsetSemitones += 0.7 * curve;
        break;
      case 'period':
        pitchOffsetSemitones -= 1.4 * curve;
        break;
      case 'exclamation':
        pitchOffsetSemitones += (0.8 - 1.6 * tail) * tail;
        break;
      default:
        break;
    }
  }

  // 3. Delayed FM + AM Vibrato (5.5-6.5 Hz, active when note > 250ms with 150ms fade-in)
  let amplitudeGain = isStressed ? 1.12 : 0.96;
  const delaySec = params.vibratoDelaySec > 0 ? params.vibratoDelaySec : 0.15;
  if (includeVibrato && totalSec > 0.25 && elapsedSec > delaySec && params.vibratoDepthSemitones > 0) {
    const fade = Math.min(1, (elapsedSec - delaySec) / 0.15);
    const vibOsc = Math.sin(2 * Math.PI * params.vibratoRateHz * (elapsedSec - delaySec));
    pitchOffsetSemitones += vibOsc * params.vibratoDepthSemitones * fade;
    amplitudeGain *= 1 + vibOsc * params.vibratoAmplitudeDepth * fade;
  }

  // 4. Aspirated breathiness on phrase-final punctuation boundaries
  let breathiness = params.baseBreathiness;
  if (punctuation !== 'none' && progress > 0.65) {
    const tail = (progress - 0.65) / 0.35;
    breathiness += (params.phraseEndBreathiness - params.baseBreathiness) * tail;
  }

  return {
    pitchOffsetSemitones,
    amplitudeGain,
    breathiness: Math.max(0, Math.min(0.65, breathiness)),
  };
}
