#pragma once

#include <algorithm>
#include <cmath>
#include <vector>
#include "../Types.hpp"

namespace voxdsp::dsp {

// Stereo ping-pong delay with damped feedback and zero real-time allocations.
class StereoDelay {
public:
    void prepare(double sampleRate, float maxDelayMs = 2000.0f) {
        sampleRate_ = std::max(8000.0, sampleRate);
        const size_t maxSamples = static_cast<size_t>((maxDelayMs * 0.001f) * sampleRate_) + 8;
        bufferL_.assign(maxSamples, 0.0f);
        bufferR_.assign(maxSamples, 0.0f);
        writeIndex_ = 0;
        dampL_ = dampR_ = 0.0f;
        hasProcessed_ = false;
        currentDelaySamples_ = std::clamp(
            static_cast<float>((delayTimeMs_ * 0.001f) * sampleRate_),
            1.0f,
            static_cast<float>(maxSamples - 2)
        );
    }

    void setParameters(float delayMs, float feedback, float mix) noexcept {
        delayTimeMs_ = std::clamp(delayMs, 10.0f, 1900.0f);
        feedback_ = std::clamp(feedback, 0.0f, 0.90f);
        mix_ = std::clamp(mix, 0.0f, 1.0f);
    }

    void reset() noexcept {
        std::fill(bufferL_.begin(), bufferL_.end(), 0.0f);
        std::fill(bufferR_.begin(), bufferR_.end(), 0.0f);
        writeIndex_ = 0;
        dampL_ = dampR_ = 0.0f;
        hasProcessed_ = false;
    }

    StereoFrame process(StereoFrame in) noexcept {
        if (bufferL_.empty()) return in;

        const float targetSamples = std::clamp(
            static_cast<float>((delayTimeMs_ * 0.001f) * sampleRate_),
            1.0f,
            static_cast<float>(bufferL_.size() - 2)
        );
        if (!hasProcessed_) {
            currentDelaySamples_ = targetSamples;
            hasProcessed_ = true;
        } else {
            // Smooth live delay time changes to avoid zipper noise
            currentDelaySamples_ += 0.002f * (targetSamples - currentDelaySamples_);
        }

        const float delayedL = readInterpolated(bufferL_, currentDelaySamples_);
        const float delayedR = readInterpolated(bufferR_, currentDelaySamples_ * 0.75f);

        // Warm low-pass damping inside feedback loop
        constexpr float kFeedbackDamp = 0.45f;
        dampL_ += kFeedbackDamp * (delayedL - dampL_);
        dampR_ += kFeedbackDamp * (delayedR - dampR_);

        // Ping-pong cross feedback
        bufferL_[writeIndex_] = in.left + dampR_ * feedback_;
        bufferR_[writeIndex_] = in.right + dampL_ * feedback_;

        writeIndex_ = (writeIndex_ + 1) % bufferL_.size();

        return {
            in.left * (1.0f - mix_) + delayedL * mix_,
            in.right * (1.0f - mix_) + delayedR * mix_
        };
    }

private:
    [[nodiscard]] float readInterpolated(const std::vector<float>& buf, float delaySamples) const noexcept {
        const size_t size = buf.size();
        float readPos = static_cast<float>(writeIndex_) - delaySamples;
        while (readPos < 0.0f) {
            readPos += static_cast<float>(size);
        }
        const size_t i0 = static_cast<size_t>(readPos) % size;
        const size_t i1 = (i0 + 1) % size;
        const float frac = readPos - std::floor(readPos);
        return buf[i0] + frac * (buf[i1] - buf[i0]);
    }

    double sampleRate_ = 48000.0;
    float delayTimeMs_ = 280.0f;
    float feedback_ = 0.32f;
    float mix_ = 0.18f;
    float currentDelaySamples_ = 13440.0f;

    std::vector<float> bufferL_;
    std::vector<float> bufferR_;
    size_t writeIndex_ = 0;
    float dampL_ = 0.0f;
    float dampR_ = 0.0f;
    bool hasProcessed_ = false;
};

} // namespace voxdsp::dsp
