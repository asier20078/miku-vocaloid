#pragma once

#include <string>
#include "Types.hpp"

namespace voxdsp {

class WavLoader {
public:
    // Loads a WAV file (PCM 8/16/24/32-bit or IEEE float) into normalized [-1, 1] floats.
    // Optionally resamples to targetSampleRate if > 0.
    static bool loadFromFile(
        const std::string& filePath,
        AudioBuffer& outBuffer,
        uint32_t targetSampleRate = 0,
        std::string* outError = nullptr
    );

    // Resamples an AudioBuffer to targetSampleRate using linear interpolation.
    static AudioBuffer resample(const AudioBuffer& input, uint32_t targetSampleRate);

    // Peak-normalizes a buffer in-place so the loudest sample hits targetPeak (e.g. 0.92f).
    static void normalize(AudioBuffer& buffer, float targetPeak = 0.92f) noexcept;
};

} // namespace voxdsp
