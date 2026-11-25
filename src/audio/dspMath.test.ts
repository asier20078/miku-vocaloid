import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSoftClipCurve,
  clampDspParams,
  computeUnisonLayers,
  DEFAULT_DSP_PARAMS,
  encodeWavBuffer,
  extractWaveformPeaks,
  generateReverbImpulseData,
  linearToDb,
  synthesizeVocalFormantBuffer,
} from './dspMath';

test('computeUnisonLayers distributes pitch and stereo pan symmetrically', () => {
  const single = computeUnisonLayers(1.0, 0.2, 1, 0.02, 0.8);
  assert.equal(single.length, 1);
  assert.equal(single[0].playbackRate, 1.0);
  assert.equal(single[0].pan, 0.2);

  const triple = computeUnisonLayers(1.0, 0.0, 3, 0.02, 0.8);
  assert.equal(triple.length, 3);
  assert.ok(triple[0].playbackRate < 1.0);
  assert.equal(triple[1].playbackRate, 1.0);
  assert.ok(triple[2].playbackRate > 1.0);
  assert.ok(Math.abs(triple[0].pan + 0.8) < 1e-6);
  assert.ok(Math.abs(triple[2].pan - 0.8) < 1e-6);
});

test('clampDspParams enforces safe DSP ranges', () => {
  const clamped = clampDspParams({
    ...DEFAULT_DSP_PARAMS,
    highPassHz: -50,
    lowPassHz: 45000,
    delayFeedback: 0.99,
    unisonVoices: 12,
  });
  assert.equal(clamped.highPassHz, 20);
  assert.equal(clamped.lowPassHz, 20000);
  assert.equal(clamped.delayFeedback, 0.85);
  assert.equal(clamped.unisonVoices, 5);
});

test('buildSoftClipCurve stays bounded within [-1, 1] and is monotonic', () => {
  const curve = buildSoftClipCurve(3.0, 256);
  assert.equal(curve.length, 256);
  assert.ok(curve[0] >= -1.0 && curve[0] <= -0.9);
  assert.ok(curve[255] <= 1.0 && curve[255] >= 0.9);
  assert.ok(curve[200] > curve[100]);
});

test('generateReverbImpulseData creates decaying stereo buffers', () => {
  const ir = generateReverbImpulseData(48000, 0.7, 0.5);
  assert.equal(ir.left.length, ir.right.length);
  assert.ok(ir.left.length > 48000);
  const startEnergy = Math.abs(ir.left[10]);
  const endEnergy = Math.abs(ir.left[ir.left.length - 10]);
  assert.ok(startEnergy > endEnergy);
});

test('synthesizeVocalFormantBuffer and encodeWavBuffer produce valid RIFF WAV bytes', () => {
  const audio = synthesizeVocalFormantBuffer(48000, 0.25, 196, [730, 1090, 2440]);
  assert.equal(audio.length, 12000);

  const peaks = extractWaveformPeaks(audio, 24);
  assert.equal(peaks.length, 24);
  assert.ok(Math.max(...peaks) > 0.1);

  const wavBuffer = encodeWavBuffer([audio, audio], 48000);
  assert.equal(wavBuffer.byteLength, 44 + 12000 * 2 * 2);
  const header = new TextDecoder().decode(new Uint8Array(wavBuffer, 0, 4));
  assert.equal(header, 'RIFF');
});

test('linearToDb formats silence and unit gain accurately', () => {
  assert.equal(linearToDb(0), '-∞ dB');
  assert.equal(linearToDb(1), '0.0 dB');
});
