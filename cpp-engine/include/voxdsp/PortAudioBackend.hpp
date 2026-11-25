#pragma once

#include <portaudio.h>
#include <string>
#include <vector>
#include "AudioEngine.hpp"
#include "Types.hpp"

namespace voxdsp {

struct AudioDeviceInfo {
    int index = -1;
    std::string name;
    int maxInputChannels = 0;
    int maxOutputChannels = 0;
    double defaultSampleRate = 48000.0;
};

class PortAudioBackend {
public:
    explicit PortAudioBackend(AudioEngine& engine) noexcept;
    ~PortAudioBackend();

    PortAudioBackend(const PortAudioBackend&) = delete;
    PortAudioBackend& operator=(const PortAudioBackend&) = delete;

    static std::vector<AudioDeviceInfo> enumerateDevices();

    bool start(const AudioConfig& config, int inputDeviceIndex = -1, int outputDeviceIndex = -1,
               std::string* outError = nullptr);
    void stop();

    [[nodiscard]] bool isRunning() const noexcept { return running_; }
    [[nodiscard]] double streamCpuLoad() const noexcept;

private:
    static int paCallback(
        const void* inputBuffer,
        void* outputBuffer,
        unsigned long framesPerBuffer,
        const PaStreamCallbackTimeInfo* timeInfo,
        PaStreamCallbackFlags statusFlags,
        void* userData
    );

    AudioEngine& engine_;
    AudioConfig activeConfig_{};
    PaStream* stream_ = nullptr;
    bool initialized_ = false;
    bool running_ = false;
};

} // namespace voxdsp
