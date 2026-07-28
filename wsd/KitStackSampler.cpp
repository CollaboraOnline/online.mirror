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

#include <config.h>

#include "KitStackSampler.hpp"

#include "StackWalker.hpp"

#include <common/ConfigUtil.hpp>
#include <common/Log.hpp>
#include <common/SigUtil.hpp>

#include <algorithm>

namespace
{
/// How long the thread waits in its poll while there is nothing to sample. A callback wakes it, so
/// this only bounds how late a shutdown is noticed.
constexpr std::chrono::seconds IdleWait(1);

/// Threads walked in one sample. A kit with more than this many on a processor at once is unusual,
/// and walking all of them would cost more than the sample is worth.
constexpr size_t MaxThreadsPerSample = 16;

/// How long all the threads of one sample may be stopped for, taken together.
constexpr std::chrono::microseconds SampleStopBudget(25000);

/// A single sample this slow means something is badly wrong, and the capture ends.
constexpr std::chrono::microseconds RunawaySample(2000000);

/// Distinct stacks held in one window. Past this the rest are counted together.
constexpr size_t MaxFoldedKeys = 4096;

/// A window is published no more often than this, however fast the sampling is.
constexpr std::chrono::milliseconds MinPublishInterval(500);

/// Publish early once a window holds this many distinct stacks, so that one update stays small.
constexpr size_t PublishAtKeys = 1024;

/// Published batches the reader may fall behind by before the sampler stops publishing and merges.
constexpr int MaxUnconsumedBatches = 8;

/// Overruns within the last ten samples that halve the sampling rate.
constexpr unsigned OverrunsBeforeBackingOff = 5;

const char* stateName(KitStackSampler::State state)
{
    switch (state)
    {
        case KitStackSampler::State::Idle:
            return "idle";
        case KitStackSampler::State::Priming:
            return "priming";
        case KitStackSampler::State::Running:
            return "running";
        case KitStackSampler::State::Failed:
            return "failed";
    }

    return "unknown";
}
} // namespace

KitStackSampler::KitStackSampler(BatchSink sink)
    : SocketPoll("stacksampler")
    , _sink(std::move(sink))
{
    startThread();
}

KitStackSampler::~KitStackSampler()
{
    // The thread is joined before the walker goes, so that the detach happens on the thread that
    // attached. Nothing else may talk to a tracee.
    joinThread();
    _walker.reset();
}

bool KitStackSampler::isAvailable(std::string& reason) { return StackWalker::isAvailable(reason); }

KitStackSampler::Error KitStackSampler::availabilityError()
{
#if !ENABLE_LIBDW
    return Error::NotBuilt;
#else
    if (ProcRead::yamaPtraceScope() >= 2)
        return Error::YamaTooStrict;

    return Error::None;
#endif
}

const char* KitStackSampler::errorCode(Error error)
{
    switch (error)
    {
        case Error::None:
            return "none";
        case Error::NotBuilt:
            return "notbuilt";
        case Error::YamaTooStrict:
            return "yama";
        case Error::AlreadyTraced:
            return "traced";
        case Error::AttachRefused:
            return "refused";
        case Error::NoSuchProcess:
            return "notfound";
        case Error::Busy:
            return "busy";
        case Error::BadRate:
            return "badrate";
        case Error::MaxDurationReached:
            return "maxduration";
        case Error::TargetExited:
            return "kitdied";
        case Error::Internal:
            return "error";
    }

    return "error";
}

bool KitStackSampler::startCapture(pid_t pid, const std::string& docKey,
                                   std::chrono::milliseconds interval, std::string& reason,
                                   Error& error, uint64_t& captureId)
{
    error = Error::None;
    captureId = 0;

    if (!isAvailable(reason))
    {
        error = availabilityError();
        return false;
    }

    if (interval < MinInterval || interval > MaxInterval)
    {
        reason = "A sample interval of " + std::to_string(interval.count()) +
                 " ms is outside the allowed range of " + std::to_string(MinInterval.count()) +
                 " ms to " + std::to_string(MaxInterval.count()) + " ms.";
        error = Error::BadRate;
        return false;
    }

    bool expected = false;
    if (!_capturing.compare_exchange_strong(expected, true))
    {
        reason = "Process " + std::to_string(_capturedPid.load()) +
                 " is already being sampled. Only one capture runs at a time.";
        error = Error::Busy;
        return false;
    }

    _capturedPid = pid;
    captureId = _nextCaptureId++;

    if (!addCallback([this, pid, docKey, interval, captureId]
                     { beginCapture(pid, docKey, interval, captureId); }))
    {
        _capturing = false;
        _capturedPid = 0;
        captureId = 0;
        reason = "The sampling thread is not running.";
        error = Error::Internal;
        return false;
    }

    return true;
}

void KitStackSampler::stopCapture(pid_t pid)
{
    if (!_capturing)
        return;

    addCallback(
        [this, pid]
        {
            if (_capture.pid == 0 || (pid != 0 && _capture.pid != pid))
                return;

            endCapture(Error::None, "The capture was stopped.");
        });
}

void KitStackSampler::setInterval(pid_t pid, std::chrono::milliseconds interval)
{
    addCallback(
        [this, pid, interval]
        {
            if (_capture.pid == 0 || (pid != 0 && _capture.pid != pid))
                return;

            _capture.askedInterval = std::clamp(interval, MinInterval, MaxInterval);
            _capture.interval = _capture.askedInterval;
            _capture.recentSamples = 0;
            _capture.recentOverruns = 0;
            _capture.nextSampleAt = std::chrono::steady_clock::now() + _capture.interval;
            LOG_INF("Stack sampler of " << _capture.pid << " now sampling every "
                                        << _capture.interval);
        });
}

void KitStackSampler::noteBatchConsumed()
{
    if (_unconsumedBatches > 0)
        --_unconsumedBatches;
}

void KitStackSampler::beginCapture(pid_t pid, const std::string& docKey,
                                   std::chrono::milliseconds interval, uint64_t captureId)
{
    _capture = Capture();
    _capture.pid = pid;
    _capture.docKey = docKey;
    _capture.captureId = captureId;
    _capture.askedInterval = interval;
    _capture.interval = interval;
    // Zero means a capture runs until something ends it. A client that stops acknowledging ends it
    // after thirty seconds, and a closed socket ends it on the next publish.
    _capture.maxDuration = std::chrono::seconds(
        ConfigUtil::getConfigValue<int>("admin_console.stack_sampler.max_duration_secs", 0));
    _capture.maxStackDepth =
        ConfigUtil::getConfigValue<unsigned>("admin_console.stack_sampler.max_stack_depth", 128);
    _capture.state = State::Priming;

    const auto now = std::chrono::steady_clock::now();
    _capture.startedAt = now;
    _capture.endsAt = now + _capture.maxDuration;
    _capture.nextSampleAt = now;
    _capture.nextPublishAt = now + std::max(MinPublishInterval, _capture.interval);

    ++_capturesStarted;

    if (!_walker)
        _walker = std::make_unique<StackWalker>();

    StackWalker::Options options;
    options.maxStackDepth = _capture.maxStackDepth;

    std::string reason;
    if (!_walker->attach(pid, options, reason))
    {
        // Which refusal it was matters to the reader, and the walker's reason names the process or
        // the tracer, so both go out.
        Error error = Error::AttachRefused;
        if (ProcRead::startTime(pid) == 0)
            error = Error::NoSuchProcess;
        else if (ProcRead::tracerPid(pid) != 0)
            error = Error::AlreadyTraced;
        else if (ProcRead::yamaPtraceScope() >= 2)
            error = Error::YamaTooStrict;

        LOG_WRN("Stack sampler could not start on " << pid << ": " << reason);
        endCapture(error, reason);
        return;
    }

    LOG_INF("Stack sampler attached to " << pid << " for document [" << docKey
                                         << "], sampling every " << _capture.interval
                                         << " for at most " << _capture.maxDuration);

    // Read the symbols and the call frame information of every module now, with no thread stopped.
    // Reading them takes a while, hence the watchdog, and it keeps the walks short and even.
    disableWatchdog();
    const auto warmingStartedAt = std::chrono::steady_clock::now();
    const unsigned modules = _walker->warmModules();
    const auto warmingTook = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - warmingStartedAt);
    enableWatchdog();
    LOG_INF("Stack sampler read " << modules << " modules of " << pid << " in " << warmingTook);

    // Tell the reader that the attach worked before the first sample, which is the slow one.
    publishBatch(/*final=*/false, Error::None, std::string());
}

void KitStackSampler::endCapture(Error error, const std::string& message)
{
    if (_capture.pid == 0)
        return;

    if (_walker)
        _walker->detach();

    _capture.state = error == Error::None || error == Error::MaxDurationReached ? State::Idle
                                                                              : State::Failed;

    const auto duration = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - _capture.startedAt);
    LOG_INF("Stack sampler finished with " << _capture.pid << " after " << duration << ", "
                                           << _samplesTaken << " samples: " << message);

    publishBatch(/*final=*/true, error, message);

    _capture = Capture();
    _capturedPid = 0;
    _capturing = false;
    _unconsumedBatches = 0;
}

void KitStackSampler::countStack(const std::string& folded)
{
    if (_capture.folded.size() >= MaxFoldedKeys && !_capture.folded.count(folded))
    {
        _capture.truncated = true;
        ++_capture.folded["[truncated]"];
        return;
    }

    ++_capture.folded[folded];
}

void KitStackSampler::takeSample()
{
    if (!_walker || !_walker->isAttached())
        return;

    if (!_walker->targetAlive())
    {
        endCapture(Error::TargetExited, "The process being sampled has gone.");
        return;
    }

    if (_capture.skipNextSample)
    {
        _capture.skipNextSample = false;
        return;
    }

    // Reading the symbols of a large library takes far longer than the watchdog allows for, and so
    // can a deep stack full of addresses that have not been seen before.
    disableWatchdog();

    const auto sampleStartedAt = std::chrono::steady_clock::now();
    std::vector<pid_t> threads = _walker->runningThreads();
    if (threads.size() > MaxThreadsPerSample)
        threads.resize(MaxThreadsPerSample);

    if (threads.empty())
        ++_capture.idleSamples;

    std::chrono::microseconds stoppedInThisSample{};
    for (const pid_t tid : threads)
    {
        StackWalker::Sample sample;
        std::string reason;
        if (!_walker->sampleThread(tid, sample, reason))
            continue;

        stoppedInThisSample += sample.stoppedFor;
        _capture.totalStop += sample.stoppedFor;
        ++_capture.stopCount;
        _capture.worstStop = std::max(_capture.worstStop, sample.stoppedFor);
        _capture.totalFrames += sample.frames.size();
        _capture.unresolvedFrames += sample.unresolvedFrames;

        if (_capture.state == State::Running)
        {
            std::string folded = sample.threadName;
            for (auto frame = sample.frames.rbegin(); frame != sample.frames.rend(); ++frame)
            {
                folded.push_back(';');
                folded.append(*frame);
            }

            countStack(folded);
        }

        if (stoppedInThisSample > SampleStopBudget)
        {
            LOG_WRN("Stack sampler stopped the threads of " << _capture.pid << " for "
                                                            << stoppedInThisSample
                                                            << " in one sample, so it is skipping "
                                                               "the next one");
            break;
        }
    }

    enableWatchdog();

    const auto cost = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now() - sampleStartedAt);

    if (cost > RunawaySample)
    {
        endCapture(Error::Internal, "One sample took " + std::to_string(cost.count() / 1000) +
                                        " ms, which is far too long, so sampling has stopped.");
        return;
    }

    if (_capture.state == State::Priming)
    {
        // The first sample paid for reading the symbols, so its timings say nothing about the rest
        // and its counts are not data.
        _capture.state = State::Running;
        LOG_INF("Stack sampler took its first sample of " << _capture.pid << " in " << cost);
        _capture.folded.clear();
        _capture.totalFrames = 0;
        _capture.unresolvedFrames = 0;
        _capture.idleSamples = 0;
        _capture.worstStop = std::chrono::microseconds();
        _capture.totalStop = std::chrono::microseconds();
        _capture.stopCount = 0;
        return;
    }

    ++_capture.samples;
    ++_samplesTaken;

    if (stoppedInThisSample > SampleStopBudget)
    {
        ++_capture.droppedSamples;
        _capture.skipNextSample = true;
    }

    // A target that is consistently slow to walk gets sampled less often rather than badly. The rate
    // only ever goes down within one capture, and asking for a rate resets the count.
    ++_capture.recentSamples;
    if (stoppedInThisSample > SampleStopBudget)
        ++_capture.recentOverruns;

    if (_capture.recentSamples >= 10)
    {
        if (_capture.recentOverruns >= OverrunsBeforeBackingOff && _capture.interval < MaxInterval)
        {
            _capture.interval = std::min(_capture.interval * 2, MaxInterval);
            LOG_WRN("Stack sampler backed off to one sample every "
                    << _capture.interval << " because walking " << _capture.pid
                    << " keeps going over its budget");
        }

        _capture.recentSamples = 0;
        _capture.recentOverruns = 0;
    }
}

void KitStackSampler::publishBatch(bool final, Error error, const std::string& message)
{
    if (!_sink)
        return;

    const bool readerBehind = _unconsumedBatches >= MaxUnconsumedBatches;
    if (readerBehind && !final)
    {
        // Hold the window back and let the next one add to it. On counts a merge is just addition,
        // so nothing is lost but the timing.
        ++_capture.mergedWindows;
        _capture.nextPublishAt =
            std::chrono::steady_clock::now() + std::max(MinPublishInterval, _capture.interval);
        return;
    }

    auto batch = std::make_shared<Batch>();
    batch->pid = _capture.pid;
    batch->docKey = _capture.docKey;
    batch->captureId = _capture.captureId;
    batch->seq = ++_capture.seq;
    batch->state = _capture.state;
    batch->error = error;
    batch->message = message;
    batch->interval = _capture.interval;
    batch->samples = _capture.samples;
    batch->idleSamples = _capture.idleSamples;
    batch->droppedSamples = _capture.droppedSamples;
    batch->unresolvedFrames = _capture.unresolvedFrames;
    batch->totalFrames = _capture.totalFrames;
    batch->mergedWindows = _capture.mergedWindows;
    batch->worstStop = _capture.worstStop;
    batch->meanStop = _capture.stopCount
                          ? _capture.totalStop / _capture.stopCount
                          : std::chrono::microseconds();
    batch->truncated = _capture.truncated;
    batch->folded.reserve(_capture.folded.size());
    for (const auto& [stack, count] : _capture.folded)
        batch->folded.emplace_back(stack, count);

    // Everything in the batch is a count since the last one, so the window starts empty again.
    _capture.folded.clear();
    _capture.samples = 0;
    _capture.idleSamples = 0;
    _capture.droppedSamples = 0;
    _capture.unresolvedFrames = 0;
    _capture.totalFrames = 0;
    _capture.mergedWindows = 0;
    _capture.truncated = false;
    _capture.worstStop = std::chrono::microseconds();
    _capture.totalStop = std::chrono::microseconds();
    _capture.stopCount = 0;
    _capture.nextPublishAt =
        std::chrono::steady_clock::now() + std::max(MinPublishInterval, _capture.interval);

    ++_unconsumedBatches;
    ++_batchesPublished;
    _sink(batch);
}

void KitStackSampler::pollingThread()
{
    while (!isStop() && !SigUtil::getShutdownRequestFlag())
    {
        if (_capture.pid == 0)
        {
            // A callback arriving here is what starts a capture, and it wakes the poll.
            poll(IdleWait);
            continue;
        }

        const auto now = std::chrono::steady_clock::now();

        if (now >= _capture.nextSampleAt)
        {
            _capture.nextSampleAt = now + _capture.interval;
            takeSample();
            if (_capture.pid == 0)
                continue;
        }

        if (now >= _capture.nextPublishAt || _capture.folded.size() >= PublishAtKeys)
        {
            publishBatch(/*final=*/false, Error::None, std::string());
        }

        if (_capture.maxDuration.count() > 0 && now >= _capture.endsAt)
        {
            endCapture(Error::MaxDurationReached,
                       "Sampling stopped after the longest a capture may run, " +
                           std::to_string(_capture.maxDuration.count()) + " seconds.");
            continue;
        }

        const auto until = std::min(_capture.nextSampleAt, _capture.nextPublishAt);
        const auto wait =
            std::chrono::duration_cast<std::chrono::microseconds>(until - std::chrono::steady_clock::now());
        poll(std::max(wait, std::chrono::microseconds(0)));
    }

    // The detach has to happen on this thread, and this is the last chance.
    endCapture(Error::None, "The server is shutting down.");
}

void KitStackSampler::dumpState(std::ostream& os) const
{
    SocketPoll::dumpState(os);

    std::string reason;
    const bool available = isAvailable(reason);

    os << "\n\tstack sampler:";
    os << "\n\t\tavailable: " << available;
    if (!available)
        os << "\n\t\tunavailable because: " << reason;
    os << "\n\t\tcapturing: " << _capturing.load();
    os << "\n\t\tcaptured pid: " << _capturedPid.load();
    os << "\n\t\tcaptures started: " << _capturesStarted;
    os << "\n\t\tsamples taken: " << _samplesTaken;
    os << "\n\t\tbatches published: " << _batchesPublished;
    os << "\n\t\tbatches not yet dealt with: " << _unconsumedBatches.load();
    os << "\n\t\tcapture doc key: " << _capture.docKey;
    os << "\n\t\tcapture id: " << _capture.captureId;
    os << "\n\t\tcapture seq: " << _capture.seq;
    os << "\n\t\tcapture state: " << stateName(_capture.state);
    os << "\n\t\tcapture interval: " << _capture.interval;
    os << "\n\t\tcapture asked interval: " << _capture.askedInterval;
    os << "\n\t\tcapture max duration: " << _capture.maxDuration;
    os << "\n\t\tcapture max stack depth: " << _capture.maxStackDepth;
    os << "\n\t\tcapture stacks held: " << _capture.folded.size();
    os << "\n\t\tcapture worst thread stop: " << _capture.worstStop;
    if (_walker)
    {
        os << "\n\t\taddress lookups: " << _walker->addressLookups();
        os << "\n\t\taddress cache hits: " << _walker->addressCacheHits();
        os << "\n\t\tmodule list rereads: " << _walker->moduleRefreshes();
    }
    os << '\n';
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
