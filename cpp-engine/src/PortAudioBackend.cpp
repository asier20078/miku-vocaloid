#include "voxdsp/PortAudioBackend.hpp"

#include <cstring>

namespace voxdsp {

PortAudioBackend::PortAudioBackend(AudioEngine& engine) noexcept
    : engine_(engine) {}

PortAudioBackend::~PortAudioBackend() {
    stop();
    if (initialized_) {
        Pa_Terminate();
        initialized_ = false;
    }
}

std::vector<AudioDeviceInfo> PortAudioBackend::enumerateDevices() {
    std::vector<AudioDeviceInfo> result;
    const PaError initErr = Pa_Initialize();
    if (initErr != paNoError) {
        return result;
    }

    const int count = Pa_GetDeviceCount();
    for (int i = 0; i < count; ++i) {
        const PaDeviceInfo* info = Pa_GetDeviceInfo(i);
        if (!info) continue;
        result.push_back(AudioDeviceInfo{
            .index = i,
            .name = info->name ? info->name : "Unknown",
            .maxInputChannels = info->maxInputChannels,
            .maxOutputChannels = info->maxOutputChannels,
            .defaultSampleRate = info->defaultSampleRate
        });
    }

    Pa_Terminate();
    return result;
}

bool PortAudioBackend::start(const AudioConfig& config, int inputDeviceIndex, int outputDeviceIndex,
                             std::string* outError) {
    if (running_) {
        stop();
    }

    if (!initialized_) {
        const PaError err = Pa_Initialize();
        if (err != paNoError) {
            if (outError) *outError = Pa_GetErrorText(err);
            return false;
        }
        initialized_ = true;
    }

    activeConfig_ = config;
    engine_.prepare(activeConfig_);

    PaStreamParameters outputParams{};
    PaStreamParameters* outputPtr = nullptr;

    if (activeConfig_.outputChannels > 0) {
        const PaDeviceIndex outDev = (outputDeviceIndex >= 0)
            ? static_cast<PaDeviceIndex>(outputDeviceIndex)
            : Pa_GetDefaultOutputDevice();

        if (outDev == paNoDevice) {
            if (outError) *outError = "No se encontro ningun dispositivo de salida de audio.";
            return false;
        }

        const PaDeviceInfo* outInfo = Pa_GetDeviceInfo(outDev);
        outputParams.device = outDev;
        outputParams.channelCount = activeConfig_.outputChannels;
        outputParams.sampleFormat = paFloat32;
        outputParams.suggestedLatency = outInfo ? outInfo->defaultLowOutputLatency : 0.015;
        outputParams.hostApiSpecificStreamInfo = nullptr;
        outputPtr = &outputParams;
    }

    PaStreamParameters inputParams{};
    PaStreamParameters* inputPtr = nullptr;

    if (activeConfig_.inputChannels > 0) {
        const PaDeviceIndex inDev = (inputDeviceIndex >= 0)
            ? static_cast<PaDeviceIndex>(inputDeviceIndex)
            : Pa_GetDefaultInputDevice();

        if (inDev != paNoDevice) {
            const PaDeviceInfo* inInfo = Pa_GetDeviceInfo(inDev);
            inputParams.device = inDev;
            inputParams.channelCount = activeConfig_.inputChannels;
            inputParams.sampleFormat = paFloat32;
            inputParams.suggestedLatency = inInfo ? inInfo->defaultLowInputLatency : 0.015;
            inputParams.hostApiSpecificStreamInfo = nullptr;
            inputPtr = &inputParams;
        } else {
            activeConfig_.inputChannels = 0;
        }
    }

    const PaError openErr = Pa_OpenStream(
        &stream_,
        inputPtr,
        outputPtr,
        activeConfig_.sampleRate,
        activeConfig_.framesPerBuffer,
        paClipOff, // We apply our own Dynamics::process soft limiter
        &PortAudioBackend::paCallback,
        this
    );

    if (openErr != paNoError) {
        if (outError) *outError = Pa_GetErrorText(openErr);
        stream_ = nullptr;
        return false;
    }

    const PaError startErr = Pa_StartStream(stream_);
    if (startErr != paNoError) {
        if (outError) *outError = Pa_GetErrorText(startErr);
        Pa_CloseStream(stream_);
        stream_ = nullptr;
        return false;
    }

    running_ = true;
    return true;
}

void PortAudioBackend::stop() {
    if (stream_) {
        if (running_) {
            Pa_StopStream(stream_);
            running_ = false;
        }
        Pa_CloseStream(stream_);
        stream_ = nullptr;
    }
}

double PortAudioBackend::streamCpuLoad() const noexcept {
    if (!stream_ || !running_) return 0.0;
    return Pa_GetStreamCpuLoad(stream_);
}

int PortAudioBackend::paCallback(
    const void* inputBuffer,
    void* outputBuffer,
    unsigned long framesPerBuffer,
    const PaStreamCallbackTimeInfo* /*timeInfo*/,
    PaStreamCallbackFlags /*statusFlags*/,
    void* userData)
{
    auto* self = static_cast<PortAudioBackend*>(userData);
    const auto* in = static_cast<const float*>(inputBuffer);
    auto* out = static_cast<float*>(outputBuffer);

    self->engine_.processBlock(
        in,
        self->activeConfig_.inputChannels,
        out,
        self->activeConfig_.outputChannels,
        framesPerBuffer
    );

    return paContinue;
}

} // namespace voxdsp
