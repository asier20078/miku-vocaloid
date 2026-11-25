#pragma once

#include <algorithm>
#include <cstdint>

namespace voxdsp::dsp {

class AdsrEnvelope {
public:
    enum class Stage : uint8_t {
        Idle,
        Attack,
        Decay,
        Sustain,
        Release
    };

    void setSampleRate(double sampleRate) noexcept {
        sampleRate_ = std::max(8000.0, sampleRate);
        recalculateRates();
    }

    void setParameters(float attackMs, float decayMs, float sustainLevel, float releaseMs) noexcept {
        attackMs_ = std::max(0.5f, attackMs);
        decayMs_ = std::max(1.0f, decayMs);
        sustain_ = std::clamp(sustainLevel, 0.0f, 1.0f);
        releaseMs_ = std::max(1.0f, releaseMs);
        recalculateRates();
    }

    void noteOn() noexcept {
        stage_ = Stage::Attack;
    }

    void noteOff() noexcept {
        if (stage_ != Stage::Idle) {
            stage_ = Stage::Release;
        }
    }

    void reset() noexcept {
        stage_ = Stage::Idle;
        level_ = 0.0f;
    }

    [[nodiscard]] bool isActive() const noexcept {
        return stage_ != Stage::Idle;
    }

    [[nodiscard]] Stage stage() const noexcept {
        return stage_;
    }

    float process() noexcept {
        switch (stage_) {
            case Stage::Idle:
                return 0.0f;

            case Stage::Attack:
                level_ += attackStep_;
                if (level_ >= 1.0f) {
                    level_ = 1.0f;
                    stage_ = Stage::Decay;
                }
                return level_;

            case Stage::Decay:
                level_ -= decayStep_;
                if (level_ <= sustain_) {
                    level_ = sustain_;
                    stage_ = Stage::Sustain;
                }
                return level_;

            case Stage::Sustain:
                level_ = sustain_;
                return level_;

            case Stage::Release:
                level_ -= releaseStep_;
                if (level_ <= 0.0001f) {
                    level_ = 0.0f;
                    stage_ = Stage::Idle;
                }
                return level_;
        }
        return 0.0f;
    }

private:
    void recalculateRates() noexcept {
        const float sr = static_cast<float>(sampleRate_);
        attackStep_ = 1.0f / std::max(1.0f, (attackMs_ * 0.001f) * sr);
        decayStep_ = (1.0f - sustain_) / std::max(1.0f, (decayMs_ * 0.001f) * sr);
        releaseStep_ = std::max(0.05f, sustain_) / std::max(1.0f, (releaseMs_ * 0.001f) * sr);
    }

    double sampleRate_ = 48000.0;
    float attackMs_ = 8.0f;
    float decayMs_ = 60.0f;
    float sustain_ = 0.92f;
    float releaseMs_ = 180.0f;

    float attackStep_ = 0.002f;
    float decayStep_ = 0.0001f;
    float releaseStep_ = 0.0001f;

    float level_ = 0.0f;
    Stage stage_ = Stage::Idle;
};

} // namespace voxdsp::dsp
