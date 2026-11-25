export type G2PLanguage = 'auto' | 'es' | 'en';

export type PhonemeManner =
  | 'silence'
  | 'vowel'
  | 'plosive'
  | 'fricative'
  | 'affricate'
  | 'nasal'
  | 'liquid'
  | 'trill';

export type PunctuationTone = 'none' | 'comma' | 'period' | 'question' | 'exclamation';

export interface PhonemeSpec {
  ipa: string;
  manner: PhonemeManner;
  voiced: boolean;
  f1: number;
  f2: number;
  f3: number;
  bw1: number;
  bw2: number;
  bw3: number;
  antiResonanceHz: number;
  noiseCenterHz: number;
  noiseQ: number;
  closureMs: number;
  burstMs: number;
  trillRateHz: number;
  relativeDuration: number;
}

export interface SyllableG2P {
  text: string;
  ipaDisplay: string;
  language: 'es' | 'en';
  isStressed: boolean;
  isWordEnd: boolean;
  isLineEnd: boolean;
  punctuation: PunctuationTone;
  phonemes: PhonemeSpec[];
}

function isAsciiVowel(ch: string): boolean {
  const c = ch.toLowerCase();
  return c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u';
}

function normalizeSpanishWord(input: string): { ascii: string; explicitStressCharIdx: number } {
  let explicitStressCharIdx = -1;
  let nonHyphenLen = 0;
  let out = '';

  for (const rawCh of input) {
    const ch = rawCh.toLowerCase();
    if (ch === '-') {
      out += ch;
      continue;
    }
    if (ch === 'á') {
      explicitStressCharIdx = nonHyphenLen;
      out += 'a';
      nonHyphenLen += 1;
    } else if (ch === 'é') {
      explicitStressCharIdx = nonHyphenLen;
      out += 'e';
      nonHyphenLen += 1;
    } else if (ch === 'í') {
      explicitStressCharIdx = nonHyphenLen;
      out += 'i';
      nonHyphenLen += 1;
    } else if (ch === 'ó') {
      explicitStressCharIdx = nonHyphenLen;
      out += 'o';
      nonHyphenLen += 1;
    } else if (ch === 'ú') {
      explicitStressCharIdx = nonHyphenLen;
      out += 'u';
      nonHyphenLen += 1;
    } else if (ch === 'ü') {
      out += 'u';
      nonHyphenLen += 1;
    } else if (ch === 'ñ') {
      out += 'ny';
      nonHyphenLen += 2;
    } else if (ch === 'à') {
      out += 'a';
      nonHyphenLen += 1;
    } else if (ch === 'è') {
      out += 'e';
      nonHyphenLen += 1;
    } else if (ch === 'ì') {
      out += 'i';
      nonHyphenLen += 1;
    } else if (ch === 'ò') {
      out += 'o';
      nonHyphenLen += 1;
    } else if (ch === 'ù') {
      out += 'u';
      nonHyphenLen += 1;
    } else {
      out += ch;
      nonHyphenLen += 1;
    }
  }

  return { ascii: out, explicitStressCharIdx };
}

export function extractPunctuationFromWord(rawWord: string): {
  cleaned: string;
  punctuation: PunctuationTone;
} {
  let word = rawWord.trim();
  let tone: PunctuationTone = 'none';

  while (word.length > 0) {
    const last = word[word.length - 1];
    if (last === '?') {
      tone = 'question';
      word = word.slice(0, -1);
    } else if (last === '!') {
      tone = 'exclamation';
      word = word.slice(0, -1);
    } else if (last === '.') {
      tone = 'period';
      word = word.slice(0, -1);
    } else if (last === ',' || last === ';') {
      tone = 'comma';
      word = word.slice(0, -1);
    } else if (last === '"' || last === "'" || last === ')' || last === ':' || last === ']' || last === '}') {
      word = word.slice(0, -1);
    } else {
      break;
    }
  }

  while (word.length > 0) {
    const first = word[0];
    if (first === '(' || first === '"' || first === "'" || first === '¿' || first === '¡' || first === '[' || first === '{') {
      word = word.slice(1);
    } else {
      break;
    }
  }

  return { cleaned: word, punctuation: tone };
}

export function detectWordLanguage(word: string): 'es' | 'en' {
  const lower = word.toLowerCase();
  if (/[ñáéíóúü¿¡]/.test(lower)) return 'es';
  if (/(sh|th|wh|oo|ee|ng|ck|ph|ght)/.test(lower) || /[wk]/.test(lower)) return 'en';
  if (/\b(the|tell|why|you|me|we|sing|love|night|light|dream|sky|heart|shadow|think|make|time)\b/.test(lower)) {
    return 'en';
  }
  return 'es';
}

const ONSET_CLUSTERS = new Set([
  'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr',
  'bl', 'cl', 'fl', 'gl', 'pl',
  'ch', 'll', 'rr', 'th', 'sh', 'qu', 'gu', 'ny',
]);

export function syllabifyAscii(w: string, isEnglish = false): string[] {
  if (!w) return [];
  if (w.includes('-')) {
    const manual = w.split('-').map((s) => s.trim()).filter(Boolean);
    if (manual.length > 0) return manual;
  }

  const effectiveLen =
    isEnglish && w.length >= 4 && w.endsWith('e') && !isAsciiVowel(w[w.length - 2]) && isAsciiVowel(w[w.length - 3])
      ? w.length - 1
      : w.length;

  const nuclei: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < effectiveLen; i++) {
    if (isAsciiVowel(w[i])) {
      const prev = nuclei[nuclei.length - 1];
      if (prev && i === prev.end + 1) {
        prev.end = i;
      } else {
        nuclei.push({ start: i, end: i });
      }
    }
  }

  if (nuclei.length <= 1) return [w];

  const out: string[] = [];
  let cursor = 0;

  for (let n = 0; n < nuclei.length - 1; n++) {
    const currEnd = nuclei[n].end;
    const nextStart = nuclei[n + 1].start;
    const cSpan = nextStart - currEnd - 1;
    let splitAt = currEnd + 1;

    if (cSpan >= 2) {
      const pair = w.slice(nextStart - 2, nextStart);
      splitAt = cSpan === 2 && ONSET_CLUSTERS.has(pair) ? currEnd + 1 : currEnd + 2;
    }

    out.push(w.slice(cursor, splitAt));
    cursor = splitAt;
  }

  if (cursor < w.length) {
    out.push(w.slice(cursor));
  }

  return out.filter(Boolean);
}

function spanishSyllableToIpaList(s: string, wordStart: boolean): string[] {
  const ipa: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = i + 1 < s.length ? s[i + 1] : '';
    const next2 = i + 2 < s.length ? s[i + 2] : '';

    if (c === 'c' && next === 'h') { ipa.push('tʃ'); i++; continue; }
    if (c === 'l' && next === 'l') { ipa.push('ʝ'); i++; continue; }
    if (c === 'r' && next === 'r') { ipa.push('r'); i++; continue; }
    if (c === 'n' && next === 'y') { ipa.push('ɲ'); i++; continue; }
    if (c === 'q' && next === 'u') { ipa.push('k'); i++; continue; }
    if (c === 'g' && next === 'u' && (next2 === 'e' || next2 === 'i')) {
      ipa.push('g');
      i++;
      continue;
    }
    if (c === 'h') continue;
    if (c === 'c') {
      ipa.push(next === 'e' || next === 'i' ? 's' : 'k');
      continue;
    }
    if (c === 'g') {
      ipa.push(next === 'e' || next === 'i' ? 'x' : 'g');
      continue;
    }
    if (c === 'j') { ipa.push('x'); continue; }
    if (c === 'z') { ipa.push('s'); continue; }
    if (c === 'v') { ipa.push('b'); continue; }
    if (c === 'y') { ipa.push(next && isAsciiVowel(next) ? 'ʝ' : 'i'); continue; }
    if (c === 'r') {
      ipa.push(wordStart && i === 0 ? 'r' : 'ɾ');
      continue;
    }
    if (/[a-z]/.test(c)) ipa.push(c);
  }
  return ipa;
}

function englishSyllableToIpaList(s: string, isWordEnd: boolean): string[] {
  const ipa: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = i + 1 < s.length ? s[i + 1] : '';
    const next2 = i + 2 < s.length ? s[i + 2] : '';

    if (c === "'") continue;
    if (isWordEnd && c === 'e' && i === s.length - 1 && s.length >= 3 && !isAsciiVowel(s[i - 1])) {
      continue;
    }
    if (c === 'i' && next === 'g' && next2 === 'h') { ipa.push('a', 'i'); i += 2; continue; }
    if (c === 'g' && next === 'h') { i++; continue; }
    if (c === 'k' && next === 'n' && i === 0) { ipa.push('n'); i++; continue; }
    if (c === 'w' && next === 'h') { ipa.push('w'); i++; continue; }
    if (c === 's' && next === 'h') { ipa.push('ʃ'); i++; continue; }
    if (c === 'c' && next === 'h') { ipa.push('tʃ'); i++; continue; }
    if (c === 't' && next === 'h') { ipa.push('θ'); i++; continue; }
    if (c === 'p' && next === 'h') { ipa.push('f'); i++; continue; }
    if (c === 'n' && next === 'g') { ipa.push('ŋ'); i++; continue; }
    if (c === 'n' && next === 'k') { ipa.push('ŋ', 'k'); i++; continue; }
    if (c === 'q' && next === 'u') { ipa.push('k', 'w'); i++; continue; }
    if (c === 'e' && next === 'e') { ipa.push('i'); i++; continue; }
    if (c === 'e' && next === 'a') { ipa.push('i'); i++; continue; }
    if (c === 'o' && next === 'o') { ipa.push('u'); i++; continue; }
    if (c === 'o' && next === 'w') { ipa.push('o', 'u'); i++; continue; }
    if (c === 'a' && next === 'i') { ipa.push('e', 'i'); i++; continue; }
    if (c === 'e' && next === 'y') { ipa.push('i'); i++; continue; }
    if (c === 'j') { ipa.push('dʒ'); continue; }
    if (c === 'c') { ipa.push(next === 'e' || next === 'i' || next === 'y' ? 's' : 'k'); continue; }
    if (c === 'y') { ipa.push(i === 0 ? 'ʝ' : 'i'); continue; }
    if (c === 'r') { ipa.push('ɾ'); continue; }
    if (c === 'a' && !next && s.length === 1) { ipa.push('ə'); continue; }
    if (/[a-z]/.test(c)) ipa.push(c);
  }
  return ipa;
}

const IPA_TABLE: Record<string, PhonemeSpec> = {
  // Vowels
  a: { ipa: 'a', manner: 'vowel', voiced: true, f1: 760, f2: 1180, f3: 2520, bw1: 80, bw2: 110, bw3: 160, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 1.15 },
  e: { ipa: 'e', manner: 'vowel', voiced: true, f1: 510, f2: 1890, f3: 2550, bw1: 70, bw2: 110, bw3: 160, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 1.05 },
  i: { ipa: 'i', manner: 'vowel', voiced: true, f1: 310, f2: 2320, f3: 3020, bw1: 60, bw2: 120, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 1.00 },
  o: { ipa: 'o', manner: 'vowel', voiced: true, f1: 460, f2: 840, f3: 2580, bw1: 70, bw2: 100, bw3: 160, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 1.10 },
  u: { ipa: 'u', manner: 'vowel', voiced: true, f1: 330, f2: 710, f3: 2490, bw1: 65, bw2: 95, bw3: 160, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 1.05 },
  'ə': { ipa: 'ə', manner: 'vowel', voiced: true, f1: 520, f2: 1450, f3: 2500, bw1: 85, bw2: 120, bw3: 170, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.90 },

  // Voiceless Plosives (crisp 25-45 ms total attack/burst for fast Vocaloid pop clarity)
  p: { ipa: 'p', manner: 'plosive', voiced: false, f1: 400, f2: 900, f3: 2200, bw1: 90, bw2: 140, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 3400, noiseQ: 1.6, closureMs: 22, burstMs: 14, trillRateHz: 0, relativeDuration: 0.30 },
  t: { ipa: 't', manner: 'plosive', voiced: false, f1: 380, f2: 1750, f3: 2600, bw1: 90, bw2: 140, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 5200, noiseQ: 2.0, closureMs: 20, burstMs: 15, trillRateHz: 0, relativeDuration: 0.28 },
  k: { ipa: 'k', manner: 'plosive', voiced: false, f1: 350, f2: 1400, f3: 2300, bw1: 90, bw2: 140, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 3600, noiseQ: 2.1, closureMs: 24, burstMs: 16, trillRateHz: 0, relativeDuration: 0.32 },

  // Voiced Plosives (25-45 ms fast articulation)
  b: { ipa: 'b', manner: 'plosive', voiced: true, f1: 340, f2: 900, f3: 2200, bw1: 80, bw2: 120, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 3100, noiseQ: 1.5, closureMs: 18, burstMs: 11, trillRateHz: 0, relativeDuration: 0.24 },
  d: { ipa: 'd', manner: 'plosive', voiced: true, f1: 330, f2: 1700, f3: 2600, bw1: 80, bw2: 120, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 4400, noiseQ: 1.8, closureMs: 17, burstMs: 11, trillRateHz: 0, relativeDuration: 0.23 },
  g: { ipa: 'g', manner: 'plosive', voiced: true, f1: 320, f2: 1350, f3: 2250, bw1: 80, bw2: 120, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 3150, noiseQ: 1.9, closureMs: 20, burstMs: 12, trillRateHz: 0, relativeDuration: 0.26 },

  // Fricatives & Aspirated Consonants (3 kHz - 10 kHz aperiodicity band)
  s: { ipa: 's', manner: 'fricative', voiced: false, f1: 400, f2: 1800, f3: 2700, bw1: 120, bw2: 160, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 7200, noiseQ: 2.8, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.42 },
  z: { ipa: 'z', manner: 'fricative', voiced: true, f1: 380, f2: 1700, f3: 2600, bw1: 110, bw2: 150, bw3: 190, antiResonanceHz: 0, noiseCenterHz: 5800, noiseQ: 2.5, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.38 },
  f: { ipa: 'f', manner: 'fricative', voiced: false, f1: 420, f2: 1200, f3: 2400, bw1: 120, bw2: 160, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 4400, noiseQ: 1.4, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.38 },
  'θ': { ipa: 'θ', manner: 'fricative', voiced: false, f1: 410, f2: 1450, f3: 2500, bw1: 120, bw2: 160, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 5100, noiseQ: 1.6, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.36 },
  'ʃ': { ipa: 'ʃ', manner: 'fricative', voiced: false, f1: 400, f2: 1950, f3: 2700, bw1: 120, bw2: 160, bw3: 200, antiResonanceHz: 0, noiseCenterHz: 3600, noiseQ: 2.6, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.44 },
  x: { ipa: 'x', manner: 'fricative', voiced: false, f1: 480, f2: 1250, f3: 2400, bw1: 130, bw2: 170, bw3: 210, antiResonanceHz: 0, noiseCenterHz: 3200, noiseQ: 1.8, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.40 },
  h: { ipa: 'h', manner: 'fricative', voiced: false, f1: 500, f2: 1500, f3: 2500, bw1: 150, bw2: 200, bw3: 250, antiResonanceHz: 0, noiseCenterHz: 3400, noiseQ: 1.1, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.30 },
  'ʝ': { ipa: 'ʝ', manner: 'fricative', voiced: true, f1: 320, f2: 2100, f3: 2900, bw1: 90, bw2: 130, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 3800, noiseQ: 2.0, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.32 },

  // Affricates
  'tʃ': { ipa: 'tʃ', manner: 'affricate', voiced: false, f1: 380, f2: 1950, f3: 2750, bw1: 100, bw2: 140, bw3: 190, antiResonanceHz: 0, noiseCenterHz: 4100, noiseQ: 2.5, closureMs: 22, burstMs: 22, trillRateHz: 0, relativeDuration: 0.42 },
  'dʒ': { ipa: 'dʒ', manner: 'affricate', voiced: true, f1: 350, f2: 1900, f3: 2700, bw1: 95, bw2: 135, bw3: 185, antiResonanceHz: 0, noiseCenterHz: 3700, noiseQ: 2.2, closureMs: 20, burstMs: 20, trillRateHz: 0, relativeDuration: 0.38 },

  // Nasals (with antiresonance zero notch frequency)
  m: { ipa: 'm', manner: 'nasal', voiced: true, f1: 280, f2: 950, f3: 2200, bw1: 65, bw2: 140, bw3: 190, antiResonanceHz: 750, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.36 },
  n: { ipa: 'n', manner: 'nasal', voiced: true, f1: 290, f2: 1550, f3: 2450, bw1: 65, bw2: 140, bw3: 190, antiResonanceHz: 1150, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.34 },
  'ɲ': { ipa: 'ɲ', manner: 'nasal', voiced: true, f1: 285, f2: 2050, f3: 2750, bw1: 65, bw2: 140, bw3: 190, antiResonanceHz: 1450, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.36 },
  'ŋ': { ipa: 'ŋ', manner: 'nasal', voiced: true, f1: 275, f2: 1150, f3: 2350, bw1: 65, bw2: 140, bw3: 190, antiResonanceHz: 1600, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.35 },

  // Liquids & Trills
  l: { ipa: 'l', manner: 'liquid', voiced: true, f1: 360, f2: 1300, f3: 2650, bw1: 75, bw2: 120, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.32 },
  w: { ipa: 'w', manner: 'liquid', voiced: true, f1: 320, f2: 680, f3: 2350, bw1: 70, bw2: 100, bw3: 170, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 0, relativeDuration: 0.30 },
  'ɾ': { ipa: 'ɾ', manner: 'liquid', voiced: true, f1: 390, f2: 1380, f3: 2100, bw1: 80, bw2: 130, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 14, burstMs: 8, trillRateHz: 0, relativeDuration: 0.24 },
  r: { ipa: 'r', manner: 'trill', voiced: true, f1: 410, f2: 1350, f3: 2150, bw1: 85, bw2: 135, bw3: 180, antiResonanceHz: 0, noiseCenterHz: 0, noiseQ: 2, closureMs: 0, burstMs: 0, trillRateHz: 26, relativeDuration: 0.46 },
};

export function lookupIpa(ipa: string): PhonemeSpec {
  return IPA_TABLE[ipa] ?? IPA_TABLE.a;
}

export function syllableToG2P(
  rawSyllable: string,
  lang: G2PLanguage = 'auto',
  punctuation: PunctuationTone = 'none',
  isStressed = false,
  isWordStart = true,
  isWordEnd = true
): SyllableG2P {
  const { cleaned, punctuation: inlinePunc } = extractPunctuationFromWord(rawSyllable);
  const effectiveWord = cleaned || 'la';
  const resolvedLang: 'es' | 'en' = lang === 'auto' ? detectWordLanguage(effectiveWord) : lang;
  const { ascii } = normalizeSpanishWord(effectiveWord);
  const ipas =
    resolvedLang === 'es'
      ? spanishSyllableToIpaList(ascii, isWordStart)
      : englishSyllableToIpaList(ascii, isWordEnd);
  const safeIpas = ipas.length > 0 ? ipas : ['a'];
  const ipaRaw = safeIpas.join(' ');

  return {
    text: effectiveWord,
    ipaDisplay: isStressed ? `ˈ${ipaRaw}` : ipaRaw,
    language: resolvedLang,
    isStressed,
    isWordEnd,
    isLineEnd: false,
    punctuation: punctuation !== 'none' ? punctuation : inlinePunc,
    phonemes: safeIpas.map(lookupIpa),
  };
}

export function convertLyricsToG2P(text: string, lang: G2PLanguage = 'auto'): SyllableG2P[] {
  const lines = text.split(/\r?\n/);
  const result: SyllableG2P[] = [];

  for (const line of lines) {
    const rawWords = line.trim().split(/\s+/).filter(Boolean);
    const lineStartIdx = result.length;

    for (const rawWord of rawWords) {
      const { cleaned, punctuation } = extractPunctuationFromWord(rawWord);
      if (!cleaned) continue;

      const resolvedLang: 'es' | 'en' = lang === 'auto' ? detectWordLanguage(cleaned) : lang;
      const { ascii, explicitStressCharIdx } = normalizeSpanishWord(cleaned);
      const syllsAscii = syllabifyAscii(ascii, resolvedLang === 'en');
      if (syllsAscii.length === 0) continue;

      // Preserve readable display syllables with original casing
      const displaySylls = cleaned.includes('-')
        ? cleaned.split('-').map((s) => s.trim()).filter(Boolean)
        : syllsAscii.map((s, sIdx) => {
            const restored = s.replace(/ny/g, 'ñ');
            if (sIdx === 0 && cleaned[0] && cleaned[0] === cleaned[0].toUpperCase() && cleaned[0] !== cleaned[0].toLowerCase()) {
              return restored[0].toUpperCase() + restored.slice(1);
            }
            return restored;
          });

      let stressedIdx = 0;
      if (resolvedLang === 'es') {
        if (explicitStressCharIdx >= 0) {
          let offset = 0;
          for (let idx = 0; idx < syllsAscii.length; idx++) {
            const endOff = offset + syllsAscii[idx].length;
            if (explicitStressCharIdx >= offset && explicitStressCharIdx < endOff) {
              stressedIdx = idx;
              break;
            }
            offset = endOff;
          }
        } else if (syllsAscii.length >= 2) {
          const last = ascii[ascii.length - 1];
          const endsVowelNS = isAsciiVowel(last) || last === 'n' || last === 's';
          stressedIdx = endsVowelNS ? syllsAscii.length - 2 : syllsAscii.length - 1;
        }
      } else {
        stressedIdx = 0;
        if (
          syllsAscii.length >= 2 &&
          (syllsAscii[0] === 'un' || syllsAscii[0] === 're' || syllsAscii[0] === 'in' || syllsAscii[0] === 'pre')
        ) {
          stressedIdx = 1;
        }
      }

      for (let i = 0; i < syllsAscii.length; i++) {
        const isStart = i === 0;
        const isEnd = i === syllsAscii.length - 1;
        const isStressed = i === stressedIdx;
        const ipas =
          resolvedLang === 'es'
            ? spanishSyllableToIpaList(syllsAscii[i], isStart)
            : englishSyllableToIpaList(syllsAscii[i], isEnd);
        const safeIpas = ipas.length > 0 ? ipas : ['a'];
        const ipaCore = safeIpas.join(' ');
        const displayText = displaySylls[i] ?? syllsAscii[i];

        result.push({
          text: displayText,
          ipaDisplay: isStressed ? `ˈ${ipaCore}` : ipaCore,
          language: resolvedLang,
          isStressed,
          isWordEnd: isEnd,
          isLineEnd: false,
          punctuation: isEnd ? punctuation : 'none',
          phonemes: safeIpas.map(lookupIpa),
        });
      }
    }

    if (result.length > lineStartIdx) {
      result[result.length - 1].isLineEnd = true;
    }
  }

  return result;
}
