/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <net/Socket.hpp>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include <sys/types.h>

/// Samples the call stacks of one kit at a time and hands the counts to whoever asked for them.
///
/// The sampling runs on this poll's own thread, and every ptrace call the walking needs happens
/// there. The kernel only lets the thread that attached to a process talk to it, so startCapture and
/// stopCapture do no work themselves: they queue a callback for the sampler thread and return.
///
/// One instance samples a single process at a time. A process can have only one tracer, and one
/// capture at a time also bounds what the sampling costs the server however many admin consoles are
/// open.
class KitStackSampler final : public SocketPoll
{
public:
    enum class State : uint8_t
    {
        Idle,
        /// Attached, taking the first sample, which is where the symbols are read.
        Priming,
        Running,
        Failed
    };

    enum class Error : uint8_t
    {
        None,
        NotBuilt,
        YamaTooStrict,
        AlreadyTraced,
        AttachRefused,
        NoSuchProcess,
        Busy,
        BadRate,
        MaxDurationReached,
        TargetExited,
        Internal
    };

    /// One published window of counts. Everything in it is final once published.
    struct Batch
    {
        pid_t pid = 0;
        std::string docKey;
        /// Which capture this belongs to. A batch whose id is not the current one is stale.
        uint64_t captureId = 0;
        /// Position within the capture, counting from one.
        uint64_t seq = 0;
        State state = State::Idle;
        Error error = Error::None;
        /// A sentence for the reader. Never empty when the error is not None.
        std::string message;
        /// The interval the sampler is working at, which is not always the one that was asked for.
        std::chrono::milliseconds interval{};
        uint32_t samples = 0;
        uint32_t idleSamples = 0;
        uint32_t droppedSamples = 0;
        uint32_t unresolvedFrames = 0;
        uint32_t totalFrames = 0;
        /// How many windows were merged into this one because the reader had fallen behind.
        uint32_t mergedWindows = 0;
        std::chrono::microseconds worstStop{};
        std::chrono::microseconds meanStop{};
        /// Set when the number of distinct stacks passed the cap and the rest went into one key.
        bool truncated = false;
        /// Counts since the previous batch of this capture, never running totals. Each key is a
        /// folded stack, in the form thread;outermost;...;leaf.
        std::vector<std::pair<std::string, uint32_t>> folded;
    };

    using BatchPtr = std::shared_ptr<const Batch>;
    /// Called on the sampler thread. It must not block, and it must not touch anything that belongs
    /// to another thread.
    using BatchSink = std::function<void(BatchPtr)>;

    explicit KitStackSampler(BatchSink sink);
    ~KitStackSampler() override;

    /// True when this build and this machine can sample at all. The reason names what is in the way
    /// when it is false.
    static bool isAvailable(std::string& reason);

    /// What stands in the way of sampling on this build and this machine, or None when nothing does.
    static Error availabilityError();

    /// The short word for one error, as the admin protocol spells it.
    static const char* errorCode(Error error);

    /// Asks for a capture of the given process. Safe to call from any thread. Returns false, with a
    /// reason and an error, when the request can be turned down without touching the target at all.
    /// A request that gets this far can still fail later, and then it fails through a batch carrying
    /// the error. On success the capture id is the one every batch of this capture will carry.
    bool startCapture(pid_t pid, const std::string& docKey, std::chrono::milliseconds interval,
                      std::string& reason, Error& error, uint64_t& captureId);

    /// Ends the capture of the given process. Zero means whatever is running. Safe to call from any
    /// thread, and does nothing when that process is not being captured.
    void stopCapture(pid_t pid);

    /// Changes the interval of the running capture. The value is clamped to the allowed range.
    void setInterval(pid_t pid, std::chrono::milliseconds interval);

    /// Tells the sampler that one published batch has been dealt with, which is what lets it publish
    /// again after it has run ahead of the reader. Safe to call from any thread.
    void noteBatchConsumed();

    bool isCapturing() const { return _capturing; }
    pid_t capturedPid() const { return _capturedPid; }

    /// The interval range a capture may ask for.
    static constexpr std::chrono::milliseconds MinInterval{ 20 };
    static constexpr std::chrono::milliseconds MaxInterval{ 1000 };

    void dumpState(std::ostream& os) const override;

private:
    void pollingThread() override;

    /// Everything about the capture in progress. Only the sampler thread touches it.
    struct Capture
    {
        pid_t pid = 0;
        std::string docKey;
        uint64_t captureId = 0;
        uint64_t seq = 0;
        std::chrono::milliseconds interval{};
        std::chrono::milliseconds askedInterval{};
        std::chrono::seconds maxDuration{};
        unsigned maxStackDepth = 0;
        State state = State::Idle;
        std::chrono::steady_clock::time_point startedAt;
        std::chrono::steady_clock::time_point endsAt;
        std::chrono::steady_clock::time_point nextSampleAt;
        std::chrono::steady_clock::time_point nextPublishAt;

        /// Counts gathered since the last published batch.
        std::map<std::string, uint32_t> folded;
        uint32_t samples = 0;
        uint32_t idleSamples = 0;
        uint32_t droppedSamples = 0;
        uint32_t unresolvedFrames = 0;
        uint32_t totalFrames = 0;
        uint32_t mergedWindows = 0;
        std::chrono::microseconds worstStop{};
        std::chrono::microseconds totalStop{};
        uint32_t stopCount = 0;
        bool truncated = false;

        /// The outcome of each of the last few samples, so that a target that is repeatedly slow to
        /// walk can be sampled less often instead of being sampled badly.
        unsigned recentSamples = 0;
        unsigned recentOverruns = 0;
        /// Set when a sample went over the budget, and skips the next one.
        bool skipNextSample = false;
    };

    /// Runs on the sampler thread. Attaches, or publishes the refusal.
    void beginCapture(pid_t pid, const std::string& docKey, std::chrono::milliseconds interval,
                      uint64_t captureId);
    /// Runs on the sampler thread. Detaches, publishes the closing batch and goes idle.
    void endCapture(Error error, const std::string& message);
    void takeSample();
    void publishBatch(bool final, Error error, const std::string& message);
    void countStack(const std::string& folded);

    const BatchSink _sink;
    /// Held by the sampler thread from the moment it attaches. There is only ever one.
    std::unique_ptr<class StackWalker> _walker;
    Capture _capture;

    /// Readable from any thread, so that a caller can be turned away without waiting for the
    /// sampler thread.
    std::atomic<bool> _capturing{ false };
    std::atomic<pid_t> _capturedPid{ 0 };
    std::atomic<uint64_t> _nextCaptureId{ 1 };
    /// Batches published and not yet dealt with by the reader.
    std::atomic<int> _unconsumedBatches{ 0 };

    /// Totals over the life of the process, for dumpState.
    uint64_t _capturesStarted = 0;
    uint64_t _samplesTaken = 0;
    uint64_t _batchesPublished = 0;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
