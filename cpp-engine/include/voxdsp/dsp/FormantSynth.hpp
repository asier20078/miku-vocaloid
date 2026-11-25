#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include "../Types.hpp"
#include "BiquadFilter.hpp"

namespace voxdsp::dsp {

enum class VowelType : uint8_t {
    A = 0,
    E = 1,
    I = 2,
    O = 3,
    U = 4
};

struct FormantTarget {
    float f1;
    float f2;
    float f3;
};

// Vocaloid-inspired parallel 3-formant singing synthesizer for C++20.
class FormantSynth {
public:
    void prepare(double sampleRate) noexcept {
        sampleRate_ = std::max(8000.0, sampleRate);
        f1_.setSampleRate(sampleRate_);
        f2_.setSampleRate(sampleRate_);
        f3_.setSampleRate(sampleRate_);
        reset();
    }

    void reset() noexcept {
        phase_ = 0.0;
        vibratoPhase_ = 0.0;
        f1_.reset();
        f2_.reset();
        f3_.reset();
    }

    void setVowel(VowelType vowel) noexcept {
        vowel_ = vowel;
    }

    void setPitchHz(float pitchHz) noexcept {
        targetPitchHz_ = std::clamp(pitchHz, 55.0f, 1400.0f);
    }

    void setVibrato(float rateHz, float depthSemitones) noexcept {
        vibratoRateHz_ = std::clamp(rateHz, 0.5f, 12.0f);
        vibratoDepth_ = std::clamp(depthSemitones, 0.0f, 1.5f);
    }

    StereoFrame process(float gain = 0.7f) noexcept {
        // Smooth portamento glide toward target pitch
        currentPitchHz_ += 0.004f * (targetPitchHz_ - currentPitchHz_);

        constexpr double kTwoPi = 6.28318530717958647692;
        vibratoPhase_ += kTwoPi * vibratoRateHz_ / sampleRate_;
        if (vibratoPhase_ >= kTwoPi) vibratoPhase_ -= kTwoPi;

        const double vibSemis = static_cast<double>(vibratoDepth_) * std::sin(vibratoPhase_);
        const double instFreq = static_cast<double>(currentPitchHz_) * std::pow(2.0, vibSemis / 12.0);

        phase_ += instFreq / sampleRate_;
        if (phase_ >= 1.0) phase_ -= 1.0;

        // Glottal-like rich harmonic source (bandlimited sawtooth-pulse hybrid)
        const float glottal = static_cast<float>(2.0 * phase_ - 1.0) * 0.6f
                            + static_cast<float>(std::sin(kTwoPi * phase_)) * 0.4f;

        const FormantTarget t = targetFor(vowel_);
        f1_.configure(FilterMode::BandPass, t.f1, 6.5f);
        f2_.configure(FilterMode::BandPass, t.f2, 8.0f);
        f3_.configure(FilterMode::BandPass, t.f3, 10.0f);

        const StereoFrame in{glottal, glottal};
        const StereoFrame r1 = f1_.process(in);
        const StereoFrame r2 = f2_.process(in);
        const StereoFrame r3 = f3_.process(in);

        const float outL = (r1.left * 0.65f + r2.left * 0.45f + r3.left * 0.25f) * gain;
        const float outR = (r1.right * 0.65f + r2.right * 0.45f + r3.right * 0.25f) * gain;
        return {outL, outR};
    }

private:
    static constexpr FormantTarget targetFor(VowelType v) noexcept {
        switch (v) {
            case VowelType::A: return {730.0f, 1090.0f, 2440.0f};
            case VowelType::E: return {530.0f, 1840.0f, 2480.0f};
            case VowelType::I: return {310.0f, 2290.0f, 3010.0f};
            case VowelType::O: return {450.0f, 820.0f, 2650.0f};
            case VowelType::U: return {325.0f, 700.0f, 2530.0f};
        }
        return {730.0f, 1090.0f, 2440.0f};
    }

    double sampleRate_ = 48000.0;
    double phase_ = 0.0;
    double vibratoPhase_ = 0.0;
    float currentPitchHz_ = 261.63f;
    float targetPitchHz_ = 261.63f;
    float vibratoRateHz_ = 5.4f;
    float vibratoDepth_ = 0.18f;
    VowelType vowel_ = VowelType::A;

    BiquadFilter f1_;
    BiquadFilter f2_;
    BiquadFilter f3_;
};

} // namespace voxdsp::dsp
