import { getDiphoneTransition } from './diphoneEngine';
import { PhonemeSpec } from './g2p';

export interface VocalTractTarget {
  f1: number;
  f2: number;
  f3: number;
  bw1: number;
  bw2: number;
  bw3: number;
  antiResonanceHz: number;
  nasalMix: number;
  noiseMix: number;
  noiseCenterHz: number;
  noiseQ: number;
  voiceMix: number;
  trillRateHz: number;
}

export interface PhonemeSlice {
  spec: PhonemeSpec;
  target: VocalTractTarget;
  startSec: number;
  endSec: number;
  closureEndSec: number;
  burstEndSec: number;
  inBlendSec: number;
  outBlendSec: number;
}

export interface ArticulationSample {
  target: VocalTractTarget;
  plosivePhaseGain: number;
  burstBoost: number;
}

export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function targetFromPhoneme(p: PhonemeSpec): VocalTractTarget {
  let voiceMix = 1.0;
  let noiseMix = 0.0;

  switch (p.manner) {
    case 'vowel':
    case 'liquid':
    case 'trill':
    case 'nasal':
      voiceMix = 1.0;
      noiseMix = 0.0;
      break;
    case 'fricative':
      voiceMix = p.voiced ? 0.55 : 0.0;
      noiseMix = p.voiced ? 0.65 : 1.0;
      break;
    case 'plosive':
    case 'affricate':
      voiceMix = p.voiced ? 0.45 : 0.0;
      noiseMix = 0.92;
      break;
    case 'silence':
      voiceMix = 0.0;
      noiseMix = 0.0;
      break;
  }

  return {
    f1: p.f1,
    f2: p.f2,
    f3: p.f3,
    bw1: p.bw1,
    bw2: p.bw2,
    bw3: p.bw3,
    antiResonanceHz: p.antiResonanceHz,
    nasalMix: p.manner === 'nasal' ? 1.0 : 0.0,
    noiseMix,
    noiseCenterHz: p.noiseCenterHz > 0 ? p.noiseCenterHz : 3500,
    noiseQ: p.noiseQ,
    voiceMix,
    trillRateHz: p.trillRateHz,
  };
}

export function interpolateTargets(
  a: VocalTractTarget,
  b: VocalTractTarget,
  linearProgress: number
): VocalTractTarget {
  const u = smoothstep(linearProgress);
  const lerp = (x: number, y: number) => x + u * (y - x);

  return {
    f1: lerp(a.f1, b.f1),
    f2: lerp(a.f2, b.f2),
    f3: lerp(a.f3, b.f3),
    bw1: lerp(a.bw1, b.bw1),
    bw2: lerp(a.bw2, b.bw2),
    bw3: lerp(a.bw3, b.bw3),
    antiResonanceHz:
      a.antiResonanceHz > 0 && b.antiResonanceHz > 0
        ? lerp(a.antiResonanceHz, b.antiResonanceHz)
        : b.antiResonanceHz > 0
          ? b.antiResonanceHz
          : a.antiResonanceHz,
    nasalMix: lerp(a.nasalMix, b.nasalMix),
    noiseMix: lerp(a.noiseMix, b.noiseMix),
    noiseCenterHz: lerp(a.noiseCenterHz, b.noiseCenterHz),
    noiseQ: lerp(a.noiseQ, b.noiseQ),
    voiceMix: lerp(a.voiceMix, b.voiceMix),
    trillRateHz: u < 0.5 ? a.trillRateHz : b.trillRateHz,
  };
}

// Schedules phoneme durations inside a sung syllable using diphone transition points
// so vowels sustain naturally while plosives stay crisp at 25-45 ms.
export function buildSyllableTimeline(
  phonemes: PhonemeSpec[],
  durationSec: number
): PhonemeSlice[] {
  if (phonemes.length === 0) return [];
  const safeDur = Math.max(0.05, durationSec);

  let vowelIdx = phonemes.findIndex((p) => p.manner === 'vowel');
  if (vowelIdx === -1) vowelIdx = Math.floor(phonemes.length / 2);

  // Allocate physical timing for consonants while leaving >= 50% for the vocalic nucleus
  const rawDurations = phonemes.map((p, idx) => {
    if (idx === vowelIdx) return 0; // Computed as remainder
    if (p.manner === 'plosive' || p.manner === 'affricate') {
      const phys = (p.closureMs + p.burstMs) * 0.001;
      return Math.max(0.025, Math.min(0.045, phys));
    }
    if (p.manner === 'trill') return Math.min(0.095, safeDur * 0.22);
    if (p.manner === 'fricative') return Math.min(0.07, safeDur * 0.18);
    if (p.manner === 'nasal' || p.manner === 'liquid') return Math.min(0.06, safeDur * 0.16);
    return 0.045;
  });

  const consonantSum = rawDurations.reduce((a, b) => a + b, 0);
  const maxConsonantBudget = safeDur * 0.5;
  const scale = consonantSum > maxConsonantBudget && consonantSum > 0 ? maxConsonantBudget / consonantSum : 1;

  const finalDurations = rawDurations.map((d, idx) =>
    idx === vowelIdx ? Math.max(0.03, safeDur - consonantSum * scale) : d * scale
  );

  const slices: PhonemeSlice[] = [];
  let cursor = 0;

  for (let i = 0; i < phonemes.length; i++) {
    const spec = phonemes[i];
    const dur = finalDurations[i];
    const startSec = cursor;
    const endSec = cursor + dur;

    let closureEndSec = startSec;
    let burstEndSec = startSec;
    if (spec.closureMs > 0) {
      const totalC = Math.max(0.001, (spec.closureMs + spec.burstMs) * 0.001);
      const closureFrac = (spec.closureMs * 0.001) / totalC;
      const actualClosure = Math.min(dur * 0.72, dur * closureFrac);
      const actualBurst = Math.min(dur - actualClosure, Math.max(0.01, spec.burstMs * 0.001 * scale));
      closureEndSec = startSec + actualClosure;
      burstEndSec = closureEndSec + actualBurst;
    }

    let inBlendSec = 0.015;
    let outBlendSec = 0.015;
    if (i > 0) {
      const prevDiphone = getDiphoneTransition(phonemes[i - 1], spec);
      inBlendSec = prevDiphone.transitionMs * 0.001 * prevDiphone.spliceBias;
    }
    if (i < phonemes.length - 1) {
      const nextDiphone = getDiphoneTransition(spec, phonemes[i + 1]);
      outBlendSec = nextDiphone.transitionMs * 0.001 * (1 - nextDiphone.spliceBias);
    }

    slices.push({
      spec,
      target: targetFromPhoneme(spec),
      startSec,
      endSec,
      closureEndSec,
      burstEndSec,
      inBlendSec: Math.min(dur * 0.45, inBlendSec),
      outBlendSec: Math.min(dur * 0.45, outBlendSec),
    });
    cursor = endSec;
  }

  return slices;
}

// Evaluates nonlinear S-curve diphone coarticulation + 25-45ms plosive closure/burst state.
export function evaluateArticulationAtTime(
  timeline: PhonemeSlice[],
  tSec: number,
  coarticulationMs: number
): ArticulationSample {
  if (timeline.length === 0) {
    return {
      target: {
        f1: 760, f2: 1180, f3: 2520,
        bw1: 80, bw2: 110, bw3: 160,
        antiResonanceHz: 0, nasalMix: 0,
        noiseMix: 0, noiseCenterHz: 3500, noiseQ: 2,
        voiceMix: 1, trillRateHz: 0,
      },
      plosivePhaseGain: 1.0,
      burstBoost: 0.0,
    };
  }

  let idx = timeline.findIndex((s) => tSec >= s.startSec && tSec <= s.endSec);
  if (idx === -1) idx = tSec < timeline[0].startSec ? 0 : timeline.length - 1;

  const curr = timeline[idx];
  const coartScale = Math.max(0.5, Math.min(1.6, coarticulationMs / 30));
  const inBlend = curr.inBlendSec * coartScale;
  const outBlend = curr.outBlendSec * coartScale;

  let target = curr.target;
  if (idx > 0 && inBlend > 0.002 && tSec - curr.startSec < inBlend) {
    const prev = timeline[idx - 1];
    const progress = 0.5 + (tSec - curr.startSec) / (2 * inBlend);
    target = interpolateTargets(prev.target, curr.target, progress);
  } else if (idx < timeline.length - 1 && outBlend > 0.002 && curr.endSec - tSec < outBlend) {
    const next = timeline[idx + 1];
    const progress = 0.5 - (curr.endSec - tSec) / (2 * outBlend);
    target = interpolateTargets(curr.target, next.target, progress);
  }

  // Plosive & affricate airflow occlusion + explosive burst (25-45ms)
  let plosivePhaseGain = 1.0;
  let burstBoost = 0.0;
  if (curr.spec.closureMs > 0) {
    if (tSec < curr.closureEndSec) {
      // Vocal tract seal: complete silence for voiceless, soft voice-bar for voiced
      plosivePhaseGain = curr.spec.voiced ? 0.14 : 0.0;
      target = { ...target, noiseMix: 0.0 };
    } else if (tSec < curr.burstEndSec) {
      const burstElapsed = tSec - curr.closureEndSec;
      plosivePhaseGain = 1.0;
      burstBoost = 1.45 * Math.exp(-burstElapsed / 0.007);
      target = { ...target, noiseMix: Math.max(target.noiseMix, 0.96) };
    }
  }

  return { target, plosivePhaseGain, burstBoost };
}
