#pragma once

#include <algorithm>
#include <cmath>
#include "Types.hpp"
#include "dsp/AdsrEnvelope.hpp"

namespace voxdsp {

class Voice {
public:
    void prepare(double sampleRate) noexcept {
        sampleRate_ = std::max(8000.0, sampleRate);
        envelope_.setSampleRate(sampleRate_);
    }

    void start(const AudioBuffer* buffer, const VoiceTriggerParams& params,
               float attackMs, float decayMs, float sustain, float releaseMs) noexcept {
        if (!buffer || buffer->empty()) {
            active_ = false;
            return;
        }
        buffer_ = buffer;
        sampleId_ = params.sampleId;
        gain_ = std::clamp(params.gain, 0.0f, 2.0f);
        pitchRatio_ = std::clamp(params.pitchRatio, 0.25f, 4.0f);
        loop_ = params.loop;

        // Constant-power stereo pan law
        const float clampedPan = std::clamp(params.pan, -1.0f, 1.0f);
        const float angle = (clampedPan + 1.0f) * 0.25f * 3.14159265358979323846f;
        panL_ = std::cos(angle);
        panR_ = std::sin(angle);

        playhead_ = 0.0;
        envelope_.setParameters(attackMs, decayMs, sustain, releaseMs);
        envelope_.reset();
        envelope_.noteOn();
        active_ = true;
    }

    void release() noexcept {
        if (active_) {
            envelope_.noteOff();
        }
    }

    void stopImmediate() noexcept {
        active_ = false;
        buffer_ = nullptr;
        envelope_.reset();
    }

    void updateEnvelope(float attackMs, float decayMs, float sustain, float releaseMs) noexcept {
        envelope_.setParameters(attackMs, decayMs, sustain, releaseMs);
    }

    [[nodiscard]] bool isActive() const noexcept {
        return active_ && envelope_.isActive();
    }

    [[nodiscard]] bool isReleasing() const noexcept {
        return envelope_.stage() == dsp::AdsrEnvelope::Stage::Release;
    }

    StereoFrame process() noexcept {
        if (!active_ || !buffer_ || buffer_->empty()) {
            active_ = false;
            return {};
        }

        const size_t totalFrames = buffer_->frameCount();
        if (totalFrames == 0) {
            active_ = false;
            return {};
        }

        float sampleL = 0.0f;
        float sampleR = 0.0f;

        if (buffer_->channels == 1) {
            sampleL = sampleHermite(buffer_->samples.data(), totalFrames, 1, 0, playhead_);
            sampleR = sampleL;
        } else {
            sampleL = sampleHermite(buffer_->samples.data(), totalFrames, 2, 0, playhead_);
            sampleR = sampleHermite(buffer_->samples.data(), totalFrames, 2, 1, playhead_);
        }

        const float env = envelope_.process();
        if (!envelope_.isActive()) {
            active_ = false;
            return {};
        }

        // Advance playhead respecting sample rate ratio & pitch shift
        const double srScale = static_cast<double>(buffer_->sampleRate) / sampleRate_;
        playhead_ += static_cast<double>(pitchRatio_) * srScale;

        if (playhead_ >= static_cast<double>(totalFrames)) {
            if (loop_) {
                playhead_ = std::fmod(playhead_, static_cast<double>(totalFrames));
            } else {
                active_ = false;
            }
        }

        const float amp = env * gain_;
        return {
            sampleL * amp * panL_,
            sampleR * amp * panR_
        };
    }

private:
    // 4-point Catmull-Rom / Hermite cubic interpolation for smooth vocal pitch-shifting
    static float sampleHermite(const float* data, size_t totalFrames, uint32_t channels,
                               uint32_t channelOffset, double pos) noexcept {
        const size_t i1 = static_cast<size_t>(pos);
        if (i1 >= totalFrames) return 0.0f;

        const size_t i0 = (i1 > 0) ? (i1 - 1) : 0;
        const size_t i2 = std::min(i1 + 1, totalFrames - 1);
        const size_t i3 = std::min(i1 + 2, totalFrames - 1);

        const float y0 = data[i0 * channels + channelOffset];
        const float y1 = data[i1 * channels + channelOffset];
        const float y2 = data[i2 * channels + channelOffset];
        const float y3 = data[i3 * channels + channelOffset];

        const float t = static_cast<float>(pos - static_cast<double>(i1));
        const float c0 = y1;
        const float c1 = 0.5f * (y2 - y0);
        const float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
        const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);

        return ((c3 * t + c2) * t + c1) * t + c0;
    }

    double sampleRate_ = 48000.0;
    const AudioBuffer* buffer_ = nullptr;
    uint32_t sampleId_ = 0;
    double playhead_ = 0.0;
    float gain_ = 0.85f;
    float pitchRatio_ = 1.0f;
    float panL_ = 0.7071f;
    float panR_ = 0.7071f;
    bool loop_ = false;
    bool active_ = false;
    dsp::AdsrEnvelope envelope_;
};

} // namespace voxdsp
