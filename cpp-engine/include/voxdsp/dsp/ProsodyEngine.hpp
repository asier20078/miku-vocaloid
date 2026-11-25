#pragma once

#include <algorithm>
#include <cmath>
#include "../g2p/GraphemeToPhoneme.hpp"

namespace voxdsp::dsp {

struct ProsodyParams {
    float vibratoRateHz = 5.5f;
    float vibratoDepthSemitones = 0.24f;
    float vibratoAmplitudeDepth = 0.06f; // Tremolo coupled with F0 vibrato
    float vibratoDelaySec = 0.12f;
    float stressPitchBoostSemitones = 0.65f;
    float baseBreathiness = 0.10f;
    float phraseEndBreathiness = 0.38f;
};

struct ProsodyFrame {
    float f0Hz = 261.63f;
    float amplitudeGain = 1.0f;
    float breathiness = 0.10f;
};

// Dynamic F0 contour, word-stress accentuation, punctuation inflection,
// dual FM+AM vibrato, and phrase-final breathiness module.
class ProsodyEngine {
public:
    static float midiToHz(float midi) noexcept {
        return 440.0f * std::pow(2.0f, (midi - 69.0f) / 12.0f);
    }

    static ProsodyFrame evaluateSyllableFrame(
        float targetMidi,
        float elapsedSec,
        float totalSec,
        bool isStressed,
        g2p::PunctuationTone punctuation,
        const ProsodyParams& params
    ) noexcept {
        const float progress = totalSec > 0.001f ? std::clamp(elapsedSec / totalSec, 0.0f, 1.0f) : 0.0f;
        float midi = targetMidi;

        // 1. Stress accentuation arch (subtle upward lift on stressed syllable)
        if (isStressed) {
            const float arch = std::sin(3.14159265f * progress);
            midi += params.stressPitchBoostSemitones * arch;
        }

        // 2. Attack pitch scoop (-0.35 st over initial 40ms)
        if (elapsedSec < 0.04f) {
            midi -= 0.35f * (1.0f - elapsedSec / 0.04f);
        }

        // 3. Punctuation inflection over final 35% of phrase-ending syllable
        if (progress > 0.65f) {
            const float tail = (progress - 0.65f) / 0.35f;
            const float curve = tail * tail;
            switch (punctuation) {
                case g2p::PunctuationTone::Question:
                    midi += 2.6f * curve; // Rising interrogative cadence
                    break;
                case g2p::PunctuationTone::Comma:
                    midi += 0.7f * curve; // Slight continuation lift
                    break;
                case g2p::PunctuationTone::Period:
                    midi -= 1.4f * curve; // Natural terminal fall
                    break;
                case g2p::PunctuationTone::Exclamation:
                    midi += (0.8f - 1.6f * tail) * tail; // Emphatic peak then drop
                    break;
                case g2p::PunctuationTone::None:
                    break;
            }
        }

        // 4. Delayed FM + AM Vibrato
        float amMod = 1.0f;
        if (elapsedSec > params.vibratoDelaySec && totalSec > 0.25f) {
            const float fade = std::min(1.0f, (elapsedSec - params.vibratoDelaySec) / 0.18f);
            const float vibOsc = std::sin(6.2831853f * params.vibratoRateHz * elapsedSec);
            midi += vibOsc * params.vibratoDepthSemitones * fade;
            amMod += vibOsc * params.vibratoAmplitudeDepth * fade;
        }

        // 5. Phrase-final aspirated breathiness on punctuation boundaries
        float breath = params.baseBreathiness;
        if (punctuation != g2p::PunctuationTone::None && progress > 0.65f) {
            const float tail = (progress - 0.65f) / 0.35f;
            breath += (params.phraseEndBreathiness - params.baseBreathiness) * tail;
        }

        const float stressAmp = isStressed ? 1.12f : 0.96f;
        return {
            midiToHz(midi),
            stressAmp * amMod,
            std::clamp(breath, 0.0f, 0.65f)
        };
    }
};

} // namespace voxdsp::dsp
