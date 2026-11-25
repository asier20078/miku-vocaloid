#pragma once

#include <array>
#include <atomic>
#include <memory>
#include <string>
#include <vector>

#include "LockFreeQueue.hpp"
#include "Types.hpp"
#include "VoicePool.hpp"
#include "dsp/BiquadFilter.hpp"
#include "dsp/Dynamics.hpp"
#include "dsp/Reverb.hpp"
#include "dsp/StereoDelay.hpp"

namespace voxdsp {

class AudioEngine {
public:
    static constexpr size_t kMaxSampleSlots = 32;

    AudioEngine();

    // Must be called before starting the audio stream (allocates DSP buffers on main thread).
    void prepare(const AudioConfig& config);

    // Registers an already-loaded AudioBuffer into a slot (0..kMaxSampleSlots-1).
    // Safe to call from the main thread while audio is running.
    bool registerSample(uint32_t slotId, AudioBuffer buffer);

    // Convenience helper using WavLoader on the main thread.
    bool loadSampleFromWav(uint32_t slotId, const std::string& filePath, std::string* outError = nullptr);

    // Lock-free commands queued from the main/UI thread to the real-time audio thread.
    bool triggerVoice(const VoiceTriggerParams& params) noexcept;
    bool releaseAllVoices() noexcept;
    bool stopAllImmediate() noexcept;

    // Real-time audio callback entry point (zero allocations, zero locks).
    void processBlock(const float* inputBuffer, int inputChannels,
                      float* outputBuffer, int outputChannels,
                      unsigned long framesPerBuffer) noexcept;

    EngineParameters& parameters() noexcept { return params_; }
    const EngineParameters& parameters() const noexcept { return params_; }
    const EngineTelemetry& telemetry() const noexcept { return telemetry_; }
    const AudioConfig& config() const noexcept { return config_; }

private:
    void drainCommands() noexcept;

    AudioConfig config_{};
    EngineParameters params_{};
    EngineTelemetry telemetry_{};

    LockFreeQueue<EngineCommand, 128> commandQueue_;

    // Main-thread ownership of immutable AudioBuffers; audio thread reads atomic pointers.
    std::vector<std::unique_ptr<AudioBuffer>> ownedBuffers_;
    std::array<std::atomic<const AudioBuffer*>, kMaxSampleSlots> sampleSlots_{};

    VoicePool voicePool_;
    dsp::BiquadFilter highPassFilter_;
    dsp::BiquadFilter lowPassFilter_;
    dsp::StereoDelay stereoDelay_;
    dsp::Reverb reverb_;
};

} // namespace voxdsp
