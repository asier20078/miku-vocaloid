#pragma once

#include <algorithm>
#include "../g2p/GraphemeToPhoneme.hpp"

namespace voxdsp::dsp {

struct VocalTractTarget {
    float f1 = 730.0f;
    float f2 = 1090.0f;
    float f3 = 2440.0f;
    float bw1 = 80.0f;
    float bw2 = 110.0f;
    float bw3 = 160.0f;
    float antiResonanceHz = 0.0f;
    float nasalMix = 0.0f;
    float noiseMix = 0.0f;
    float noiseCenterHz = 3500.0f;
    float noiseQ = 2.0f;
    float voiceMix = 1.0f;
    float trillRateHz = 0.0f;
};

// Nonlinear S-curve (cubic Hermite smoothstep) coarticulation engine
// smoothly moving the virtual vocal tract over 20-40ms phoneme transitions.
class CoarticulationEngine {
public:
    static VocalTractTarget targetFromPhoneme(const g2p::PhonemeSpec& p) noexcept {
        VocalTractTarget t;
        t.f1 = p.f1;
        t.f2 = p.f2;
        t.f3 = p.f3;
        t.bw1 = p.bw1;
        t.bw2 = p.bw2;
        t.bw3 = p.bw3;
        t.antiResonanceHz = p.antiResonanceHz;
        t.nasalMix = (p.manner == g2p::PhonemeManner::Nasal) ? 1.0f : 0.0f;
        t.noiseCenterHz = p.noiseCenterHz > 0.0f ? p.noiseCenterHz : 3500.0f;
        t.noiseQ = p.noiseQ;
        t.trillRateHz = p.trillRateHz;

        switch (p.manner) {
            case g2p::PhonemeManner::Vowel:
            case g2p::PhonemeManner::Liquid:
            case g2p::PhonemeManner::Trill:
            case g2p::PhonemeManner::Nasal:
                t.voiceMix = 1.0f;
                t.noiseMix = 0.0f;
                break;
            case g2p::PhonemeManner::Fricative:
                t.voiceMix = p.voiced ? 0.55f : 0.0f;
                t.noiseMix = p.voiced ? 0.65f : 1.0f;
                break;
            case g2p::PhonemeManner::Plosive:
            case g2p::PhonemeManner::Affricate:
                t.voiceMix = p.voiced ? 0.45f : 0.0f;
                t.noiseMix = 0.90f;
                break;
            case g2p::PhonemeManner::Silence:
                t.voiceMix = 0.0f;
                t.noiseMix = 0.0f;
                break;
        }
        return t;
    }

    static float smoothstep(float t) noexcept {
        const float c = std::clamp(t, 0.0f, 1.0f);
        return c * c * (3.0f - 2.0f * c);
    }

    static VocalTractTarget interpolate(
        const VocalTractTarget& a,
        const VocalTractTarget& b,
        float linearProgress
    ) noexcept {
        const float u = smoothstep(linearProgress);
        auto lerp = [u](float x, float y) noexcept { return x + u * (y - x); };

        VocalTractTarget out;
        out.f1 = lerp(a.f1, b.f1);
        out.f2 = lerp(a.f2, b.f2);
        out.f3 = lerp(a.f3, b.f3);
        out.bw1 = lerp(a.bw1, b.bw1);
        out.bw2 = lerp(a.bw2, b.bw2);
        out.bw3 = lerp(a.bw3, b.bw3);
        out.antiResonanceHz = (a.antiResonanceHz > 0.f && b.antiResonanceHz > 0.f)
            ? lerp(a.antiResonanceHz, b.antiResonanceHz)
            : (b.antiResonanceHz > 0.f ? b.antiResonanceHz : a.antiResonanceHz);
        out.nasalMix = lerp(a.nasalMix, b.nasalMix);
        out.noiseMix = lerp(a.noiseMix, b.noiseMix);
        out.noiseCenterHz = lerp(a.noiseCenterHz, b.noiseCenterHz);
        out.noiseQ = lerp(a.noiseQ, b.noiseQ);
        out.voiceMix = lerp(a.voiceMix, b.voiceMix);
        out.trillRateHz = (u < 0.5f) ? a.trillRateHz : b.trillRateHz;
        return out;
    }
};

} // namespace voxdsp::dsp
