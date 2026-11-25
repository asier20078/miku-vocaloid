import {
  buildSyllableTimeline,
  evaluateArticulationAtTime,
} from './coarticulation';
import {
  buildSoftClipCurve,
  DspParams,
  encodeWavBuffer,
  generateReverbImpulseData,
} from './dspMath';
import { syllableToG2P } from './g2p';
import {
  evaluatePitchAtBeat,
  midiToHz,
  PitchControlPoint,
  VocalNote,
  VoicebankProfile,
} from './phonetics';
import { evaluateProsodyOffset } from './prosody';
import {
  applyStyleSettingsToDsp,
  breToAmount,
  briToFactor,
  cleToFactor,
  dbToLinearGain,
  dynToGain,
  evaluateParamLaneAtBeat,
  genToFormantShift,
  gwlToAmount,
  opeToFactor,
  ParamAutomationMap,
  velToConsonantScale,
  VIBRATO_PRESETS,
  VocaloidStyleSettings,
  VocalTrackChannel,
} from './vocaloidParams';
import { VocalTractSynthesizer } from './vocalTractDsp';
import { VoiceSlot, WebAudioDspEngine } from './webAudioEngine';

export interface SongPlaybackCallbacks {
  onBeatUpdate?: (beat: number) => void;
  onEnded?: () => void;
}

export interface HarmonyTrackSpec {
  id: string;
  semitones: number;
  pan: number; // -1 (Left) .. +1 (Right)
  formantScale: number;
  gain: number;
  rhythmicBass?: boolean;
}

export function getHarmonyTracks(mode: DspParams['harmonyMode']): HarmonyTrackSpec[] {
  switch (mode) {
    case 'chords-3-5':
      return [
        { id: 'lead', semitones: 0, pan: 0.0, formantScale: 1.0, gain: 0.8 },
        { id: 'third', semitones: 4, pan: -0.45, formantScale: 1.04, gain: 0.44 },
        { id: 'fifth', semitones: 7, pan: 0.45, formantScale: 0.97, gain: 0.42 },
      ];
    case 'choir-full':
      return [
        { id: 'lead', semitones: 0, pan: 0.0, formantScale: 1.0, gain: 0.78 },
        { id: 'third', semitones: 4, pan: -0.5, formantScale: 1.04, gain: 0.42 },
        { id: 'fifth', semitones: 7, pan: 0.5, formantScale: 0.97, gain: 0.4 },
        { id: 'bass', semitones: -12, pan: 0.0, formantScale: 0.84, gain: 0.42, rhythmicBass: true },
      ];
    case 'octave-bass':
      return [
        { id: 'lead', semitones: 0, pan: 0.0, formantScale: 1.0, gain: 0.82 },
        { id: 'bass', semitones: -12, pan: 0.0, formantScale: 0.84, gain: 0.48, rhythmicBass: true },
      ];
    case 'solo':
    default:
      return [{ id: 'lead', semitones: 0, pan: 0.0, formantScale: 1.0, gain: 0.88 }];
  }
}

// Fast per-syllable ADSR for percussive, articulated Vocaloid pop dynamics
export function computeSyllableAdsrGain(
  sampleIdx: number,
  totalSamples: number,
  sr: number,
  attackMs: number,
  decayMs: number,
  sustainLevel: number,
  releaseMs: number
): number {
  const atk = Math.max(1, Math.min(totalSamples * 0.25, Math.floor((Math.min(attackMs, 24) * 0.001) * sr)));
  const dec = Math.max(1, Math.min(totalSamples * 0.35, Math.floor((Math.min(decayMs, 95) * 0.001) * sr)));
  const rel = Math.max(1, Math.min(totalSamples * 0.3, Math.floor((Math.min(releaseMs, 55) * 0.001) * sr)));
  const sus = Math.max(0.45, Math.min(1.0, sustainLevel));

  let gain = sus;
  if (sampleIdx < atk) {
    gain = sampleIdx / atk;
  } else if (sampleIdx < atk + dec) {
    const t = (sampleIdx - atk) / dec;
    gain = 1.0 - (1.0 - sus) * t;
  }

  if (sampleIdx > totalSamples - rel) {
    const relEnv = Math.max(0, (totalSamples - sampleIdx) / rel);
    gain *= relEnv;
  }

  return gain;
}

export function renderSingingStereoBuffer(
  sampleRate: number,
  notes: VocalNote[],
  pitchPoints: PitchControlPoint[],
  voicebank: VoicebankProfile,
  dspParams: DspParams,
  bpm: number,
  customSamples: Float32Array | null,
  fromBeat: number,
  endBeat: number,
  paramAutomation?: ParamAutomationMap,
  styleSettings?: VocaloidStyleSettings,
  channelTracks?: VocalTrackChannel[]
): { left: Float32Array; right: Float32Array } {
  const sr = Math.max(8000, sampleRate);
  const secPerBeat = 60 / Math.max(30, bpm);
  const totalSec = Math.max(0.05, (endBeat - fromBeat) * secPerBeat + 0.08);
  const totalSamples = Math.ceil(totalSec * sr);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  if (notes.length === 0) return { left, right };

  const effectiveDsp = styleSettings ? applyStyleSettingsToDsp(dspParams, styleSettings) : dspParams;
  const robotVoice = styleSettings?.robotVoice ?? 'off';
  const breathMode = styleSettings?.breathMode ?? 'sometimes';
  const takeIndex = styleSettings?.take ?? 1;

  // Build render tracks either from explicit Arrangement Channel Tracks or harmonyMode
  let tracks: HarmonyTrackSpec[];
  if (channelTracks && channelTracks.length > 0) {
    const anySolo = channelTracks.some((t) => t.solo);
    const activeChannels = channelTracks.filter((t) => (anySolo ? t.solo : !t.muted));
    if (activeChannels.length === 0) return { left, right };

    if (activeChannels.length === 1 && activeChannels[0].role === 'lead' && effectiveDsp.harmonyMode !== 'solo') {
      const mainCh = activeChannels[0];
      const chGain = dbToLinearGain(mainCh.volumeDb);
      tracks = getHarmonyTracks(effectiveDsp.harmonyMode).map((ht) => ({
        ...ht,
        gain: ht.gain * chGain,
        pan: ht.id === 'lead' ? Math.max(-1, Math.min(1, mainCh.pan)) : ht.pan,
      }));
    } else {
      tracks = activeChannels.map((ch) => ({
        id: ch.id,
        semitones:
          ch.role === 'third' ? 4 : ch.role === 'fifth' ? 7 : ch.role === 'bass' ? -12 : 0,
        pan: Math.max(-1, Math.min(1, ch.pan)),
        formantScale:
          ch.role === 'third' ? 1.04 : ch.role === 'fifth' ? 0.97 : ch.role === 'bass' ? 0.84 : 1.0,
        gain:
          (ch.role === 'lead' ? 0.85 : 0.46) * dbToLinearGain(ch.volumeDb),
        rhythmicBass: ch.role === 'bass',
      }));
    }
  } else {
    tracks = getHarmonyTracks(effectiveDsp.harmonyMode);
  }

  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const baseGen = effectiveDsp.gen ?? 48;
  const baseBre = Math.round(((effectiveDsp.breathiness ?? 0.09) / 0.5) * 127);
  const baseBri = effectiveDsp.bri ?? 86;
  const baseCle = effectiveDsp.cle ?? 68;
  const baseOpe = effectiveDsp.ope ?? 100;
  const baseDyn = effectiveDsp.dyn ?? 84;
  const baseGwl = effectiveDsp.gwl ?? 0;
  const pbsSemitones = effectiveDsp.pbs ?? 4;

  const prosodyParams = {
    vibratoRateHz: (effectiveDsp.vibratoRate ?? voicebank.vibratoRate) + (takeIndex - 1) * 0.14,
    vibratoDepthSemitones: effectiveDsp.vibratoDepth ?? voicebank.vibratoDepth,
    vibratoAmplitudeDepth: 0.06,
    vibratoDelaySec: 0.15,
    stressPitchBoostSemitones: robotVoice === 'hard' ? 0 : 0.55,
    baseBreathiness: Math.max(voicebank.breathiness, effectiveDsp.breathiness ?? 0.09),
    phraseEndBreathiness: effectiveDsp.phraseEndBreathiness ?? 0.36,
  };

  for (const track of tracks) {
    const tract = new VocalTractSynthesizer();
    tract.prepare(sr);

    // Equal-power stereo panning
    const panAngle = ((Math.max(-1, Math.min(1, track.pan)) + 1) * Math.PI) / 4;
    const panGainL = Math.cos(panAngle);
    const panGainR = Math.sin(panAngle);

    for (const note of sorted) {
      const noteEndBeat = note.startBeat + note.durationBeats;
      if (noteEndBeat <= fromBeat || note.startBeat >= endBeat) continue;

      const clippedStartBeat = Math.max(note.startBeat, fromBeat);
      const clippedEndBeat = Math.min(noteEndBeat, endBeat);
      const durSec = (clippedEndBeat - clippedStartBeat) * secPerBeat;
      if (durSec <= 0.02) continue;

      const startSample = Math.max(0, Math.floor((clippedStartBeat - fromBeat) * secPerBeat * sr));
      const noteSamples = Math.min(totalSamples - startSample, Math.floor(durSec * sr));
      if (noteSamples <= 16) continue;

      const g2p = syllableToG2P(
        track.rhythmicBass ? 'dum' : note.lyric,
        note.g2pLanguage ?? 'auto',
        track.rhythmicBass ? 'none' : (note.punctuation ?? 'none'),
        Boolean(note.isStressed)
      );
      const timeline = buildSyllableTimeline(g2p.phonemes, durSec);

      tract.reset();

      const noteVel = note.velocity ?? effectiveDsp.vel ?? 64;
      const velCoartScale = velToConsonantScale(noteVel);
      const effectiveCoartMs = Math.max(12, Math.min(55, effectiveDsp.coarticulationMs * velCoartScale));
      const velConsonantBoost = 0.72 + (noteVel / 127) * 0.56;

      const noteOpeScale = note.opening !== undefined ? opeToFactor(note.opening) / opeToFactor(100) : 1.0;
      const accentBoost = ((note.accent ?? 50) - 50) / 50; // -1..+1
      const decayFactor = (note.decay ?? 50) / 50; // 0..2

      const vibSpec = note.vibratoType ? VIBRATO_PRESETS[note.vibratoType] : null;
      const noteProsodyParams = vibSpec
        ? {
            ...prosodyParams,
            vibratoRateHz: vibSpec.rateHz + (takeIndex - 1) * 0.14,
            vibratoDepthSemitones:
              robotVoice === 'hard' || note.vibratoType === 'none'
                ? 0
                : Math.max(vibSpec.depthSemitones, (effectiveDsp.vibratoDepth ?? 0.24) * 0.5) *
                  (robotVoice === 'soft' ? 0.35 : 1),
          }
        : prosodyParams;

      const effectiveNote: VocalNote = {
        ...note,
        midi: note.midi + track.semitones,
        vibratoDepth: track.rhythmicBass ? 0 : noteProsodyParams.vibratoDepthSemitones,
        vibratoRate: noteProsodyParams.vibratoRateHz,
        portamentoMs: effectiveDsp.portamentoMs ?? note.portamentoMs ?? 35,
      };
      const effectiveNotes = sorted.map((n) =>
        n.id === note.id
          ? effectiveNote
          : { ...n, midi: n.midi + track.semitones, portamentoMs: effectiveDsp.portamentoMs ?? n.portamentoMs ?? 35 }
      );

      for (let i = 0; i < noteSamples; i++) {
        const elapsedSec = i / sr;
        const beat = clippedStartBeat + elapsedSec / secPerBeat;

        const midiVal =
          evaluatePitchAtBeat(
            effectiveNotes,
            track.rhythmicBass ? [] : pitchPoints,
            beat,
            bpm,
            track.rhythmicBass ? undefined : paramAutomation?.PIT,
            pbsSemitones,
            track.rhythmicBass ? 'off' : robotVoice
          ) ?? note.midi + track.semitones;
        const f0Hz = midiToHz(midiVal);

        const dynVal = evaluateParamLaneAtBeat(paramAutomation?.DYN, beat, baseDyn);
        const breVal = evaluateParamLaneAtBeat(paramAutomation?.BRE, beat, baseBre);
        const briVal = evaluateParamLaneAtBeat(paramAutomation?.BRI, beat, baseBri);
        const cleVal = evaluateParamLaneAtBeat(paramAutomation?.CLE, beat, baseCle);
        const opeVal = evaluateParamLaneAtBeat(paramAutomation?.OPE, beat, baseOpe);
        const genVal = evaluateParamLaneAtBeat(paramAutomation?.GEN, beat, baseGen);
        const gwlVal = evaluateParamLaneAtBeat(paramAutomation?.GWL, beat, baseGwl);

        const effectivePunct =
          track.rhythmicBass || breathMode === 'off'
            ? 'none'
            : breathMode === 'always' && (note.punctuation ?? 'none') === 'none'
              ? 'comma'
              : (note.punctuation ?? 'none');

        const prosody = evaluateProsodyOffset(
          elapsedSec,
          durSec,
          robotVoice === 'hard' ? false : Boolean(note.isStressed),
          effectivePunct,
          {
            ...noteProsodyParams,
            baseBreathiness: Math.max(voicebank.breathiness, breToAmount(breVal)),
          },
          !track.rhythmicBass && noteProsodyParams.vibratoDepthSemitones > 0.001
        );

        const articulation = evaluateArticulationAtTime(
          timeline,
          elapsedSec,
          effectiveCoartMs
        );

        const genRatio = genToFormantShift(genVal) / genToFormantShift(voicebank.defaultGen ?? 48);
        const effectiveFormantShift = voicebank.baseFormantShift * genRatio;

        const sample = tract.processSample(
          f0Hz,
          articulation.target,
          track.rhythmicBass ? 0.02 : prosody.breathiness,
          articulation.plosivePhaseGain,
          {
            formantShift: effectiveFormantShift * track.formantScale,
            brightness: track.rhythmicBass ? 0.82 : voicebank.brightness * (briToFactor(briVal) / 1.15),
            clearness: track.rhythmicBass ? 0.8 : cleToFactor(cleVal),
            opening: track.rhythmicBass ? 0.92 : opeToFactor(opeVal) * noteOpeScale,
            growl: track.rhythmicBass ? 0 : gwlToAmount(gwlVal),
            consonantClarity: (track.rhythmicBass ? 0.65 : effectiveDsp.consonantClarity) * velConsonantBoost,
            burstBoost: articulation.burstBoost,
            customSamples,
          }
        );

        const adsrEnv = computeSyllableAdsrGain(
          i,
          noteSamples,
          sr,
          dspParams.attackMs,
          dspParams.decayMs * (0.55 + decayFactor * 0.45),
          dspParams.sustainLevel,
          dspParams.releaseMs * (0.6 + decayFactor * 0.4)
        );

        // Crypton Accent (%) initial punch during first 45 ms
        const accentEnv = elapsedSec < 0.045 ? 1.0 + accentBoost * 0.22 * (1 - elapsedSec / 0.045) : 1.0;

        // Rhythmic sub-bass vocal pulse ("da-da-da-dum" eighth-note staccato gate)
        let bassPulse = 1.0;
        if (track.rhythmicBass) {
          const eighthPhase = (beat * 2) % 1;
          bassPulse = eighthPhase < 0.62 ? 1.0 - eighthPhase * 0.55 : 0.12;
        }

        const outIdx = startSample + i;
        const dynGain = track.rhythmicBass ? 1.0 : dynToGain(dynVal);
        const monoVoice = sample * adsrEnv * accentEnv * prosody.amplitudeGain * dynGain * track.gain * bassPulse;
        left[outIdx] = Math.max(-0.98, Math.min(0.98, left[outIdx] + monoVoice * panGainL));
        right[outIdx] = Math.max(-0.98, Math.min(0.98, right[outIdx] + monoVoice * panGainR));
      }
    }
  }

  return { left, right };
}

export function renderSingingBuffer(
  sampleRate: number,
  notes: VocalNote[],
  pitchPoints: PitchControlPoint[],
  voicebank: VoicebankProfile,
  dspParams: DspParams,
  bpm: number,
  customSamples: Float32Array | null,
  fromBeat: number,
  endBeat: number,
  paramAutomation?: ParamAutomationMap,
  styleSettings?: VocaloidStyleSettings,
  channelTracks?: VocalTrackChannel[]
): Float32Array {
  const { left, right } = renderSingingStereoBuffer(
    sampleRate,
    notes,
    pitchPoints,
    voicebank,
    dspParams,
    bpm,
    customSamples,
    fromBeat,
    endBeat,
    paramAutomation,
    styleSettings,
    channelTracks
  );
  const out = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    out[i] = (left[i] + right[i]) * 0.5;
  }
  return out;
}

export class SingingSequencer {
  private activeNodes: AudioNode[] = [];
  private activeStoppables: Array<{ stop: (when?: number) => void }> = [];
  private rafId = 0;
  private isPlaying = false;
  private loopEnabled = false;
  private startCtxTime = 0;
  private startBeatOffset = 0;
  private totalSongBeats = 16;
  private bpm = 120;

  public stop(): void {
    this.isPlaying = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    for (const s of this.activeStoppables) {
      try {
        s.stop();
      } catch {
        // Ignore already stopped
      }
    }
    for (const n of this.activeNodes) {
      try {
        n.disconnect();
      } catch {
        // Ignore
      }
    }
    this.activeStoppables = [];
    this.activeNodes = [];
  }

  public auditionPianoKey(
    engine: WebAudioDspEngine,
    midi: number,
    voicebank: VoicebankProfile,
    dspParams: DspParams,
    customSlot: VoiceSlot | null
  ): void {
    const { ctx, dspInput } = engine.ensureAudioReady(dspParams);
    const previewNote: VocalNote = {
      id: 'preview',
      midi,
      startBeat: 0,
      durationBeats: 0.8,
      lyric: 'la',
      phonetic: 'l a',
      vibratoDepth: dspParams.vibratoDepth,
      vibratoRate: dspParams.vibratoRate,
      portamentoMs: dspParams.portamentoMs ?? 35,
      isStressed: true,
      punctuation: 'none',
      g2pLanguage: 'es',
    };

    const customSamples = customSlot ? customSlot.buffer.getChannelData(0) : null;
    const stereo = renderSingingStereoBuffer(
      ctx.sampleRate,
      [previewNote],
      [],
      voicebank,
      dspParams,
      120,
      customSamples,
      0,
      0.85
    );

    const buf = ctx.createBuffer(2, stereo.left.length, ctx.sampleRate);
    buf.copyToChannel(new Float32Array(stereo.left), 0);
    buf.copyToChannel(new Float32Array(stereo.right), 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dspInput);
    src.start(ctx.currentTime);
    this.activeStoppables.push(src);
  }

  public playSong(
    engine: WebAudioDspEngine,
    notes: VocalNote[],
    pitchPoints: PitchControlPoint[],
    voicebank: VoicebankProfile,
    dspParams: DspParams,
    bpm: number,
    fromBeat: number,
    loop: boolean,
    metronome: boolean,
    customSlot: VoiceSlot | null,
    callbacks: SongPlaybackCallbacks,
    paramAutomation?: ParamAutomationMap,
    styleSettings?: VocaloidStyleSettings,
    channelTracks?: VocalTrackChannel[]
  ): void {
    this.stop();
    if (notes.length === 0) {
      callbacks.onEnded?.();
      return;
    }

    const { ctx, dspInput } = engine.ensureAudioReady(dspParams);
    this.bpm = bpm;
    this.loopEnabled = loop;
    this.isPlaying = true;

    const maxEndBeat = notes.reduce((acc, n) => Math.max(acc, n.startBeat + n.durationBeats), 4);
    this.totalSongBeats = Math.max(4, Math.ceil(maxEndBeat / 4) * 4);
    this.startBeatOffset = Math.max(0, fromBeat < this.totalSongBeats ? fromBeat : 0);

    const customSamples = customSlot ? customSlot.buffer.getChannelData(0) : null;

    const schedulePass = (passStartCtxTime: number, passStartBeat: number) => {
      const stereo = renderSingingStereoBuffer(
        ctx.sampleRate,
        notes,
        pitchPoints,
        voicebank,
        dspParams,
        bpm,
        customSamples,
        passStartBeat,
        this.totalSongBeats,
        paramAutomation,
        styleSettings,
        channelTracks
      );

      const buf = ctx.createBuffer(2, stereo.left.length, ctx.sampleRate);
      buf.copyToChannel(new Float32Array(stereo.left), 0);
      buf.copyToChannel(new Float32Array(stereo.right), 1);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dspInput);
      src.start(passStartCtxTime);
      this.activeStoppables.push(src);

      if (metronome) {
        this.scheduleMetronome(ctx, dspInput, passStartCtxTime, passStartBeat, this.totalSongBeats, bpm);
      }
    };

    this.startCtxTime = ctx.currentTime + 0.04;
    schedulePass(this.startCtxTime, this.startBeatOffset);

    const tick = () => {
      if (!this.isPlaying) return;
      const elapsedSec = Math.max(0, ctx.currentTime - this.startCtxTime);
      const currentBeat = this.startBeatOffset + (elapsedSec * this.bpm) / 60;

      if (currentBeat >= this.totalSongBeats) {
        if (this.loopEnabled) {
          this.stopTransientNodes();
          this.startBeatOffset = 0;
          this.startCtxTime = ctx.currentTime + 0.03;
          schedulePass(this.startCtxTime, 0);
          callbacks.onBeatUpdate?.(0);
        } else {
          this.stop();
          callbacks.onBeatUpdate?.(0);
          callbacks.onEnded?.();
          return;
        }
      } else {
        callbacks.onBeatUpdate?.(currentBeat);
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopTransientNodes(): void {
    for (const s of this.activeStoppables) {
      try {
        s.stop();
      } catch {
        // ignore
      }
    }
    for (const n of this.activeNodes) {
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeStoppables = [];
    this.activeNodes = [];
  }

  private scheduleMetronome(
    ctx: BaseAudioContext,
    dest: AudioNode,
    passStartCtxTime: number,
    startBeat: number,
    endBeat: number,
    bpm: number
  ): void {
    const firstBeat = Math.ceil(startBeat);
    for (let b = firstBeat; b < endBeat; b += 1) {
      const when = passStartCtxTime + ((b - startBeat) * 60) / bpm;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(b % 4 === 0 ? 1200 : 820, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(b % 4 === 0 ? 0.14 : 0.08, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      osc.connect(g);
      g.connect(dest);
      osc.start(when);
      osc.stop(when + 0.06);
      this.activeStoppables.push(osc);
      this.activeNodes.push(g);
    }
  }

  public async renderSongWav(
    notes: VocalNote[],
    pitchPoints: PitchControlPoint[],
    voicebank: VoicebankProfile,
    dspParams: DspParams,
    bpm: number,
    customSlot: VoiceSlot | null,
    paramAutomation?: ParamAutomationMap,
    styleSettings?: VocaloidStyleSettings,
    channelTracks?: VocalTrackChannel[]
  ): Promise<Blob> {
    const sr = 48000;
    const maxEndBeat = notes.reduce((acc, n) => Math.max(acc, n.startBeat + n.durationBeats), 4);
    const totalSongSec = (maxEndBeat * 60) / bpm;
    const tailSec = Math.min(3.0, 0.5 + dspParams.reverbRoomSize * 2.0);
    const totalFrames = Math.ceil((totalSongSec + tailSec) * sr);

    const offline = new OfflineAudioContext(2, totalFrames, sr);

    const hpf = offline.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = dspParams.highPassHz;

    const lpf = offline.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = dspParams.lowPassHz;
    hpf.connect(lpf);

    const dryGain = offline.createGain();
    dryGain.gain.value = 1 - dspParams.delayMix;
    const wetDelay = offline.createGain();
    wetDelay.gain.value = dspParams.delayMix;
    const delayL = offline.createDelay(2.0);
    const delayR = offline.createDelay(2.0);
    delayL.delayTime.value = dspParams.delayTimeMs * 0.001;
    delayR.delayTime.value = dspParams.delayTimeMs * 0.00075;
    const fbL = offline.createGain();
    const fbR = offline.createGain();
    fbL.gain.value = dspParams.delayFeedback;
    fbR.gain.value = dspParams.delayFeedback;
    const split = offline.createChannelSplitter(2);
    const merge = offline.createChannelMerger(2);

    lpf.connect(dryGain);
    lpf.connect(split);
    split.connect(delayL, 0);
    split.connect(delayR, 1);
    delayL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(fbR);
    fbR.connect(delayL);
    delayL.connect(merge, 0, 0);
    delayR.connect(merge, 0, 1);
    merge.connect(wetDelay);

    const postDelay = offline.createGain();
    dryGain.connect(postDelay);
    wetDelay.connect(postDelay);

    const conv = offline.createConvolver();
    const irData = generateReverbImpulseData(sr, dspParams.reverbRoomSize, dspParams.reverbDamping);
    const irBuf = offline.createBuffer(2, irData.left.length, sr);
    irBuf.copyToChannel(new Float32Array(irData.left), 0);
    irBuf.copyToChannel(new Float32Array(irData.right), 1);
    conv.buffer = irBuf;

    const revDry = offline.createGain();
    revDry.gain.value = 1 - dspParams.reverbMix * 0.5;
    const revWet = offline.createGain();
    revWet.gain.value = dspParams.reverbMix;
    postDelay.connect(revDry);
    postDelay.connect(conv);
    conv.connect(revWet);

    const shaper = offline.createWaveShaper();
    shaper.curve = buildSoftClipCurve(dspParams.drive);
    const master = offline.createGain();
    master.gain.value = dspParams.masterGain;
    revDry.connect(shaper);
    revWet.connect(shaper);
    shaper.connect(master);
    master.connect(offline.destination);

    const customSamples = customSlot ? customSlot.buffer.getChannelData(0) : null;
    const stereo = renderSingingStereoBuffer(
      sr,
      notes,
      pitchPoints,
      voicebank,
      dspParams,
      bpm,
      customSamples,
      0,
      maxEndBeat,
      paramAutomation,
      styleSettings,
      channelTracks
    );

    const vocalBuf = offline.createBuffer(2, stereo.left.length, sr);
    vocalBuf.copyToChannel(new Float32Array(stereo.left), 0);
    vocalBuf.copyToChannel(new Float32Array(stereo.right), 1);
    const src = offline.createBufferSource();
    src.buffer = vocalBuf;
    src.connect(hpf);
    src.start(0.02);

    const rendered = await offline.startRendering();
    const chL = rendered.getChannelData(0);
    const chR = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : chL;
    return new Blob([encodeWavBuffer([chL, chR], sr)], { type: 'audio/wav' });
  }
}
