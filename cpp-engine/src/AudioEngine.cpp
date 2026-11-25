#include "voxdsp/AudioEngine.hpp"
#include "voxdsp/WavLoader.hpp"

#include <algorithm>
#include <cmath>

namespace voxdsp {

AudioEngine::AudioEngine() {
    for (auto& slot : sampleSlots_) {
        slot.store(nullptr, std::memory_order_relaxed);
    }
}

void AudioEngine::prepare(const AudioConfig& config) {
    config_ = config;
    const double sr = std::max(8000.0, config.sampleRate);

    voicePool_.prepare(sr);
    highPassFilter_.setSampleRate(sr);
    lowPassFilter_.setSampleRate(sr);
    highPassFilter_.reset();
    lowPassFilter_.reset();

    stereoDelay_.prepare(sr, 2000.0f);
    reverb_.prepare(sr);

    telemetry_.peakLeft.store(0.0f, std::memory_order_relaxed);
    telemetry_.peakRight.store(0.0f, std::memory_order_relaxed);
    telemetry_.activeVoices.store(0, std::memory_order_relaxed);
    telemetry_.processedFrames.store(0, std::memory_order_relaxed);
}

bool AudioEngine::registerSample(uint32_t slotId, AudioBuffer buffer) {
    if (slotId >= kMaxSampleSlots || buffer.empty()) {
        return false;
    }

    auto owned = std::make_unique<AudioBuffer>(std::move(buffer));
    const AudioBuffer* rawPtr = owned.get();
    ownedBuffers_.push_back(std::move(owned));
    sampleSlots_[slotId].store(rawPtr, std::memory_order_release);
    return true;
}

bool AudioEngine::loadSampleFromWav(uint32_t slotId, const std::string& filePath, std::string* outError) {
    if (slotId >= kMaxSampleSlots) {
        if (outError) *outError = "Slot de muestra fuera de rango (0-31).";
        return false;
    }

    AudioBuffer loaded;
    const uint32_t targetSr = static_cast<uint32_t>(std::llround(config_.sampleRate));
    if (!WavLoader::loadFromFile(filePath, loaded, targetSr, outError)) {
        return false;
    }
    WavLoader::normalize(loaded, 0.90f);
    return registerSample(slotId, std::move(loaded));
}

bool AudioEngine::triggerVoice(const VoiceTriggerParams& params) noexcept {
    EngineCommand cmd;
    cmd.type = CommandType::TriggerVoice;
    cmd.trigger = params;
    return commandQueue_.push(cmd);
}

bool AudioEngine::releaseAllVoices() noexcept {
    EngineCommand cmd;
    cmd.type = CommandType::ReleaseAll;
    return commandQueue_.push(cmd);
}

bool AudioEngine::stopAllImmediate() noexcept {
    EngineCommand cmd;
    cmd.type = CommandType::StopAllImmediate;
    return commandQueue_.push(cmd);
}

void AudioEngine::drainCommands() noexcept {
    const float attackMs = params_.attackMs.load(std::memory_order_relaxed);
    const float decayMs = params_.decayMs.load(std::memory_order_relaxed);
    const float sustain = params_.sustainLevel.load(std::memory_order_relaxed);
    const float releaseMs = params_.releaseMs.load(std::memory_order_relaxed);

    EngineCommand cmd;
    while (commandQueue_.pop(cmd)) {
        switch (cmd.type) {
            case CommandType::TriggerVoice: {
                const uint32_t id = cmd.trigger.sampleId;
                if (id < kMaxSampleSlots) {
                    const AudioBuffer* buf = sampleSlots_[id].load(std::memory_order_acquire);
                    if (buf != nullptr) {
                        voicePool_.trigger(buf, cmd.trigger, attackMs, decayMs, sustain, releaseMs);
                    }
                }
                break;
            }
            case CommandType::ReleaseAll:
                voicePool_.releaseAll();
                break;

            case CommandType::StopAllImmediate:
                voicePool_.stopAllImmediate();
                break;
        }
    }
}

void AudioEngine::processBlock(const float* inputBuffer, int inputChannels,
                               float* outputBuffer, int outputChannels,
                               unsigned long framesPerBuffer) noexcept {
    if (!outputBuffer || outputChannels <= 0 || framesPerBuffer == 0) {
        return;
    }

    drainCommands();

    const float masterGain = params_.masterGain.load(std::memory_order_relaxed);
    const float drive = params_.drive.load(std::memory_order_relaxed);
    const float hpfHz = params_.highPassHz.load(std::memory_order_relaxed);
    const float lpfHz = params_.lowPassHz.load(std::memory_order_relaxed);
    const float delayMs = params_.delayTimeMs.load(std::memory_order_relaxed);
    const float delayFb = params_.delayFeedback.load(std::memory_order_relaxed);
    const float delayMix = params_.delayMix.load(std::memory_order_relaxed);
    const float reverbRoom = params_.reverbRoomSize.load(std::memory_order_relaxed);
    const float reverbDamp = params_.reverbDamping.load(std::memory_order_relaxed);
    const float reverbMix = params_.reverbMix.load(std::memory_order_relaxed);
    const float liveGain = params_.liveInputGain.load(std::memory_order_relaxed);

    highPassFilter_.configure(dsp::FilterMode::HighPass, hpfHz, 0.7071f);
    lowPassFilter_.configure(dsp::FilterMode::LowPass, lpfHz, 0.7071f);
    stereoDelay_.setParameters(delayMs, delayFb, delayMix);
    reverb_.setParameters(reverbRoom, reverbDamp, reverbMix);

    float blockPeakL = 0.0f;
    float blockPeakR = 0.0f;
    uint32_t maxActive = 0;

    for (unsigned long i = 0; i < framesPerBuffer; ++i) {
        uint32_t activeCount = 0;
        StereoFrame frame = voicePool_.processFrame(activeCount);
        maxActive = std::max(maxActive, activeCount);

        // Optional live microphone input mixing
        if (inputBuffer && inputChannels > 0 && liveGain > 0.0001f) {
            const float inL = inputBuffer[i * static_cast<unsigned long>(inputChannels)];
            const float inR = (inputChannels > 1)
                ? inputBuffer[i * static_cast<unsigned long>(inputChannels) + 1]
                : inL;
            frame.left += inL * liveGain;
            frame.right += inR * liveGain;
        }

        // Master DSP chain: HPF -> LPF -> Stereo Delay -> Reverb -> Saturator/Limiter
        frame = highPassFilter_.process(frame);
        frame = lowPassFilter_.process(frame);
        frame = stereoDelay_.process(frame);
        frame = reverb_.process(frame);
        frame = dsp::Dynamics::process(frame, drive, masterGain);

        blockPeakL = std::max(blockPeakL, std::abs(frame.left));
        blockPeakR = std::max(blockPeakR, std::abs(frame.right));

        if (outputChannels == 1) {
            outputBuffer[i] = 0.5f * (frame.left + frame.right);
        } else {
            const unsigned long base = i * static_cast<unsigned long>(outputChannels);
            outputBuffer[base] = frame.left;
            outputBuffer[base + 1] = frame.right;
            for (int ch = 2; ch < outputChannels; ++ch) {
                outputBuffer[base + static_cast<unsigned long>(ch)] = 0.0f;
            }
        }
    }

    telemetry_.peakLeft.store(blockPeakL, std::memory_order_relaxed);
    telemetry_.peakRight.store(blockPeakR, std::memory_order_relaxed);
    telemetry_.activeVoices.store(maxActive, std::memory_order_relaxed);
    telemetry_.processedFrames.fetch_add(framesPerBuffer, std::memory_order_relaxed);
}

} // namespace voxdsp
