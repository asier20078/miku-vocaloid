#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include "Types.hpp"

namespace voxdsp {

// Single-Producer Single-Consumer lock-free ring buffer.
// Safe for communication between the main/UI thread and the real-time audio callback.
template <typename T, size_t Capacity>
class LockFreeQueue {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two");
    static_assert(Capacity >= 2, "Capacity must be at least 2");

public:
    bool push(const T& item) noexcept {
        const size_t head = head_.load(std::memory_order_relaxed);
        const size_t next = (head + 1) & (Capacity - 1);
        if (next == tail_.load(std::memory_order_acquire)) {
            return false; // Queue full
        }
        buffer_[head] = item;
        head_.store(next, std::memory_order_release);
        return true;
    }

    bool pop(T& outItem) noexcept {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        if (tail == head_.load(std::memory_order_acquire)) {
            return false; // Queue empty
        }
        outItem = buffer_[tail];
        tail_.store((tail + 1) & (Capacity - 1), std::memory_order_release);
        return true;
    }

    void clear() noexcept {
        tail_.store(head_.load(std::memory_order_acquire), std::memory_order_release);
    }

private:
    alignas(64) std::atomic<size_t> head_{0};
    alignas(64) std::atomic<size_t> tail_{0};
    std::array<T, Capacity> buffer_{};
};

enum class CommandType : uint8_t {
    TriggerVoice,
    ReleaseAll,
    StopAllImmediate
};

struct EngineCommand {
    CommandType type = CommandType::TriggerVoice;
    VoiceTriggerParams trigger{};
};

} // namespace voxdsp
