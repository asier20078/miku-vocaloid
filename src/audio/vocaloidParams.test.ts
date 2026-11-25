import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DSP_PARAMS } from './dspMath';
import { BUILTIN_VOICEBANKS, evaluatePitchAtBeat, VocalNote } from './phonetics';
import { renderSingingStereoBuffer } from './singingSynth';
import {
  applyStyleSettingsToDsp,
  breToAmount,
  briToFactor,
  cleToFactor,
  DEFAULT_STYLE_SETTINGS,
  DEFAULT_VOCAL_TRACKS,
  dynToGain,
  evaluateParamLaneAtBeat,
  formantShiftToGen,
  genToFormantShift,
  gwlToAmount,
  opeToFactor,
  pitToSemitones,
  velToConsonantScale,
} from './vocaloidParams';

test('Crypton GEN parameter maps 48 to +12% formant shift and roundtrips cleanly', () => {
  const shift48 = genToFormantShift(48);
  assert.ok(Math.abs(shift48 - 1.12) < 0.001);
  assert.equal(genToFormantShift(64), 1.0);
  assert.ok(genToFormantShift(86) < 0.92);
  assert.equal(formantShiftToGen(1.12), 48);
  assert.equal(formantShiftToGen(1.0), 64);
});

test('Crypton CC parameter scalers remain bounded and monotonic', () => {
  assert.ok(velToConsonantScale(127) < velToConsonantScale(64));
  assert.ok(velToConsonantScale(64) < velToConsonantScale(0));
  assert.ok(dynToGain(127) > dynToGain(84));
  assert.ok(breToAmount(127) > breToAmount(24));
  assert.ok(briToFactor(127) > briToFactor(40));
  assert.ok(cleToFactor(127) > cleToFactor(40));
  assert.ok(opeToFactor(127) > opeToFactor(20));
  assert.equal(gwlToAmount(0), 0);
  assert.equal(gwlToAmount(127), 1);
  assert.ok(Math.abs(pitToSemitones(32, 4) - 2) < 0.01);
  assert.ok(Math.abs(pitToSemitones(-64, 12) + 12) < 0.01);
});

test('evaluateParamLaneAtBeat interpolates automation curves and falls back outside edited spans', () => {
  const pts = [
    { beat: 1, value: 40 },
    { beat: 2, value: 120 },
  ];
  assert.equal(evaluateParamLaneAtBeat(pts, 0.2, 84), 84);
  assert.equal(evaluateParamLaneAtBeat(pts, 1.5, 84), 80);
  assert.equal(evaluateParamLaneAtBeat(pts, 3.5, 84), 84);
});

test('evaluatePitchAtBeat integrates PIT lane scaled by PBS and respects portamentoEnabled=false', () => {
  const notes: VocalNote[] = [
    {
      id: 'a',
      midi: 60,
      startBeat: 0,
      durationBeats: 1,
      lyric: 'mi',
      phonetic: 'm i',
      vibratoDepth: 0,
      vibratoRate: 6.0,
      portamentoMs: 35,
      portamentoEnabled: false,
    },
    {
      id: 'b',
      midi: 67,
      startBeat: 1.02,
      durationBeats: 1,
      lyric: 'ku',
      phonetic: 'k u',
      vibratoDepth: 0,
      vibratoRate: 6.0,
      portamentoMs: 35,
      portamentoEnabled: false,
    },
  ];

  // With portamentoEnabled=false, onset of note b is immediately at 67 (no glide from 60)
  const noPortPitch = evaluatePitchAtBeat(notes, [], 1.03, 120);
  assert.ok(noPortPitch !== null && noPortPitch > 66.8);

  // With PIT = +32 and PBS = 12 semitones, pitch rises by +6 semitones
  const bentPitch = evaluatePitchAtBeat(notes, [], 1.5, 120, [{ beat: 1.5, value: 32 }], 12);
  assert.ok(bentPitch !== null && Math.abs(bentPitch - 73) < 0.15);
});

test('renderSingingStereoBuffer synthesizes Crypton DYN, BRI, CLE, OPE, GEN, GWL and per-note vibratoType', () => {
  const notes: VocalNote[] = [
    {
      id: 'v1',
      midi: 69,
      startBeat: 0,
      durationBeats: 1.2,
      lyric: 'stay',
      phonetic: 's t e i',
      vibratoDepth: 0.28,
      vibratoRate: 6.0,
      portamentoMs: 35,
      velocity: 96,
      opening: 115,
      accent: 80,
      decay: 40,
      vibratoType: 'fast',
      isStressed: true,
    },
  ];

  const { left, right } = renderSingingStereoBuffer(
    24000,
    notes,
    [],
    BUILTIN_VOICEBANKS[0],
    { ...DEFAULT_DSP_PARAMS, harmonyMode: 'solo', gwl: 48, cle: 90, ope: 112 },
    120,
    null,
    0,
    1.3,
    {
      DYN: [
        { beat: 0, value: 45 },
        { beat: 1, value: 120 },
      ],
      GWL: [
        { beat: 0, value: 20 },
        { beat: 1, value: 90 },
      ],
    }
  );

  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
    peak = Math.max(peak, Math.abs(left[i]));
  }
  assert.ok(peak > 0.05);
});

test('applyStyleSettingsToDsp and robotVoice=hard lock flat MIDI pitch and remove vibrato', () => {
  const mapped = applyStyleSettingsToDsp(DEFAULT_DSP_PARAMS, {
    ...DEFAULT_STYLE_SETTINGS,
    robotVoice: 'hard',
    breathMode: 'off',
    expression: 90,
    air: 0,
    character: 20,
    attack: 85,
  });

  assert.equal(mapped.vibratoDepth, 0);
  assert.equal(mapped.portamentoMs, 0);
  assert.equal(mapped.phraseEndBreathiness, 0);
  assert.ok(mapped.genderFormantShift > DEFAULT_DSP_PARAMS.genderFormantShift);

  const notes: VocalNote[] = [
    {
      id: 'n1',
      midi: 64,
      startBeat: 0,
      durationBeats: 2,
      lyric: 'mi',
      phonetic: 'm i',
      vibratoDepth: 0.4,
      vibratoRate: 6.0,
      portamentoMs: 40,
      isStressed: true,
      punctuation: 'exclamation',
    },
  ];
  const hardPitch = evaluatePitchAtBeat(notes, [], 1.5, 120, undefined, 4, 'hard');
  assert.equal(hardPitch, 64);
});

test('renderSingingStereoBuffer honors channelTracks Mute, Solo, Volume dB and Stereo Pan', () => {
  const notes: VocalNote[] = [
    {
      id: 'n1',
      midi: 69,
      startBeat: 0,
      durationBeats: 0.8,
      lyric: 'la',
      phonetic: 'l a',
      vibratoDepth: 0.2,
      vibratoRate: 6.0,
      portamentoMs: 35,
    },
  ];

  // Solo hard-panned right harmony track
  const { left, right } = renderSingingStereoBuffer(
    24000,
    notes,
    [],
    BUILTIN_VOICEBANKS[0],
    DEFAULT_DSP_PARAMS,
    120,
    null,
    0,
    0.9,
    undefined,
    { ...DEFAULT_STYLE_SETTINGS, breathMode: 'always' },
    [
      { ...DEFAULT_VOCAL_TRACKS[0], muted: false, solo: false },
      {
        id: 't-right',
        name: 'Coro 3ª',
        voiceLabel: 'Miku Pop',
        role: 'third',
        muted: false,
        solo: true,
        effectEnabled: true,
        armed: false,
        volumeDb: 0,
        pan: 1.0,
        color: '#0D9488',
      },
    ]
  );

  let energyL = 0;
  let energyR = 0;
  for (let i = 0; i < left.length; i++) {
    energyL += left[i] * left[i];
    energyR += right[i] * right[i];
  }
  assert.ok(energyR > 0.01);
  assert.ok(energyL < 1e-6);
});
