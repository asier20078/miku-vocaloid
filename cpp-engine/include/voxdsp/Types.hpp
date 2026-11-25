#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace voxdsp {

struct AudioConfig {
    double sampleRate = 48000.0;
    unsigned long framesPerBuffer = 256;
    int inputChannels = 0;
    int outputChannels = 2;
};

struct StereoFrame {
    float left = 0.0f;
    float right = 0.0f;

    StereoFrame& operator+=(const StereoFrame& other) noexcept {
        left += other.left;
        right += other.right;
        return *this;
    }
};

struct AudioBuffer {
    std::vector<float> samples; // Interleaved if channels == 2, mono if channels == 1
    uint32_t channels = 1;
    uint32_t sampleRate = 48000;

    [[nodiscard]] size_t frameCount() const noexcept {
        return channels == 0 ? 0 : samples.size() / channels;
    }

    [[nodiscard]] bool empty() const noexcept {
        return samples.empty() || channels == 0;
    }
};

struct VoiceTriggerParams {
    uint32_t sampleId = 0;
    float gain = 0.85f;
    float pitchRatio = 1.0f;      // 1.0 = original pitch/speed, 2.0 = +1 octave, 0.5 = -1 octave
    float pan = 0.0f;             // -1.0 (left) .. 0.0 (center) .. +1.0 (right)
    bool loop = false;
    uint32_t unisonVoices = 1;    // 1..5 layers for rich vocal doubling
    float unisonDetune = 0.012f;  // Pitch spread across unison layers
    float unisonSpread = 0.65f;   // Stereo width of unison layers
};

struct EngineParameters {
    std::atomic<float> masterGain{0.85f};
    std::atomic<float> drive{1.15f};
    std::atomic<float> highPassHz{85.0f};
    std::atomic<float> lowPassHz{16000.0f};

    std::atomic<float> delayTimeMs{280.0f};
    std::atomic<float> delayFeedback{0.32f};
    std::atomic<float> delayMix{0.18f};

    std::atomic<float> reverbRoomSize{0.62f};
    std::atomic<float> reverbDamping{0.45f};
    std::atomic<float> reverbMix{0.20f};

    std::atomic<float> liveInputGain{0.0f};

    std::atomic<float> attackMs{8.0f};
    std::atomic<float> decayMs{60.0f};
    std::atomic<float> sustainLevel{0.92f};
    std::atomic<float> releaseMs{180.0f};
};

struct EngineTelemetry {
    std::atomic<float> peakLeft{0.0f};
    std::atomic<float> peakRight{0.0f};
    std::atomic<uint32_t> activeVoices{0};
    std::atomic<uint64_t> processedFrames{0};
};

} // namespace voxdsp
