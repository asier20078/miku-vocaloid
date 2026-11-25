#pragma once

#include <algorithm>
#include <cmath>
#include "../Types.hpp"

namespace voxdsp::dsp {

enum class FilterMode {
    LowPass,
    HighPass,
    BandPass
};

// Robert Bristow-Johnson (RBJ) stereo biquad IIR filter.
class BiquadFilter {
public:
    void setSampleRate(double sampleRate) noexcept {
        sampleRate_ = std::max(8000.0, sampleRate);
        updateCoefficients();
    }

    void configure(FilterMode mode, float cutoffHz, float q = 0.7071f) noexcept {
        const float clampedHz = std::clamp(cutoffHz, 20.0f, static_cast<float>(sampleRate_ * 0.45));
        const float clampedQ = std::clamp(q, 0.1f, 18.0f);

        if (mode_ == mode && std::abs(cutoffHz_ - clampedHz) < 0.05f && std::abs(q_ - clampedQ) < 0.001f) {
            return;
        }
        mode_ = mode;
        cutoffHz_ = clampedHz;
        q_ = clampedQ;
        updateCoefficients();
    }

    void reset() noexcept {
        z1L_ = z2L_ = 0.0f;
        z1R_ = z2R_ = 0.0f;
    }

    StereoFrame process(StereoFrame in) noexcept {
        // Direct Form II Transposed
        const float outL = b0_ * in.left + z1L_;
        z1L_ = b1_ * in.left - a1_ * outL + z2L_;
        z2L_ = b2_ * in.left - a2_ * outL;

        const float outR = b0_ * in.right + z1R_;
        z1R_ = b1_ * in.right - a1_ * outR + z2R_;
        z2R_ = b2_ * in.right - a2_ * outR;

        // Denormal flush
        if (std::abs(z1L_) < 1e-18f) z1L_ = 0.0f;
        if (std::abs(z2L_) < 1e-18f) z2L_ = 0.0f;
        if (std::abs(z1R_) < 1e-18f) z1R_ = 0.0f;
        if (std::abs(z2R_) < 1e-18f) z2R_ = 0.0f;

        return {outL, outR};
    }

private:
    void updateCoefficients() noexcept {
        constexpr double kPi = 3.14159265358979323846;
        const double omega = 2.0 * kPi * static_cast<double>(cutoffHz_) / sampleRate_;
        const double sinOmega = std::sin(omega);
        const double cosOmega = std::cos(omega);
        const double alpha = sinOmega / (2.0 * static_cast<double>(q_));

        double b0 = 1.0, b1 = 0.0, b2 = 0.0;
        double a0 = 1.0, a1 = 0.0, a2 = 0.0;

        switch (mode_) {
            case FilterMode::LowPass:
                b0 = (1.0 - cosOmega) * 0.5;
                b1 = 1.0 - cosOmega;
                b2 = (1.0 - cosOmega) * 0.5;
                a0 = 1.0 + alpha;
                a1 = -2.0 * cosOmega;
                a2 = 1.0 - alpha;
                break;

            case FilterMode::HighPass:
                b0 = (1.0 + cosOmega) * 0.5;
                b1 = -(1.0 + cosOmega);
                b2 = (1.0 + cosOmega) * 0.5;
                a0 = 1.0 + alpha;
                a1 = -2.0 * cosOmega;
                a2 = 1.0 - alpha;
                break;

            case FilterMode::BandPass:
                b0 = alpha;
                b1 = 0.0;
                b2 = -alpha;
                a0 = 1.0 + alpha;
                a1 = -2.0 * cosOmega;
                a2 = 1.0 - alpha;
                break;
        }

        const double invA0 = 1.0 / a0;
        b0_ = static_cast<float>(b0 * invA0);
        b1_ = static_cast<float>(b1 * invA0);
        b2_ = static_cast<float>(b2 * invA0);
        a1_ = static_cast<float>(a1 * invA0);
        a2_ = static_cast<float>(a2 * invA0);
    }

    double sampleRate_ = 48000.0;
    FilterMode mode_ = FilterMode::LowPass;
    float cutoffHz_ = 16000.0f;
    float q_ = 0.7071f;

    float b0_ = 1.0f, b1_ = 0.0f, b2_ = 0.0f;
    float a1_ = 0.0f, a2_ = 0.0f;
    float z1L_ = 0.0f, z2L_ = 0.0f;
    float z1R_ = 0.0f, z2R_ = 0.0f;
};

} // namespace voxdsp::dsp
