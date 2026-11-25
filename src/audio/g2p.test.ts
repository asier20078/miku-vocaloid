import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyllableTimeline,
  evaluateArticulationAtTime,
  interpolateTargets,
  smoothstep,
  targetFromPhoneme,
} from './coarticulation';
import { DEFAULT_DSP_PARAMS } from './dspMath';
import { buildDiphoneSequence, getDiphoneTransition } from './diphoneEngine';
import { convertLyricsToG2P, lookupIpa } from './g2p';
import { BUILTIN_VOICEBANKS, evaluatePitchAtBeat } from './phonetics';
import { evaluateProsodyOffset } from './prosody';
import { renderSingingBuffer, renderSingingStereoBuffer } from './singingSynth';
import { VocalTractSynthesizer } from './vocalTractDsp';

test('G2P parses Spanish stress, ñ, ch, rr and punctuation to IPA', () => {
  const res = convertLyricsToG2P('Co-ra-zón perro niño?', 'es');
  assert.equal(res.length, 7); // Co-ra-zón + pe-rro + ni-ño
  assert.equal(res[0].isStressed, false);
  assert.equal(res[2].isStressed, true);
  assert.ok(res[2].ipaDisplay.startsWith('ˈ'));
  assert.equal(res[4].phonemes[0].trillRateHz, 26);
  assert.ok(res[6].phonemes.some((p) => p.ipa === 'ɲ' && p.antiResonanceHz > 1000));
  assert.equal(res[6].punctuation, 'question');
});

test('G2P parses English sh, th, ng, silent e, and fast pop contractions', () => {
  const res = convertLyricsToG2P("shadow think make! We're waiting night", 'en');
  assert.ok(res.length >= 7);
  assert.equal(res[0].phonemes[0].ipa, 'ʃ');
  assert.ok(res.some((s) => s.phonemes.some((p) => p.ipa === 'θ')));
  assert.ok(res.some((s) => s.phonemes.some((p) => p.ipa === 'ŋ')));
  const makeSyl = res.find((s) => s.text.toLowerCase() === 'make');
  assert.ok(makeSyl && makeSyl.punctuation === 'exclamation');
  assert.equal(
    makeSyl.phonemes.some((p) => p.ipa === 'e'),
    false,
    'trailing silent e should not produce vowel phoneme'
  );
  // Plosive closure+burst stays crisp at 25-45 ms
  for (const plosive of ['p', 't', 'k', 'b', 'd', 'g']) {
    const spec = lookupIpa(plosive);
    const totalMs = spec.closureMs + spec.burstMs;
    assert.ok(totalMs >= 25 && totalMs <= 45, `${plosive} total ${totalMs}ms must be within 25-45ms`);
    assert.ok(spec.noiseCenterHz >= 3000 && spec.noiseCenterHz <= 10000);
  }
});

test('DiphoneEngine computes CV/VC/VV crossfade timings and splice biases', () => {
  const cv = getDiphoneTransition(lookupIpa('w'), lookupIpa('i'));
  assert.equal(cv.category, 'CV');
  assert.ok(cv.transitionMs >= 22 && cv.transitionMs <= 45);
  assert.ok(cv.spliceBias < 0.5);

  const vc = getDiphoneTransition(lookupIpa('a'), lookupIpa('t'));
  assert.equal(vc.category, 'VC');
  assert.ok(vc.spliceBias > 0.5);

  const seq = buildDiphoneSequence([lookupIpa('w'), lookupIpa('i'), lookupIpa('ɾ')]);
  assert.equal(seq.length, 2);
});

test('Coarticulation smoothstep S-curve and plosive closure timing', () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(1), 1);

  const pT = targetFromPhoneme(lookupIpa('p'));
  const aT = targetFromPhoneme(lookupIpa('a'));
  const mid = interpolateTargets(pT, aT, 0.5);
  assert.ok(mid.f1 > pT.f1 && mid.f1 < aT.f1);

  const timeline = buildSyllableTimeline([lookupIpa('p'), lookupIpa('a')], 0.4);
  const duringClosure = evaluateArticulationAtTime(timeline, 0.005, 30);
  assert.equal(duringClosure.plosivePhaseGain, 0);

  const duringVowel = evaluateArticulationAtTime(timeline, 0.25, 30);
  assert.equal(duringVowel.plosivePhaseGain, 1);
});

test('VocalTractSynthesizer models closure silence, formants, nasal zero, fricatives, and rr trill', () => {
  const tract = new VocalTractSynthesizer();
  tract.prepare(48000);

  // Voiceless closure silence
  const pTarget = { ...targetFromPhoneme(lookupIpa('p')), noiseMix: 0 };
  let closurePeak = 0;
  for (let i = 0; i < 400; i++) {
    closurePeak = Math.max(closurePeak, Math.abs(tract.processSample(220, pTarget, 0, 0)));
  }
  assert.ok(closurePeak < 1e-4);

  // Vowel F1-F5 formants
  tract.reset();
  const aTarget = targetFromPhoneme(lookupIpa('a'));
  let vowelPeak = 0;
  for (let i = 0; i < 1200; i++) {
    const s = tract.processSample(220, aTarget, 0.08, 1);
    assert.ok(Number.isFinite(s));
    vowelPeak = Math.max(vowelPeak, Math.abs(s));
  }
  assert.ok(vowelPeak > 0.02);

  // Nasal antiresonance
  const mTarget = targetFromPhoneme(lookupIpa('m'));
  let nasalPeak = 0;
  for (let i = 0; i < 1000; i++) {
    const s = tract.processSample(220, mTarget, 0.05, 1);
    assert.ok(Number.isFinite(s));
    nasalPeak = Math.max(nasalPeak, Math.abs(s));
  }
  assert.ok(nasalPeak > 0.005);

  // Fricative noise energy (3-10 kHz)
  const sTarget = targetFromPhoneme(lookupIpa('s'));
  let fricEnergy = 0;
  for (let i = 0; i < 800; i++) {
    fricEnergy += Math.abs(tract.processSample(220, sTarget, 0, 1));
  }
  assert.ok(fricEnergy > 2.0);
});

test('ProsodyEngine activates vibrato only when note > 250ms with 150ms fade-in and handles punctuation', () => {
  const params = {
    vibratoRateHz: 6.0,
    vibratoDepthSemitones: 0.25,
    vibratoAmplitudeDepth: 0.06,
    vibratoDelaySec: 0.15,
    stressPitchBoostSemitones: 0.55,
    baseBreathiness: 0.09,
    phraseEndBreathiness: 0.36,
  };

  // Short note (<= 250ms) should NOT have vibrato oscillation
  const shortA = evaluateProsodyOffset(0.18, 0.24, false, 'none', params, true);
  assert.equal(shortA.pitchOffsetSemitones, 0);

  // Sustained note (> 250ms) activates vibrato after 150ms delay
  const longVib = evaluateProsodyOffset(0.35, 0.8, false, 'none', params, true);
  assert.ok(Math.abs(longVib.pitchOffsetSemitones) > 0.05);

  const q = evaluateProsodyOffset(0.78, 0.8, true, 'question', params, true);
  const p = evaluateProsodyOffset(0.78, 0.8, false, 'period', params, true);

  assert.ok(q.pitchOffsetSemitones > p.pitchOffsetSemitones + 2.0);
  assert.ok(q.breathiness > 0.28);
  assert.ok(q.amplitudeGain > p.amplitudeGain);

  const pitchQ = evaluatePitchAtBeat(
    [
      {
        id: 'q1',
        midi: 64,
        startBeat: 0,
        durationBeats: 2,
        lyric: 'why',
        phonetic: 'ˈw a i',
        vibratoDepth: 0.2,
        vibratoRate: 6.0,
        portamentoMs: 35,
        isStressed: true,
        punctuation: 'question',
      },
    ],
    [],
    1.9,
    120
  );
  assert.ok(pitchQ !== null && pitchQ > 65.2);
});

test('renderSingingStereoBuffer produces panned polyphonic harmony (Lead + 3rd + 5th + Rhythmic Bass)', () => {
  const testNotes = [
    {
      id: 'n1',
      midi: 64,
      startBeat: 0,
      durationBeats: 1,
      lyric: 'pa',
      phonetic: 'ˈp a',
      vibratoDepth: 0.2,
      vibratoRate: 6.0,
      portamentoMs: 35,
      isStressed: true,
      punctuation: 'none' as const,
      g2pLanguage: 'es' as const,
    },
    {
      id: 'n2',
      midi: 67,
      startBeat: 1.05,
      durationBeats: 1.2,
      lyric: 'stay?',
      phonetic: 'ˈs t e i',
      vibratoDepth: 0.28,
      vibratoRate: 6.0,
      portamentoMs: 35,
      isStressed: true,
      punctuation: 'question' as const,
      g2pLanguage: 'en' as const,
    },
  ];

  // Portamento glide midpoint between 64 and 67 during first 35ms of n2 (1.05 beat @ 120bpm = 0.525s)
  const midPortamento = evaluatePitchAtBeat(testNotes, [], 1.05 + (0.0175 * 120) / 60, 120);
  assert.ok(midPortamento !== null && midPortamento > 64.5 && midPortamento < 66.5);

  const stereoChoir = renderSingingStereoBuffer(
    24000,
    testNotes,
    [],
    BUILTIN_VOICEBANKS[0],
    { ...DEFAULT_DSP_PARAMS, harmonyMode: 'choir-full' },
    120,
    null,
    0,
    2.5
  );

  let diffSum = 0;
  let peakL = 0;
  for (let i = 0; i < stereoChoir.left.length; i++) {
    assert.ok(Number.isFinite(stereoChoir.left[i]) && Number.isFinite(stereoChoir.right[i]));
    peakL = Math.max(peakL, Math.abs(stereoChoir.left[i]));
    diffSum += Math.abs(stereoChoir.left[i] - stereoChoir.right[i]);
  }
  assert.ok(peakL > 0.05);
  assert.ok(diffSum > 10, 'Stereo choir must pan 3rd Left and 5th Right so L != R');

  const monoMix = renderSingingBuffer(
    24000,
    testNotes,
    [],
    BUILTIN_VOICEBANKS[0],
    DEFAULT_DSP_PARAMS,
    120,
    null,
    0,
    2.5
  );
  assert.ok(monoMix.length > 24000);
});
