#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include "Voice.hpp"

namespace voxdsp {

class VoicePool {
public:
    static constexpr size_t kMaxVoices = 32;

    void prepare(double sampleRate) noexcept {
        for (auto& voice : voices_) {
            voice.prepare(sampleRate);
        }
    }

    void trigger(const AudioBuffer* buffer, const VoiceTriggerParams& params,
                 float attackMs, float decayMs, float sustain, float releaseMs) noexcept {
        if (!buffer || buffer->empty()) return;

        const uint32_t layers = std::clamp<uint32_t>(params.unisonVoices, 1, 5);
        const float layerGainScale = 1.0f / std::sqrt(static_cast<float>(layers));

        for (uint32_t i = 0; i < layers; ++i) {
            Voice* slot = allocateVoice();
            VoiceTriggerParams layerParams = params;
            layerParams.gain *= layerGainScale;

            if (layers > 1) {
                // Normalized offset in [-1.0, +1.0]
                const float norm = (2.0f * static_cast<float>(i) / static_cast<float>(layers - 1)) - 1.0f;
                layerParams.pitchRatio = params.pitchRatio * (1.0f + norm * params.unisonDetune);
                layerParams.pan = std::clamp(params.pan + norm * params.unisonSpread, -1.0f, 1.0f);
            }

            slot->start(buffer, layerParams, attackMs, decayMs, sustain, releaseMs);
        }
    }

    void releaseAll() noexcept {
        for (auto& voice : voices_) {
            voice.release();
        }
    }

    void stopAllImmediate() noexcept {
        for (auto& voice : voices_) {
            voice.stopImmediate();
        }
    }

    void updateEnvelopes(float attackMs, float decayMs, float sustain, float releaseMs) noexcept {
        for (auto& voice : voices_) {
            if (voice.isActive()) {
                voice.updateEnvelope(attackMs, decayMs, sustain, releaseMs);
            }
        }
    }

    StereoFrame processFrame(uint32_t& outActiveCount) noexcept {
        StereoFrame mix{};
        uint32_t count = 0;
        for (auto& voice : voices_) {
            if (voice.isActive()) {
                mix += voice.process();
                ++count;
            }
        }
        outActiveCount = count;
        return mix;
    }

private:
    Voice* allocateVoice() noexcept {
        // 1. Prefer an idle voice
        for (auto& voice : voices_) {
            if (!voice.isActive()) {
                return &voice;
            }
        }
        // 2. Steal a releasing voice
        for (auto& voice : voices_) {
            if (voice.isReleasing()) {
                return &voice;
            }
        }
        // 3. Round-robin voice stealing
        Voice* stolen = &voices_[stealCursor_];
        stealCursor_ = (stealCursor_ + 1) % kMaxVoices;
        return stolen;
    }

    std::array<Voice, kMaxVoices> voices_{};
    size_t stealCursor_ = 0;
};

} // namespace voxdsp
