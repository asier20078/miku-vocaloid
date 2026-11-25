import {
  buildSoftClipCurve,
  computeUnisonLayers,
  DspParams,
  encodeWavBuffer,
  extractWaveformPeaks,
  generateReverbImpulseData,
  synthesizeVocalFormantBuffer,
} from './dspMath';

export interface VoiceSlot {
  id: string;
  name: string;
  sourceType: 'demo' | 'upload' | 'mic';
  buffer: AudioBuffer;
  durationSec: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
}

export interface EngineTelemetrySnapshot {
  peakLeft: number;
  peakRight: number;
  activeVoices: number;
  timeDomain: Float32Array;
  frequencyData: Uint8Array;
}

interface ActivePlaybackNode {
  sources: AudioBufferSourceNode[];
  envelopeGain: GainNode;
  isLoop: boolean;
  slotId: string;
}

export class WebAudioDspEngine {
  private ctx: AudioContext | null = null;
  private hpfNode: BiquadFilterNode | null = null;
  private lpfNode: BiquadFilterNode | null = null;

  private dryGainNode: GainNode | null = null;
  private delayWetGainNode: GainNode | null = null;
  private delayNodeL: DelayNode | null = null;
  private delayNodeR: DelayNode | null = null;
  private delayFbL: GainNode | null = null;
  private delayFbR: GainNode | null = null;
  private delayDampL: BiquadFilterNode | null = null;
  private delayDampR: BiquadFilterNode | null = null;

  private reverbConvolver: ConvolverNode | null = null;
  private reverbDryGain: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;

  private saturatorNode: WaveShaperNode | null = null;
  private masterGainNode: GainNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private analyserMix: AnalyserNode | null = null;
  private analyserLeft: AnalyserNode | null = null;
  private analyserRight: AnalyserNode | null = null;

  private activePlaybacks: Set<ActivePlaybackNode> = new Set();
  private lastReverbRoom = -1;
  private lastReverbDamp = -1;
  private lastDrive = -1;

  private timeDomainBuffer = new Float32Array(1024);
  private freqBuffer = new Uint8Array(256);
  private peakTmpL = new Float32Array(256);
  private peakTmpR = new Float32Array(256);

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 48000 });
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private buildGraph(ctx: AudioContext): void {
    // Master input bus -> HPF -> LPF
    this.hpfNode = ctx.createBiquadFilter();
    this.hpfNode.type = 'highpass';
    this.hpfNode.Q.value = 0.7071;

    this.lpfNode = ctx.createBiquadFilter();
    this.lpfNode.type = 'lowpass';
    this.lpfNode.Q.value = 0.7071;

    this.hpfNode.connect(this.lpfNode);

    // Stereo ping-pong delay stage
    this.dryGainNode = ctx.createGain();
    this.delayWetGainNode = ctx.createGain();
    this.delayNodeL = ctx.createDelay(2.0);
    this.delayNodeR = ctx.createDelay(2.0);
    this.delayFbL = ctx.createGain();
    this.delayFbR = ctx.createGain();
    this.delayDampL = ctx.createBiquadFilter();
    this.delayDampR = ctx.createBiquadFilter();
    this.delayDampL.type = 'lowpass';
    this.delayDampL.frequency.value = 3800;
    this.delayDampR.type = 'lowpass';
    this.delayDampR.frequency.value = 3800;

    const delayMerger = ctx.createChannelMerger(2);
    const delaySplitter = ctx.createChannelSplitter(2);

    this.lpfNode.connect(this.dryGainNode);
    this.lpfNode.connect(delaySplitter);

    delaySplitter.connect(this.delayNodeL, 0);
    delaySplitter.connect(this.delayNodeR, 1);

    this.delayNodeL.connect(this.delayDampL);
    this.delayDampL.connect(this.delayFbL);
    this.delayFbL.connect(this.delayNodeR);

    this.delayNodeR.connect(this.delayDampR);
    this.delayDampR.connect(this.delayFbR);
    this.delayFbR.connect(this.delayNodeL);

    this.delayNodeL.connect(delayMerger, 0, 0);
    this.delayNodeR.connect(delayMerger, 0, 1);
    delayMerger.connect(this.delayWetGainNode);

    // Reverb stage
    const postDelayBus = ctx.createGain();
    this.dryGainNode.connect(postDelayBus);
    this.delayWetGainNode.connect(postDelayBus);

    this.reverbConvolver = ctx.createConvolver();
    this.reverbDryGain = ctx.createGain();
    this.reverbWetGain = ctx.createGain();

    postDelayBus.connect(this.reverbDryGain);
    postDelayBus.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWetGain);

    // Saturator + Master Gain + Analysers
    this.saturatorNode = ctx.createWaveShaper();
    this.saturatorNode.oversample = '2x';
    this.masterGainNode = ctx.createGain();

    this.reverbDryGain.connect(this.saturatorNode);
    this.reverbWetGain.connect(this.saturatorNode);
    this.saturatorNode.connect(this.masterGainNode);

    this.analyserMix = ctx.createAnalyser();
    this.analyserMix.fftSize = 1024;
    this.timeDomainBuffer = new Float32Array(this.analyserMix.fftSize);
    this.freqBuffer = new Uint8Array(this.analyserMix.frequencyBinCount);

    this.splitterNode = ctx.createChannelSplitter(2);
    this.analyserLeft = ctx.createAnalyser();
    this.analyserLeft.fftSize = 256;
    this.analyserRight = ctx.createAnalyser();
    this.analyserRight.fftSize = 256;

    this.masterGainNode.connect(this.analyserMix);
    this.masterGainNode.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserLeft, 0);
    this.splitterNode.connect(this.analyserRight, 1);
    this.masterGainNode.connect(ctx.destination);
  }

  public ensureAudioReady(params: DspParams): { ctx: AudioContext; dspInput: AudioNode } {
    const ctx = this.ensureContext();
    this.applyParams(params);
    return { ctx, dspInput: this.hpfNode! };
  }

  public applyParams(params: DspParams): void {
    if (!this.ctx || !this.hpfNode || !this.lpfNode) return;
    const now = this.ctx.currentTime;

    this.hpfNode.frequency.setTargetAtTime(params.highPassHz, now, 0.015);
    this.lpfNode.frequency.setTargetAtTime(params.lowPassHz, now, 0.015);

    if (this.delayNodeL && this.delayNodeR && this.delayFbL && this.delayFbR && this.dryGainNode && this.delayWetGainNode) {
      const delaySec = params.delayTimeMs * 0.001;
      this.delayNodeL.delayTime.setTargetAtTime(delaySec, now, 0.025);
      this.delayNodeR.delayTime.setTargetAtTime(delaySec * 0.75, now, 0.025);
      this.delayFbL.gain.setTargetAtTime(params.delayFeedback, now, 0.02);
      this.delayFbR.gain.setTargetAtTime(params.delayFeedback, now, 0.02);
      this.dryGainNode.gain.setTargetAtTime(1 - params.delayMix, now, 0.02);
      this.delayWetGainNode.gain.setTargetAtTime(params.delayMix, now, 0.02);
    }

    if (this.reverbDryGain && this.reverbWetGain && this.reverbConvolver) {
      this.reverbDryGain.gain.setTargetAtTime(1 - params.reverbMix * 0.5, now, 0.02);
      this.reverbWetGain.gain.setTargetAtTime(params.reverbMix, now, 0.02);

      if (
        Math.abs(params.reverbRoomSize - this.lastReverbRoom) > 0.02 ||
        Math.abs(params.reverbDamping - this.lastReverbDamp) > 0.02
      ) {
        this.lastReverbRoom = params.reverbRoomSize;
        this.lastReverbDamp = params.reverbDamping;
        const irData = generateReverbImpulseData(
          this.ctx.sampleRate,
          params.reverbRoomSize,
          params.reverbDamping
        );
        const irBuffer = this.ctx.createBuffer(2, irData.left.length, this.ctx.sampleRate);
        irBuffer.copyToChannel(new Float32Array(irData.left), 0);
        irBuffer.copyToChannel(new Float32Array(irData.right), 1);
        this.reverbConvolver.buffer = irBuffer;
      }
    }

    if (this.saturatorNode && Math.abs(params.drive - this.lastDrive) > 0.02) {
      this.lastDrive = params.drive;
      this.saturatorNode.curve = buildSoftClipCurve(params.drive);
    }

    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(params.masterGain, now, 0.015);
    }
  }

  public createBuiltInVoiceSlots(): VoiceSlot[] {
    const sampleRate = 48000;
    const offlineCtx = new OfflineAudioContext(1, 1, sampleRate);

    const makeSlot = (
      id: string,
      name: string,
      durationSec: number,
      f0: number,
      formants: [number, number, number]
    ): VoiceSlot => {
      const pcm = synthesizeVocalFormantBuffer(sampleRate, durationSec, f0, formants);
      const buf = offlineCtx.createBuffer(1, pcm.length, sampleRate);
      buf.copyToChannel(new Float32Array(pcm), 0);
      return {
        id,
        name,
        sourceType: 'demo',
        buffer: buf,
        durationSec: buf.duration,
        sampleRate: buf.sampleRate,
        channels: buf.numberOfChannels,
        peaks: extractWaveformPeaks(pcm, 96),
      };
    };

    return [
      makeSlot('demo-vocal-a', 'Voz Tenor — Vocal "Aaa"', 1.6, 174.6, [730, 1090, 2440]),
      makeSlot('demo-vocal-o', 'Voz Soprano — Vocal "Ooo"', 1.8, 293.6, [450, 820, 2650]),
      makeSlot('demo-vocal-e', 'Voz Barítono — Vocal "Eee"', 1.5, 130.8, [530, 1840, 2480]),
    ];
  }

  public async decodeAudioFile(file: File): Promise<VoiceSlot> {
    const ctx = this.ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channel0 = decoded.getChannelData(0);

    return {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      sourceType: 'upload',
      buffer: decoded,
      durationSec: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      peaks: extractWaveformPeaks(channel0, 96),
    };
  }

  public async decodeRecordedBlob(blob: Blob, label: string): Promise<VoiceSlot> {
    const ctx = this.ensureContext();
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channel0 = decoded.getChannelData(0);

    return {
      id: `mic-${Date.now()}`,
      name: label,
      sourceType: 'mic',
      buffer: decoded,
      durationSec: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      peaks: extractWaveformPeaks(channel0, 96),
    };
  }

  public triggerVoice(slot: VoiceSlot, params: DspParams, loop: boolean): void {
    const ctx = this.ensureContext();
    this.applyParams(params);
    if (!this.hpfNode) return;

    const now = ctx.currentTime;
    const layers = computeUnisonLayers(
      params.pitchRatio,
      params.pan,
      params.unisonVoices,
      params.unisonDetune,
      params.unisonSpread
    );

    const envelopeGain = ctx.createGain();
    const attackSec = params.attackMs * 0.001;
    const decaySec = params.decayMs * 0.001;
    const releaseSec = params.releaseMs * 0.001;

    envelopeGain.gain.setValueAtTime(0.0001, now);
    envelopeGain.gain.linearRampToValueAtTime(1.0, now + attackSec);
    envelopeGain.gain.linearRampToValueAtTime(params.sustainLevel, now + attackSec + decaySec);
    envelopeGain.connect(this.hpfNode);

    const playbackRecord: ActivePlaybackNode = {
      sources: [],
      envelopeGain,
      isLoop: loop,
      slotId: slot.id,
    };

    let finishedCount = 0;
    for (const layer of layers) {
      const src = ctx.createBufferSource();
      src.buffer = slot.buffer;
      src.loop = loop;
      src.playbackRate.setValueAtTime(layer.playbackRate, now);

      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(layer.pan, now);

      const layerGain = ctx.createGain();
      layerGain.gain.setValueAtTime(layer.gainScale, now);

      src.connect(layerGain);
      layerGain.connect(panner);
      panner.connect(envelopeGain);

      if (!loop) {
        const expectedDuration = slot.buffer.duration / layer.playbackRate;
        const releaseStart = Math.max(now + attackSec + 0.02, now + expectedDuration - releaseSec);
        envelopeGain.gain.setValueAtTime(params.sustainLevel, releaseStart);
        envelopeGain.gain.linearRampToValueAtTime(0.0001, releaseStart + releaseSec);
      }

      src.onended = () => {
        finishedCount += 1;
        if (finishedCount >= layers.length) {
          this.activePlaybacks.delete(playbackRecord);
          envelopeGain.disconnect();
        }
      };

      src.start(now);
      playbackRecord.sources.push(src);
    }

    this.activePlaybacks.add(playbackRecord);
  }

  public stopAllVoices(): void {
    if (!this.ctx) {
      this.activePlaybacks.clear();
      return;
    }
    const now = this.ctx.currentTime;
    for (const pb of this.activePlaybacks) {
      try {
        pb.envelopeGain.gain.cancelScheduledValues(now);
        pb.envelopeGain.gain.setTargetAtTime(0.0001, now, 0.025);
        for (const src of pb.sources) {
          src.stop(now + 0.1);
        }
      } catch {
        // Source may have already finished
      }
    }
    this.activePlaybacks.clear();
  }

  public readTelemetry(): EngineTelemetrySnapshot {
    if (!this.analyserMix || !this.analyserLeft || !this.analyserRight || this.activePlaybacks.size === 0) {
      this.timeDomainBuffer.fill(0);
      this.freqBuffer.fill(0);
      return {
        peakLeft: 0,
        peakRight: 0,
        activeVoices: this.activePlaybacks.size,
        timeDomain: this.timeDomainBuffer,
        frequencyData: this.freqBuffer,
      };
    }

    this.analyserMix.getFloatTimeDomainData(this.timeDomainBuffer);
    this.analyserMix.getByteFrequencyData(this.freqBuffer);
    this.analyserLeft.getFloatTimeDomainData(this.peakTmpL);
    this.analyserRight.getFloatTimeDomainData(this.peakTmpR);

    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < this.peakTmpL.length; i++) {
      peakL = Math.max(peakL, Math.abs(this.peakTmpL[i]));
      peakR = Math.max(peakR, Math.abs(this.peakTmpR[i]));
    }

    return {
      peakLeft: peakL,
      peakRight: peakR,
      activeVoices: this.activePlaybacks.size,
      timeDomain: this.timeDomainBuffer,
      frequencyData: this.freqBuffer,
    };
  }

  public async renderProcessedWav(slot: VoiceSlot, params: DspParams): Promise<Blob> {
    const sr = 48000;
    const tailSeconds = Math.min(3.5, 0.5 + params.reverbRoomSize * 2.2 + params.delayTimeMs * 0.002);
    const playSeconds = slot.buffer.duration / params.pitchRatio;
    const totalFrames = Math.ceil((playSeconds + tailSeconds) * sr);

    const offline = new OfflineAudioContext(2, totalFrames, sr);

    const hpf = offline.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = params.highPassHz;

    const lpf = offline.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = params.lowPassHz;
    hpf.connect(lpf);

    // Delay
    const dryGain = offline.createGain();
    dryGain.gain.value = 1 - params.delayMix;
    const wetDelay = offline.createGain();
    wetDelay.gain.value = params.delayMix;

    const delayL = offline.createDelay(2.0);
    const delayR = offline.createDelay(2.0);
    delayL.delayTime.value = params.delayTimeMs * 0.001;
    delayR.delayTime.value = params.delayTimeMs * 0.00075;

    const fbL = offline.createGain();
    const fbR = offline.createGain();
    fbL.gain.value = params.delayFeedback;
    fbR.gain.value = params.delayFeedback;

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

    // Reverb
    const conv = offline.createConvolver();
    const irData = generateReverbImpulseData(sr, params.reverbRoomSize, params.reverbDamping);
    const irBuf = offline.createBuffer(2, irData.left.length, sr);
    irBuf.copyToChannel(new Float32Array(irData.left), 0);
    irBuf.copyToChannel(new Float32Array(irData.right), 1);
    conv.buffer = irBuf;

    const revDry = offline.createGain();
    revDry.gain.value = 1 - params.reverbMix * 0.5;
    const revWet = offline.createGain();
    revWet.gain.value = params.reverbMix;

    postDelay.connect(revDry);
    postDelay.connect(conv);
    conv.connect(revWet);

    const shaper = offline.createWaveShaper();
    shaper.curve = buildSoftClipCurve(params.drive);
    const master = offline.createGain();
    master.gain.value = params.masterGain;

    revDry.connect(shaper);
    revWet.connect(shaper);
    shaper.connect(master);
    master.connect(offline.destination);

    // Voices
    const layers = computeUnisonLayers(
      params.pitchRatio,
      params.pan,
      params.unisonVoices,
      params.unisonDetune,
      params.unisonSpread
    );

    const env = offline.createGain();
    const atk = params.attackMs * 0.001;
    const dec = params.decayMs * 0.001;
    const rel = params.releaseMs * 0.001;
    env.gain.setValueAtTime(0.0001, 0);
    env.gain.linearRampToValueAtTime(1.0, atk);
    env.gain.linearRampToValueAtTime(params.sustainLevel, atk + dec);
    const relStart = Math.max(atk + dec, playSeconds - rel);
    env.gain.setValueAtTime(params.sustainLevel, relStart);
    env.gain.linearRampToValueAtTime(0.0001, relStart + rel);
    env.connect(hpf);

    for (const layer of layers) {
      const src = offline.createBufferSource();
      src.buffer = slot.buffer;
      src.playbackRate.value = layer.playbackRate;
      const g = offline.createGain();
      g.gain.value = layer.gainScale;
      const panner = offline.createStereoPanner();
      panner.pan.value = layer.pan;
      src.connect(g);
      g.connect(panner);
      panner.connect(env);
      src.start(0);
    }

    const rendered = await offline.startRendering();
    const chL = rendered.getChannelData(0);
    const chR = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : chL;
    const wavArrayBuf = encodeWavBuffer([chL, chR], sr);
    return new Blob([wavArrayBuf], { type: 'audio/wav' });
  }
}
