#pragma once

#include <algorithm>
#include <cmath>
#include "../Types.hpp"

namespace voxdsp::dsp {

// Soft saturator and brickwall safety limiter for the master output bus.
class Dynamics {
public:
    static StereoFrame process(StereoFrame in, float drive, float masterGain) noexcept {
        const float safeDrive = std::clamp(drive, 1.0f, 6.0f);
        const float safeGain = std::clamp(masterGain, 0.0f, 2.0f);

        auto shape = [safeDrive, safeGain](float x) noexcept -> float {
            if (!std::isfinite(x)) return 0.0f;
            float driven = x * safeGain;
            if (safeDrive > 1.001f) {
                driven = std::tanh(driven * safeDrive) / std::tanh(safeDrive);
            } else {
                driven = std::tanh(driven);
            }
            return std::clamp(driven, -0.98f, 0.98f);
        };

        return {shape(in.left), shape(in.right)};
    }
};

} // namespace voxdsp::dsp
