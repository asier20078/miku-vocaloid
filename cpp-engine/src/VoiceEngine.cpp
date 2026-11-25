#include "voxdsp/VoiceEngine.hpp"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace VoxEngine {

// --- BiquadResonator Implementation ---

void BiquadResonator::reset() {
    z1_ = 0.0f;
    z2_ = 0.0f;
    lastFreq_ = -1.0f;
    lastQ_ = -1.0f;
}

float BiquadResonator::processBandpass(float input, float centerHz, float q, double sampleRate) {
    const float sr = static_cast<float>(std::max(8000.0, sampleRate));
    const float cf = std::clamp(centerHz, 40.0f, sr * 0.44f);
    const float cq = std::clamp(q, 0.4f, 26.0f);

    if (std::abs(cf - lastFreq_) > 0.5f || std::abs(cq - lastQ_) > 0.02f) {
        const float w = 2.0f * static_cast<float>(M_PI) * cf / sr;
        const float alpha = std::sin(w) / (2.0f * cq);
        const float cosw = std::cos(w);
        const float invA0 = 1.0f / (1.0f + alpha);
        b0_ = alpha * invA0;
        b1_ = 0.0f;
        b2_ = -alpha * invA0;
        a1_ = -2.0f * cosw * invA0;
        a2_ = (1.0f - alpha) * invA0;
        lastFreq_ = cf;
        lastQ_ = cq;
    }

    const float y = b0_ * input + z1_;
    z1_ = b1_ * input - a1_ * y + z2_;
    z2_ = b2_ * input - a2_ * y;
    if (std::abs(z1_) < 1e-18f) z1_ = 0.0f;
    if (std::abs(z2_) < 1e-18f) z2_ = 0.0f;
    return y;
}

// --- WorldVocoderCore Implementation ---

WorldVocoderCore::WorldVocoderCore(double sampleRate, size_t blockSize)
    : sampleRate_(sampleRate), blockSize_(blockSize) {
    reset();
}

void WorldVocoderCore::configure(double sampleRate, size_t maxBlockSize) {
    sampleRate_ = std::max(8000.0, sampleRate);
    blockSize_ = maxBlockSize;
    reset();
}

void WorldVocoderCore::reset() {
    phase_ = 0.0;
    pinkB0_ = pinkB1_ = pinkB2_ = 0.0f;
    for (auto& f : formantFilters_) f.reset();
    aperiodicityFilter_.reset();
}

float WorldVocoderCore::nextWhiteNoise() {
    rngState_ = 1664525u * rngState_ + 1013904223u;
    return static_cast<float>(rngState_) / static_cast<float>(0x80000000u) - 1.0f;
}

float WorldVocoderCore::nextPinkNoise(float white) {
    pinkB0_ = 0.99765f * pinkB0_ + white * 0.099046f;
    pinkB1_ = 0.96300f * pinkB1_ + white * 0.2965164f;
    pinkB2_ = 0.57000f * pinkB2_ + white * 1.0526913f;
    return (pinkB0_ + pinkB1_ + pinkB2_ + white * 0.1848f) * 0.22f;
}

float WorldVocoderCore::rosenbergGlottalPulse(double phase) {
    constexpr double openQuotient = 0.52;
    constexpr double closingQuotient = 0.18;
    double base = -0.32;
    if (phase < openQuotient) {
        base = 0.5 * (1.0 - std::cos(M_PI * phase / openQuotient)) - 0.32;
    } else if (phase < openQuotient + closingQuotient) {
        base = std::cos(0.5 * M_PI * (phase - openQuotient) / closingQuotient) - 0.32;
    }
    const double diff = (phase - openQuotient) / 0.045;
    const double brilliance = std::exp(-(diff * diff)) * 0.24;
    return static_cast<float>(base + brilliance);
}

void WorldVocoderCore::synthesizeFrame(const SynthesisParams& params, float* outBuffer, size_t numFrames) {
    const double f0Base = std::clamp(static_cast<double>(params.f0), 45.0, 1400.0);
    const float formantShift = std::clamp(params.formantShift, 0.70f, 1.35f);
    const float brightness = std::clamp(params.brightness, 0.5f, 1.6f);
    const float aperiodicity = std::clamp(params.aperiodicity, 0.0f, 1.0f);
    const float breathiness = std::clamp(params.breathiness, 0.0f, 0.65f);

    const float msPerSample = 1000.0f / static_cast<float>(sampleRate_);
    const float closureMs = params.formants.closureMs;
    const float burstMs = params.formants.burstMs;

    for (size_t i = 0; i < numFrames; ++i) {
        const float sampleElapsedMs = params.noteElapsedMs + static_cast<float>(i) * msPerSample;

        // Vibrato modulation (> 250 ms threshold, 150 ms fade-in, 5.5-6.5 Hz)
        const float vibSt = MidiCurveController::evaluateVibratoSemitones(
            sampleElapsedMs, params.noteDurationMs, params.vibratoDelayMs,
            params.vibratoRateHz, params.vibratoDepthSt
        );
        const double instF0 = f0Base * std::pow(2.0, static_cast<double>(vibSt) / 12.0);
        const double phaseInc = instF0 / sampleRate_;

        const float white = nextWhiteNoise();
        const float pink = nextPinkNoise(white);

        // Plosive 25-45 ms occlusion & burst envelope
        float plosiveGain = 1.0f;
        float burstBoost = 0.0f;
        if (closureMs > 0.0f) {
            if (sampleElapsedMs < closureMs) {
                plosiveGain = 0.0f;
            } else if (sampleElapsedMs < closureMs + burstMs) {
                const float burstTimeSec = (sampleElapsedMs - closureMs) * 0.001f;
                burstBoost = 1.45f * std::exp(-burstTimeSec / 0.007f);
            }
        }

        // Layer 1: Periodic F0 Rosenberg Glottal Excitation
        const float glottal = rosenbergGlottalPulse(phase_);
        const float voicedExcitation =
            (glottal * params.formants.voiceMix * (1.0f - aperiodicity * 0.35f) + pink * breathiness * 0.52f) *
            plosiveGain;

        // Layer 2: WORLD 5-Formant Spectral Envelope (F1-F5 with +12% Gender Formant Shift)
        constexpr std::array<float, 5> fGains = { 0.70f, 0.54f, 0.34f, 0.17f, 0.10f };
        float vocalOut = 0.0f;
        for (int f = 0; f < 5; ++f) {
            const float fc = params.formants.freqs[f] * formantShift;
            const float bw = std::max(30.0f, params.formants.bandwidths[f]);
            const float q = (f >= 3) ? (17.5f + 3.5f * (f - 3)) : (fc / bw);
            const float gain = (f == 0) ? fGains[f] : fGains[f] * brightness;
            vocalOut += formantFilters_[f].processBandpass(voicedExcitation, fc, q, sampleRate_) * gain;
        }

        // Layer 3: High-Frequency (3 kHz - 10 kHz) Aperiodicity & Plosive Burst Noise
        float consonantNoise = 0.0f;
        const float noiseLevel = std::min(1.75f, (params.formants.noiseMix + aperiodicity * 0.25f) *
                                                     params.consonantClarity * (1.0f + burstBoost));
        if (noiseLevel > 0.005f && !(closureMs > 0.0f && sampleElapsedMs < closureMs)) {
            const float noiseFc = std::clamp(params.formants.noiseCenterHz, 3000.0f, 10000.0f);
            const float shaped = aperiodicityFilter_.processBandpass(
                pink * 0.45f + white * 0.55f, noiseFc, std::max(1.8f, params.formants.noiseQ), sampleRate_
            );
            consonantNoise = shaped * noiseLevel * 0.72f;
        }

        const float adsr = MidiCurveController::evaluateSyllableAdsr(sampleElapsedMs, params.noteDurationMs);
        outBuffer[i] = std::tanh((vocalOut + consonantNoise) * 1.55f) * adsr;

        phase_ += phaseInc;
        if (phase_ >= 1.0) phase_ -= 1.0;
    }
}

// --- DiphoneSequencer Implementation ---

DiphoneSequencer::DiphoneSequencer() {
    initDefaultTable();
}

void DiphoneSequencer::initDefaultTable() {
    diphoneTableMs_ = {
        {"w-i", 34.0f}, {"i-r", 28.0f}, {"w-e", 35.0f}, {"e-i", 38.0f},
        {"a-i", 36.0f}, {"o-u", 36.0f}, {"t-o", 28.0f}, {"t-i", 28.0f},
        {"k-a", 32.0f}, {"k-u", 28.0f}, {"p-a", 30.0f}, {"b-r", 34.0f},
        {"f-r", 32.0f}, {"s-o", 32.0f}, {"s-i", 28.0f}, {"n-t", 25.0f},
        {"m-i", 32.0f}, {"m-o", 32.0f}, {"l-a", 34.0f}, {"t-h", 26.0f}
    };
}

float DiphoneSequencer::lookupTransitionMs(const std::string& from, const std::string& to, DiphoneCategory cat) const {
    const auto it = diphoneTableMs_.find(from + "-" + to);
    if (it != diphoneTableMs_.end()) return it->second;
    switch (cat) {
        case DiphoneCategory::CV: return 32.0f;
        case DiphoneCategory::VC: return 28.0f;
        case DiphoneCategory::VV: return 38.0f;
        case DiphoneCategory::CC: return 24.0f;
    }
    return 30.0f;
}

void DiphoneSequencer::addTransition(const std::string& from, const std::string& to, DiphoneCategory cat) {
    const float ms = std::clamp(lookupTransitionMs(from, to, cat), 22.0f, 45.0f);
    const float weight = (cat == DiphoneCategory::CV) ? 0.85f : (cat == DiphoneCategory::VC ? 0.72f : 0.65f);
    const float bias = (cat == DiphoneCategory::CV) ? 0.38f : (cat == DiphoneCategory::VC ? 0.62f : 0.50f);
    transitions_.push_back({from, to, cat, ms, weight, bias});
}

void DiphoneSequencer::reset() {
    currentIndex_ = 0;
}

bool DiphoneSequencer::getNextTransition(DiphoneTransition& outTransition) {
    if (currentIndex_ < transitions_.size()) {
        outTransition = transitions_[currentIndex_++];
        return true;
    }
    return false;
}

float DiphoneSequencer::calculateCrossfadeWeight(float progress) const {
    return MidiCurveController::smoothstep(progress);
}

// --- MidiCurveController Implementation ---

float MidiCurveController::smoothstep(float t) {
    const float c = std::clamp(t, 0.0f, 1.0f);
    return c * c * (3.0f - 2.0f * c);
}

float MidiCurveController::evaluatePortamentoF0(float prevF0, float targetF0, float elapsedMs, float portamentoMs) {
    if (portamentoMs <= 1.0f || elapsedMs >= portamentoMs) return targetF0;
    const float u = smoothstep(elapsedMs / portamentoMs);
    return prevF0 + (targetF0 - prevF0) * u;
}

float MidiCurveController::evaluateVibratoSemitones(float elapsedMs, float durationMs, float delayMs, float rateHz, float depthSt) {
    if (durationMs <= 250.0f || elapsedMs <= delayMs || depthSt <= 0.0f) return 0.0f;
    const float fade = std::min(1.0f, (elapsedMs - delayMs) / 150.0f);
    const float timeSec = (elapsedMs - delayMs) * 0.001f;
    return std::sin(2.0f * static_cast<float>(M_PI) * rateHz * timeSec) * depthSt * fade;
}

float MidiCurveController::evaluateSyllableAdsr(float elapsedMs, float durationMs, float atkMs, float decMs, float sus, float relMs) {
    if (durationMs <= 1.0f) return 1.0f;
    float gain = sus;
    if (elapsedMs < atkMs) {
        gain = elapsedMs / std::max(1.0f, atkMs);
    } else if (elapsedMs < atkMs + decMs) {
        const float t = (elapsedMs - atkMs) / std::max(1.0f, decMs);
        gain = 1.0f - (1.0f - sus) * t;
    }
    const float remMs = durationMs - elapsedMs;
    if (remMs < relMs) {
        gain *= std::max(0.0f, remMs / std::max(1.0f, relMs));
    }
    return std::clamp(gain, 0.0f, 1.0f);
}

// --- VoiceSynthesizer Implementation ---

VoiceSynthesizer::VoiceSynthesizer(double sampleRate, size_t maxBlockSize)
    : sampleRate_(sampleRate), maxBlockSize_(maxBlockSize) {
    spectralSynth_ = std::make_unique<WorldVocoderCore>(sampleRate, maxBlockSize);
    diphoneSequencer_ = std::make_unique<DiphoneSequencer>();
    scratchVoiceBuffer_.resize(maxBlockSize, 0.0f);
    configurePolyphonicChoir(true, true);
}

void VoiceSynthesizer::setSpectralSynthesizer(std::unique_ptr<ISpectralSynthesizer> synth) {
    if (synth) {
        spectralSynth_ = std::move(synth);
        spectralSynth_->configure(sampleRate_, maxBlockSize_);
    }
}

void VoiceSynthesizer::setDiphoneSequencer(std::unique_ptr<DiphoneSequencer> sequencer) {
    if (sequencer) {
        diphoneSequencer_ = std::move(sequencer);
    }
}

void VoiceSynthesizer::configurePolyphonicChoir(bool enableChords35, bool enableRhythmicBass) {
    harmonyVoices_.clear();
    harmonyCores_.clear();

    // Lead voice (center)
    harmonyVoices_.push_back({ 0, 1.00f, 0.00f, 0.80f, false });
    if (enableChords35) {
        harmonyVoices_.push_back({ 4, 1.04f, -0.48f, 0.42f, false }); // Major 3rd Left
        harmonyVoices_.push_back({ 7, 0.97f, 0.48f, 0.40f, false });  // Perfect 5th Right
    }
    if (enableRhythmicBass) {
        harmonyVoices_.push_back({ -12, 0.84f, 0.00f, 0.42f, true }); // Rhythmic Vocal Sub-Bass
    }

    for (size_t i = 0; i < harmonyVoices_.size(); ++i) {
        harmonyCores_.push_back(std::make_unique<WorldVocoderCore>(sampleRate_, maxBlockSize_));
    }
}

void VoiceSynthesizer::processAudioBlock(const float* /*inputBuffer*/, float* outputBuffer, unsigned long framesPerBuffer) {
    const size_t frames = static_cast<size_t>(framesPerBuffer);
    std::fill(outputBuffer, outputBuffer + frames * 2, 0.0f);
    if (!isPlaying_ || harmonyCores_.empty()) return;

    if (scratchVoiceBuffer_.size() < frames) {
        scratchVoiceBuffer_.resize(frames, 0.0f);
    }

    const float blockMs = static_cast<float>(frames) * 1000.0f / static_cast<float>(sampleRate_);
    const float glidedF0 = MidiCurveController::evaluatePortamentoF0(
        prevF0_, currentParams_.targetF0, currentParams_.noteElapsedMs, currentParams_.portamentoMs
    );

    for (size_t v = 0; v < harmonyVoices_.size(); ++v) {
        const auto& cfg = harmonyVoices_[v];
        SynthesisParams voiceParams = currentParams_;
        voiceParams.f0 = glidedF0 * std::pow(2.0f, static_cast<float>(cfg.semitoneOffset) / 12.0f);
        voiceParams.formantShift = currentParams_.formantShift * cfg.formantScale;
        if (cfg.rhythmicBass) {
            voiceParams.vibratoDepthSt = 0.0f;
            voiceParams.brightness = 0.82f;
        }

        harmonyCores_[v]->synthesizeFrame(voiceParams, scratchVoiceBuffer_.data(), frames);

        const float panAngle = (std::clamp(cfg.pan, -1.0f, 1.0f) + 1.0f) * static_cast<float>(M_PI) * 0.25f;
        const float gainL = std::cos(panAngle) * cfg.gain;
        const float gainR = std::sin(panAngle) * cfg.gain;

        for (size_t i = 0; i < frames; ++i) {
            const float s = scratchVoiceBuffer_[i];
            outputBuffer[i * 2] = std::clamp(outputBuffer[i * 2] + s * gainL, -0.98f, 0.98f);
            outputBuffer[i * 2 + 1] = std::clamp(outputBuffer[i * 2 + 1] + s * gainR, -0.98f, 0.98f);
        }
    }

    currentParams_.noteElapsedMs += blockMs;
}

void VoiceSynthesizer::updateParameters(const SynthesisParams& params) {
    currentParams_ = params;
}

void VoiceSynthesizer::startNote(float f0, float noteDurationMs) {
    prevF0_ = isPlaying_ ? currentParams_.targetF0 : f0;
    currentParams_.f0 = f0;
    currentParams_.targetF0 = f0;
    currentParams_.noteDurationMs = noteDurationMs;
    currentParams_.noteElapsedMs = 0.0f;
    isPlaying_ = true;

    if (spectralSynth_) spectralSynth_->reset();
    for (auto& core : harmonyCores_) {
        if (core) core->reset();
    }
}

void VoiceSynthesizer::stopNote() {
    isPlaying_ = false;
}

} // namespace VoxEngine
