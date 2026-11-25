#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include "../Types.hpp"
#include "../g2p/GraphemeToPhoneme.hpp"
#include "Coarticulation.hpp"

namespace voxdsp::dsp {

// Complete physical vocal tract synthesizer:
// - Rosenberg glottal pulse + micro jitter/shimmer
// - 3-pole Paul Kellet pink noise + bandpass fricative/burst shaper
// - Parallel 3-formant resonators (F1, F2, F3)
// - Nasal antiresonance notch filter (zeros)
// - Plosive occlusion silence/voice-bar + explosive burst + trill (rr) AM
class VocalTractSynth {
public:
    void prepare(double sampleRate) noexcept {
        sampleRate_ = std::max(8000.0, sampleRate);
        reset();
    }

    void reset() noexcept {
        glottalPhase_ = 0.0;
        trillPhase_ = 0.0;
        rngState_ = 0x12345678u;
        pinkB0_ = pinkB1_ = pinkB2_ = 0.0f;
        f1_.reset();
        f2_.reset();
        f3_.reset();
        fricativeBp_.reset();
        nasalNotch_.reset();
    }

    // Processes one sample given current F0, coarticulated tract target, and articulation envelope.
    // plosivePhaseGain: 0.0 during voiceless occlusion, 0.12 during voiced closure, 1.0 during release/vowel.
    StereoFrame processSample(
        float f0Hz,
        const VocalTractTarget& target,
        float breathiness,
        float plosivePhaseGain,
        float formantShift = 1.0f
    ) noexcept {
        const double sr = sampleRate_;
        const float safeF0 = std::clamp(f0Hz, 55.0f, 1200.0f);

        // Micro-jitter (~0.4%) for natural human vocal fold irregularity
        const float white = nextWhiteNoise();
        const float pink = nextPinkNoise(white);
        const float jitter = 1.0f + white * 0.0035f;

        glottalPhase_ += (static_cast<double>(safeF0) * jitter) / sr;
        if (glottalPhase_ >= 1.0) glottalPhase_ -= 1.0;

        // Rosenberg glottal pulse (smooth opening + sharper closing -> warm harmonic tilt)
        const float glottal = rosenbergPulse(static_cast<float>(glottalPhase_), 0.62f, 0.24f);

        // Rolled 'rr' trill modulation (~26 Hz tongue tip vibration)
        float trillEnv = 1.0f;
        if (target.trillRateHz > 1.0f) {
            trillPhase_ += static_cast<double>(target.trillRateHz) / sr;
            if (trillPhase_ >= 1.0) trillPhase_ -= 1.0;
            const float osc = 0.5f + 0.5f * std::cos(6.2831853f * static_cast<float>(trillPhase_));
            trillEnv = 0.22f + 0.78f * osc;
        }

        // Glottal source mixed with aspirated breathiness
        const float breathSignal = pink * std::clamp(breathiness, 0.0f, 0.6f) * 0.45f;
        const float voicedExcitation = (glottal * target.voiceMix + breathSignal) * trillEnv * plosivePhaseGain;

        // Parallel 3-formant vocal tract bank
        const float s1 = f1_.processBandpass(voicedExcitation, target.f1 * formantShift, target.f1 / std::max(30.f, target.bw1), sr);
        const float s2 = f2_.processBandpass(voicedExcitation, target.f2 * formantShift, target.f2 / std::max(40.f, target.bw2), sr);
        const float s3 = f3_.processBandpass(voicedExcitation, target.f3 * formantShift, target.f3 / std::max(50.f, target.bw3), sr);

        float vocalOut = s1 * 0.68f + s2 * 0.50f + s3 * 0.26f;

        // Nasal antiresonance zero (notch filter)
        if (target.nasalMix > 0.01f && target.antiResonanceHz > 100.0f) {
            const float notched = nasalNotch_.processNotch(vocalOut, target.antiResonanceHz, 3.2f, sr);
            vocalOut = vocalOut * (1.0f - target.nasalMix) + notched * target.nasalMix;
        }

        // Fricative / affricate / plosive-burst noise path
        float consonantNoise = 0.0f;
        if (target.noiseMix > 0.005f) {
            const float shaped = fricativeBp_.processBandpass(
                pink * 0.7f + white * 0.3f,
                target.noiseCenterHz,
                target.noiseQ,
                sr
            );
            consonantNoise = shaped * target.noiseMix * 0.85f;
        }

        const float mono = vocalOut + consonantNoise;
        return {mono, mono};
    }

private:
    struct MonoBiquad {
        float b0 = 1.f, b1 = 0.f, b2 = 0.f, a1 = 0.f, a2 = 0.f;
        float z1 = 0.f, z2 = 0.f;
        float lastFreq = -1.f, lastQ = -1.f;

        void reset() noexcept { z1 = z2 = 0.f; lastFreq = lastQ = -1.f; }

        float processBandpass(float x, float freqHz, float q, double sr) noexcept {
            const float cf = std::clamp(freqHz, 40.0f, static_cast<float>(sr * 0.44));
            const float cq = std::clamp(q, 0.4f, 20.0f);
            if (std::abs(cf - lastFreq) > 0.5f || std::abs(cq - lastQ) > 0.02f) {
                const double w = 6.28318530717958647692 * cf / sr;
                const double alpha = std::sin(w) / (2.0 * cq);
                const double cosw = std::cos(w);
                const double invA0 = 1.0 / (1.0 + alpha);
                b0 = static_cast<float>(alpha * invA0);
                b1 = 0.0f;
                b2 = static_cast<float>(-alpha * invA0);
                a1 = static_cast<float>(-2.0 * cosw * invA0);
                a2 = static_cast<float>((1.0 - alpha) * invA0);
                lastFreq = cf;
                lastQ = cq;
            }
            const float y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            if (std::abs(z1) < 1e-18f) z1 = 0.f;
            if (std::abs(z2) < 1e-18f) z2 = 0.f;
            return y;
        }

        float processNotch(float x, float freqHz, float q, double sr) noexcept {
            const float cf = std::clamp(freqHz, 60.0f, static_cast<float>(sr * 0.44));
            const float cq = std::clamp(q, 0.5f, 12.0f);
            if (std::abs(cf - lastFreq) > 0.5f || std::abs(cq - lastQ) > 0.02f) {
                const double w = 6.28318530717958647692 * cf / sr;
                const double alpha = std::sin(w) / (2.0 * cq);
                const double cosw = std::cos(w);
                const double invA0 = 1.0 / (1.0 + alpha);
                b0 = static_cast<float>(1.0 * invA0);
                b1 = static_cast<float>(-2.0 * cosw * invA0);
                b2 = static_cast<float>(1.0 * invA0);
                a1 = b1;
                a2 = static_cast<float>((1.0 - alpha) * invA0);
                lastFreq = cf;
                lastQ = cq;
            }
            const float y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            if (std::abs(z1) < 1e-18f) z1 = 0.f;
            if (std::abs(z2) < 1e-18f) z2 = 0.f;
            return y;
        }
    };

    static float rosenbergPulse(float phase, float openQuotient, float closingQuotient) noexcept {
        if (phase < openQuotient) {
            return 0.5f * (1.0f - std::cos(3.14159265f * phase / openQuotient)) - 0.35f;
        }
        const float closeEnd = openQuotient + closingQuotient;
        if (phase < closeEnd) {
            return std::cos(1.5707963f * (phase - openQuotient) / closingQuotient) - 0.35f;
        }
        return -0.35f;
    }

    float nextWhiteNoise() noexcept {
        rngState_ = rngState_ * 1664525u + 1013904223u;
        return (static_cast<float>(rngState_ >> 8) / 8388608.0f) - 1.0f;
    }

    float nextPinkNoise(float white) noexcept {
        pinkB0_ = 0.99765f * pinkB0_ + white * 0.0990460f;
        pinkB1_ = 0.96300f * pinkB1_ + white * 0.2965164f;
        pinkB2_ = 0.57000f * pinkB2_ + white * 1.0526913f;
        return (pinkB0_ + pinkB1_ + pinkB2_ + white * 0.1848f) * 0.22f;
    }

    double sampleRate_ = 48000.0;
    double glottalPhase_ = 0.0;
    double trillPhase_ = 0.0;
    uint32_t rngState_ = 0x12345678u;
    float pinkB0_ = 0.0f, pinkB1_ = 0.0f, pinkB2_ = 0.0f;

    MonoBiquad f1_;
    MonoBiquad f2_;
    MonoBiquad f3_;
    MonoBiquad fricativeBp_;
    MonoBiquad nasalNotch_;
};

} // namespace voxdsp::dsp
