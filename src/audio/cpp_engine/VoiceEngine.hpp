#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace VoxEngine {

// Stereo buffer optimized for PortAudio callbacks (zero-allocation in audio thread)
struct StereoFrame {
    float left = 0.0f;
    float right = 0.0f;
};

struct AudioBuffer {
    std::array<std::vector<float>, 2> channels;
    size_t numFrames = 0;
    double sampleRate = 48000.0;

    void resize(size_t frames, double sr) {
        numFrames = frames;
        sampleRate = sr;
        channels[0].assign(frames, 0.0f);
        channels[1].assign(frames, 0.0f);
    }
};

enum class DiphoneCategory : uint8_t { CV, VC, VV, CC };

struct DiphoneTransition {
    std::string fromPhoneme;
    std::string toPhoneme;
    DiphoneCategory category = DiphoneCategory::CV;
    float crossfadeDurationMs = 32.0f; // 22..45 ms
    float crossfadeWeight = 0.85f;
    float spliceBias = 0.38f;
};

struct FormantState {
    std::array<float, 5> freqs = { 760.0f, 1180.0f, 2520.0f, 3450.0f, 4450.0f };
    std::array<float, 5> bandwidths = { 80.0f, 110.0f, 160.0f, 195.0f, 220.0f };
    float voiceMix = 1.0f;
    float noiseMix = 0.0f;
    float noiseCenterHz = 5600.0f; // 3000..10000 Hz
    float noiseQ = 2.4f;
    float closureMs = 0.0f; // 17..24 ms for fast pop plosives
    float burstMs = 0.0f;   // 11..16 ms -> total 28..40 ms
};

struct SynthesisParams {
    float f0 = 440.0f;
    float targetF0 = 440.0f;
    float formantShift = 1.12f; // +12% Gender Factor (Hatsune Miku / Kaai Yuki bright timbre)
    float brightness = 1.18f;
    float aperiodicity = 0.14f;
    float breathiness = 0.09f;
    float consonantClarity = 1.15f;
    float portamentoMs = 35.0f;    // Crisp 35 ms S-curve glide
    float vibratoRateHz = 6.0f;    // 5.5..6.5 Hz
    float vibratoDepthSt = 0.24f;  // Semitones
    float vibratoDelayMs = 150.0f; // Fade-in delay after 250 ms threshold
    float noteDurationMs = 500.0f;
    float noteElapsedMs = 0.0f;
    FormantState formants;
};

struct HarmonyVoiceConfig {
    int semitoneOffset = 0;
    float formantScale = 1.0f; // Distinct timbre per harmony voice
    float pan = 0.0f;          // -1.0 Left .. +1.0 Right
    float gain = 0.80f;
    bool rhythmicBass = false;
};

// Resonant 2nd-order Biquad Bandpass Filter for WORLD F1-F5 Formants & 3-10 kHz Aperiodicity
class BiquadResonator {
private:
    float b0_ = 1.0f, b1_ = 0.0f, b2_ = 0.0f, a1_ = 0.0f, a2_ = 0.0f;
    float z1_ = 0.0f, z2_ = 0.0f;
    float lastFreq_ = -1.0f;
    float lastQ_ = -1.0f;

public:
    void reset();
    float processBandpass(float input, float centerHz, float q, double sampleRate);
};

// Abstract Base Class for Spectral Synthesis (Polymorphism & Dependency Inversion)
class ISpectralSynthesizer {
public:
    virtual ~ISpectralSynthesizer() = default;
    virtual void configure(double sampleRate, size_t maxBlockSize) = 0;
    virtual void synthesizeFrame(const SynthesisParams& params, float* outBuffer, size_t numFrames) = 0;
    virtual void reset() = 0;
};

// WORLD-style Parametric Vocoder Core:
// Layer 1: Periodic F0 Rosenberg glottal pulse with high harmonic brilliance
// Layer 2: F1-F5 Spectral Envelope with Gender Formant Shift (+8% to +15%, default +12%)
// Layer 3: High-frequency (3-10 kHz) aperiodicity noise & 25-45 ms plosive bursts
class WorldVocoderCore : public ISpectralSynthesizer {
private:
    double sampleRate_;
    size_t blockSize_;
    double phase_ = 0.0;
    uint32_t rngState_ = 0x12345678u;
    float pinkB0_ = 0.0f, pinkB1_ = 0.0f, pinkB2_ = 0.0f;
    std::array<BiquadResonator, 5> formantFilters_;
    BiquadResonator aperiodicityFilter_;

    float nextWhiteNoise();
    float nextPinkNoise(float white);
    static float rosenbergGlottalPulse(double phase);

public:
    WorldVocoderCore(double sampleRate = 48000.0, size_t blockSize = 512);
    ~WorldVocoderCore() override = default;

    void configure(double sampleRate, size_t maxBlockSize) override;
    void synthesizeFrame(const SynthesisParams& params, float* outBuffer, size_t numFrames) override;
    void reset() override;
};

// Diphone Sequencer for Phoneme transition crossfading (CV, VC, VV, CC)
class DiphoneSequencer {
private:
    std::vector<DiphoneTransition> transitions_;
    std::unordered_map<std::string, float> diphoneTableMs_;
    size_t currentIndex_ = 0;

    void initDefaultTable();

public:
    DiphoneSequencer();
    ~DiphoneSequencer() = default;

    void addTransition(const std::string& from, const std::string& to, DiphoneCategory cat = DiphoneCategory::CV);
    void reset();
    bool getNextTransition(DiphoneTransition& outTransition);
    float lookupTransitionMs(const std::string& from, const std::string& to, DiphoneCategory cat) const;
    float calculateCrossfadeWeight(float progress) const;
};

// MIDI Pitch & Syllable ADSR Curve Controller (35 ms S-curve portamento + >250 ms vibrato)
class MidiCurveController {
public:
    static float smoothstep(float t);
    static float evaluatePortamentoF0(float prevF0, float targetF0, float elapsedMs, float portamentoMs);
    static float evaluateVibratoSemitones(float elapsedMs, float durationMs, float delayMs, float rateHz, float depthSt);
    static float evaluateSyllableAdsr(float elapsedMs, float durationMs, float atkMs = 10.0f, float decMs = 55.0f, float sus = 0.86f, float relMs = 35.0f);
};

// Main Polyphonic Voice Synthesizer coordinating WORLD cores, diphones & PortAudio stereo buffers
class VoiceSynthesizer {
private:
    double sampleRate_;
    size_t maxBlockSize_;
    std::unique_ptr<ISpectralSynthesizer> spectralSynth_;
    std::vector<std::unique_ptr<ISpectralSynthesizer>> harmonyCores_;
    std::vector<HarmonyVoiceConfig> harmonyVoices_;
    std::unique_ptr<DiphoneSequencer> diphoneSequencer_;
    std::vector<float> scratchVoiceBuffer_;
    SynthesisParams currentParams_;
    float prevF0_ = 440.0f;
    bool isPlaying_ = false;

public:
    VoiceSynthesizer(double sampleRate = 48000.0, size_t maxBlockSize = 512);
    ~VoiceSynthesizer() = default;

    void setSpectralSynthesizer(std::unique_ptr<ISpectralSynthesizer> synth);
    void setDiphoneSequencer(std::unique_ptr<DiphoneSequencer> sequencer);
    void configurePolyphonicChoir(bool enableChords35, bool enableRhythmicBass);

    // PortAudio stereo processing hook (interleaved stereo output)
    void processAudioBlock(const float* inputBuffer, float* outputBuffer, unsigned long framesPerBuffer);

    void updateParameters(const SynthesisParams& params);
    void startNote(float f0, float noteDurationMs = 500.0f);
    void stopNote();
    bool isPlaying() const { return isPlaying_; }
    size_t harmonyVoiceCount() const { return harmonyVoices_.size(); }
};

} // namespace VoxEngine
