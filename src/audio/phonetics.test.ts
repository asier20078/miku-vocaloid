import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotesFromLyrics,
  createDemoSongNotes,
  evaluatePitchAtBeat,
  midiToHz,
  midiToNoteName,
  parseLyricsToSyllables,
  splitWordIntoSyllables,
  syllableToPhonemes,
} from './phonetics';

test('splitWordIntoSyllables handles Spanish/English words and manual hyphens', () => {
  assert.deepEqual(splitWordIntoSyllables('co-ra-zón'), ['co', 'ra', 'zón']);
  assert.deepEqual(splitWordIntoSyllables('cuando'), ['cuan', 'do']);
  assert.deepEqual(splitWordIntoSyllables('sol'), ['sol']);
});

test('parseLyricsToSyllables splits full multi-line song lyrics with line-end markers', () => {
  const tokens = parseLyricsToSyllables('Cuan-do sa-le el sol\nTell me');
  assert.equal(tokens.length, 8);
  assert.equal(tokens[5].syllable, 'sol');
  assert.equal(tokens[5].isLineEnd, true);
  assert.equal(tokens[7].syllable, 'me');
  assert.equal(tokens[7].isLineEnd, true);
});

test('syllableToPhonemes extracts onset, vowel formant key, and coda', () => {
  const sol = syllableToPhonemes('sol');
  assert.equal(sol.onsetType, 'fricative');
  assert.equal(sol.vowel, 'o');
  assert.equal(sol.codaType, 'plosive');
  assert.equal(sol.phonetic, 's o l');

  const mo = syllableToPhonemes('mo');
  assert.equal(mo.onsetType, 'nasal');
  assert.equal(mo.vowel, 'o');
  assert.equal(mo.phonetic, 'm o');

  const cuan = syllableToPhonemes('Cuan');
  assert.equal(cuan.vowel, 'a');
  assert.equal(cuan.phonetic, 'c u a n');
});

test('midiToHz and midiToNoteName convert pitches accurately', () => {
  assert.equal(Math.round(midiToHz(69)), 440);
  assert.equal(midiToNoteName(60), 'C4');
  assert.equal(midiToNoteName(48), 'C3');
});

test('evaluatePitchAtBeat computes portamento glide and vibrato', () => {
  const notes = createDemoSongNotes();
  const pitch = evaluatePitchAtBeat(notes, [], 5.5, 120);
  assert.ok(pitch !== null && pitch > 68 && pitch < 70);
});

test('buildNotesFromLyrics populates full song piano roll notes', () => {
  const notes = buildNotesFromLyrics('Brilla la luna\nCanta conmigo', 62, 0.75);
  assert.ok(notes.length >= 9);
  assert.equal(notes[0].lyric, 'Bri');
  assert.ok(notes[notes.length - 1].startBeat > 5);
});
