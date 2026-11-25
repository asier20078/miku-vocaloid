import { PhonemeManner, PhonemeSpec } from './g2p';

export type DiphoneCategory = 'CV' | 'VC' | 'VV' | 'CC';

export interface DiphoneTransition {
  fromIpa: string;
  toIpa: string;
  category: DiphoneCategory;
  transitionMs: number; // 22..45 ms
  crossfadeWeight: number; // 0..1
  spliceBias: number; // 0.3..0.7 shift of crossfade center between phonemes
}

// Explicit diphone transition timings (in ms) for bilingual ES/EN Vocaloid/UTAU singing
const DIPHONE_TABLE: Record<string, number> = {
  // Common English & Spanish C-V / V-C / V-V diphones
  'w-i': 34,
  'i-ɾ': 28,
  'w-e': 35,
  'e-i': 38,
  'a-i': 36,
  'o-u': 36,
  't-o': 28,
  't-i': 28,
  't-a': 30,
  'k-a': 32,
  'k-u': 28,
  'p-a': 30,
  'b-ɾ': 34,
  'f-ɾ': 32,
  's-o': 32,
  's-i': 28,
  's-t': 26,
  'n-t': 25,
  'm-i': 32,
  'm-o': 32,
  'l-a': 34,
  'ɾ-o': 30,
  'θ-i': 30,
  'ʃ-a': 34,
};

export function classifyDiphone(fromManner: PhonemeManner, toManner: PhonemeManner): DiphoneCategory {
  const fromVowel = fromManner === 'vowel';
  const toVowel = toManner === 'vowel';
  if (!fromVowel && toVowel) return 'CV';
  if (fromVowel && !toVowel) return 'VC';
  if (fromVowel && toVowel) return 'VV';
  return 'CC';
}

export function getDiphoneTransition(from: PhonemeSpec, to: PhonemeSpec): DiphoneTransition {
  const key = `${from.ipa}-${to.ipa}`;
  const category = classifyDiphone(from.manner, to.manner);

  let defaultMs = 30;
  let crossfadeWeight = 0.65;
  let spliceBias = 0.5;

  switch (category) {
    case 'CV':
      // Consonant -> Vowel: rapid release into stable vowel formants
      defaultMs = from.manner === 'plosive' || from.manner === 'affricate' ? 28 : 34;
      crossfadeWeight = 0.85;
      spliceBias = 0.38;
      break;
    case 'VC':
      // Vowel -> Consonant: smooth anticipatory tongue closure
      defaultMs = to.manner === 'plosive' || to.manner === 'affricate' ? 26 : 32;
      crossfadeWeight = 0.72;
      spliceBias = 0.62;
      break;
    case 'VV':
      // Vowel -> Vowel diphthong glide
      defaultMs = 38;
      crossfadeWeight = 0.8;
      spliceBias = 0.5;
      break;
    case 'CC':
      defaultMs = 24;
      crossfadeWeight = 0.55;
      spliceBias = 0.5;
      break;
  }

  const tableMs = DIPHONE_TABLE[key];
  const rawMs = tableMs ?? defaultMs;
  const transitionMs = Math.max(22, Math.min(45, rawMs));

  return {
    fromIpa: from.ipa,
    toIpa: to.ipa,
    category,
    transitionMs,
    crossfadeWeight,
    spliceBias,
  };
}

export function buildDiphoneSequence(phonemes: PhonemeSpec[]): DiphoneTransition[] {
  const transitions: DiphoneTransition[] = [];
  for (let i = 0; i < phonemes.length - 1; i++) {
    transitions.push(getDiphoneTransition(phonemes[i], phonemes[i + 1]));
  }
  return transitions;
}
