#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
#include "../Types.hpp"

namespace voxdsp::dsp {

// Freeverb-inspired stereo algorithmic reverb (8 parallel combs + 4 series all-pass per channel).
class Reverb {
public:
    void prepare(double sampleRate) {
        sampleRate_ = std::max(8000.0, sampleRate);
        const double scale = sampleRate_ / 44100.0;

        constexpr std::array<int, 8> kCombTunings = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
        constexpr std::array<int, 4> kAllpassTunings = {556, 441, 341, 225};
        constexpr int kStereoSpread = 23;

        for (size_t i = 0; i < 8; ++i) {
            const size_t lenL = std::max<size_t>(8, static_cast<size_t>(kCombTunings[i] * scale));
            const size_t lenR = std::max<size_t>(8, static_cast<size_t>((kCombTunings[i] + kStereoSpread) * scale));
            combsL_[i].init(lenL);
            combsR_[i].init(lenR);
        }

        for (size_t i = 0; i < 4; ++i) {
            const size_t lenL = std::max<size_t>(8, static_cast<size_t>(kAllpassTunings[i] * scale));
            const size_t lenR = std::max<size_t>(8, static_cast<size_t>((kAllpassTunings[i] + kStereoSpread) * scale));
            allpassL_[i].init(lenL);
            allpassR_[i].init(lenR);
        }
    }

    void setParameters(float roomSize, float damping, float mix) noexcept {
        roomSize_ = std::clamp(roomSize, 0.0f, 0.98f);
        damping_ = std::clamp(damping, 0.0f, 0.98f);
        mix_ = std::clamp(mix, 0.0f, 1.0f);
    }

    void reset() noexcept {
        for (auto& c : combsL_) c.clear();
        for (auto& c : combsR_) c.clear();
        for (auto& a : allpassL_) a.clear();
        for (auto& a : allpassR_) a.clear();
    }

    StereoFrame process(StereoFrame in) noexcept {
        if (mix_ <= 0.0001f) return in;

        const float monoIn = (in.left + in.right) * 0.015f;
        const float feedback = 0.28f + roomSize_ * 0.70f;
        const float damp = damping_ * 0.45f;

        float outL = 0.0f;
        float outR = 0.0f;

        for (size_t i = 0; i < 8; ++i) {
            outL += combsL_[i].process(monoIn, feedback, damp);
            outR += combsR_[i].process(monoIn, feedback, damp);
        }

        for (size_t i = 0; i < 4; ++i) {
            outL = allpassL_[i].process(outL);
            outR = allpassR_[i].process(outR);
        }

        const float dry = 1.0f - mix_ * 0.5f;
        return {
            in.left * dry + outL * mix_,
            in.right * dry + outR * mix_
        };
    }

private:
    struct CombFilter {
        std::vector<float> buffer;
        size_t index = 0;
        float filterStore = 0.0f;

        void init(size_t size) {
            buffer.assign(size, 0.0f);
            index = 0;
            filterStore = 0.0f;
        }

        void clear() noexcept {
            std::fill(buffer.begin(), buffer.end(), 0.0f);
            index = 0;
            filterStore = 0.0f;
        }

        float process(float input, float feedback, float damp) noexcept {
            if (buffer.empty()) return 0.0f;
            const float output = buffer[index];
            filterStore = (output * (1.0f - damp)) + (filterStore * damp);
            if (std::abs(filterStore) < 1e-18f) filterStore = 0.0f;
            buffer[index] = input + (filterStore * feedback);
            if (++index >= buffer.size()) index = 0;
            return output;
        }
    };

    struct AllpassFilter {
        std::vector<float> buffer;
        size_t index = 0;

        void init(size_t size) {
            buffer.assign(size, 0.0f);
            index = 0;
        }

        void clear() noexcept {
            std::fill(buffer.begin(), buffer.end(), 0.0f);
            index = 0;
        }

        float process(float input) noexcept {
            if (buffer.empty()) return input;
            const float bufOut = buffer[index];
            const float output = -input + bufOut;
            buffer[index] = input + (bufOut * 0.5f);
            if (++index >= buffer.size()) index = 0;
            return output;
        }
    };

    double sampleRate_ = 48000.0;
    float roomSize_ = 0.62f;
    float damping_ = 0.45f;
    float mix_ = 0.20f;

    std::array<CombFilter, 8> combsL_;
    std::array<CombFilter, 8> combsR_;
    std::array<AllpassFilter, 4> allpassL_;
    std::array<AllpassFilter, 4> allpassR_;
};

} // namespace voxdsp::dsp
