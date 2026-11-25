#include "voxdsp/WavLoader.hpp"

#define DR_WAV_IMPLEMENTATION
#include "dr_wav.h"

#include <algorithm>
#include <cmath>

namespace voxdsp {

bool WavLoader::loadFromFile(
    const std::string& filePath,
    AudioBuffer& outBuffer,
    uint32_t targetSampleRate,
    std::string* outError)
{
    unsigned int channels = 0;
    unsigned int sampleRate = 0;
    drwav_uint64 totalFrameCount = 0;

    float* decoded = drwav_open_file_and_read_pcm_frames_f32(
        filePath.c_str(), &channels, &sampleRate, &totalFrameCount, nullptr
    );

    if (!decoded) {
        if (outError) {
            *outError = "No se pudo abrir o decodificar el archivo WAV: " + filePath;
        }
        return false;
    }

    if (totalFrameCount == 0 || channels == 0 || sampleRate == 0) {
        drwav_free(decoded, nullptr);
        if (outError) {
            *outError = "El archivo WAV esta vacio o tiene metadatos invalidos: " + filePath;
        }
        return false;
    }

    AudioBuffer raw;
    raw.sampleRate = sampleRate;

    if (channels <= 2) {
        raw.channels = channels;
        raw.samples.assign(decoded, decoded + (totalFrameCount * channels));
    } else {
        // Downmix multi-channel recordings (>2ch) cleanly to stereo
        raw.channels = 2;
        raw.samples.resize(static_cast<size_t>(totalFrameCount) * 2);
        for (drwav_uint64 f = 0; f < totalFrameCount; ++f) {
            raw.samples[f * 2] = decoded[f * channels];
            raw.samples[f * 2 + 1] = decoded[f * channels + 1];
        }
    }

    drwav_free(decoded, nullptr);

    if (targetSampleRate > 0 && targetSampleRate != raw.sampleRate) {
        outBuffer = resample(raw, targetSampleRate);
    } else {
        outBuffer = std::move(raw);
    }

    return true;
}

AudioBuffer WavLoader::resample(const AudioBuffer& input, uint32_t targetSampleRate) {
    if (input.empty() || targetSampleRate == 0 || input.sampleRate == targetSampleRate) {
        return input;
    }

    const size_t inFrames = input.frameCount();
    const double ratio = static_cast<double>(targetSampleRate) / static_cast<double>(input.sampleRate);
    const size_t outFrames = std::max<size_t>(1, static_cast<size_t>(std::llround(inFrames * ratio)));

    AudioBuffer output;
    output.channels = input.channels;
    output.sampleRate = targetSampleRate;
    output.samples.resize(outFrames * input.channels);

    for (size_t i = 0; i < outFrames; ++i) {
        const double srcPos = static_cast<double>(i) / ratio;
        const size_t i0 = std::min(static_cast<size_t>(srcPos), inFrames - 1);
        const size_t i1 = std::min(i0 + 1, inFrames - 1);
        const float frac = static_cast<float>(srcPos - static_cast<double>(i0));

        for (uint32_t ch = 0; ch < input.channels; ++ch) {
            const float s0 = input.samples[i0 * input.channels + ch];
            const float s1 = input.samples[i1 * input.channels + ch];
            output.samples[i * input.channels + ch] = s0 + frac * (s1 - s0);
        }
    }

    return output;
}

void WavLoader::normalize(AudioBuffer& buffer, float targetPeak) noexcept {
    if (buffer.empty()) return;

    float maxAbs = 0.0f;
    for (float s : buffer.samples) {
        maxAbs = std::max(maxAbs, std::abs(s));
    }

    if (maxAbs <= 1e-6f) return;

    const float scale = std::clamp(targetPeak, 0.05f, 1.0f) / maxAbs;
    for (float& s : buffer.samples) {
        s *= scale;
    }
}

} // namespace voxdsp
