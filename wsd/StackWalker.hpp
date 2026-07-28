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

#include <chrono>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include <sys/types.h>

/// Text helpers that turn raw names into the labels a flamegraph shows. They are pure functions of
/// their input, with no ptrace and no libdw behind them.
namespace StackText
{
/// Folds one thread name as it appears in /proc/<pid>/task/<tid>/comm down to the family it belongs
/// to, so that all the per-document threads of one kind land on a single flamegraph node. For
/// example kitbroker_1a2b becomes kitbroker. A name that matches no known family is returned
/// unchanged.
std::string foldThreadName(const std::string& comm);

/// Shortens one demangled C++ name to just the qualified function name, dropping the parameter list
/// and any template arguments. For example
/// void SocketPoll::insertNewSocket<std::shared_ptr<Socket> >(std::shared_ptr<Socket>)
/// becomes SocketPoll::insertNewSocket.
std::string compactSymbolName(const std::string& name);

/// Replaces the two characters that carry meaning in a folded stack line, the semicolon that
/// separates frames and the space that precedes the count, so that no symbol name can break the
/// line grammar. A label longer than 200 characters is cut to that length and ends in three dots.
std::string sanitiseFrameLabel(const std::string& label);

/// Assembles one folded stack line, in the form thread;outermost;...;leaf count. The frames are
/// given innermost first, which is the order the unwinder produces, and come out reversed.
std::string foldedLine(const std::string& threadName, const std::vector<std::string>& framesInnerToOuter,
                       uint32_t count);
} // namespace StackText

/// Walks the call stack of the threads of another process, using the DWARF call frame information
/// through libdw. One instance holds the attach state and every parsed module of a single target,
/// so repeated samples of the same process reuse all of that work.
///
/// Every method must be called from the one thread that called attach. libdw does the ptrace
/// itself, and the kernel only lets the thread that attached to a tracee talk to it.
///
/// While a thread is attached, its exit is reported to the tracer instead of to the real parent, so
/// a process that dies inside that window can have its exit status taken by libdw and its parent
/// left waiting. Two things keep the window small. Only a thread the kernel reports as running is
/// ever attached, and it stays attached for a few hundred microseconds. A process that has gone is
/// noticed on the next sample and ends the walking.
class StackWalker
{
public:
    struct Options
    {
        /// Frames beyond this are not walked. The stack is cut, not dropped.
        unsigned maxStackDepth = 128;
        /// How long one thread may stay stopped while its stack is walked. Reaching it cuts the
        /// stack short and lets the thread run again.
        std::chrono::microseconds perThreadDeadline{ 5000 };
    };

    /// One walked thread.
    struct Sample
    {
        pid_t tid = 0;
        /// The folded thread name, so kitbroker rather than kitbroker_1a2b.
        std::string threadName;
        /// Frame labels, innermost first.
        std::vector<std::string> frames;
        /// How many of the frames came out as an address or a module offset rather than a name.
        unsigned unresolvedFrames = 0;
        /// How long the thread was stopped.
        std::chrono::microseconds stoppedFor{};
        /// True when the depth cap or the deadline cut the walk short.
        bool cut = false;
    };

    /// True when this build can sample at all, and the machine allows it. The reason is filled in
    /// with a sentence naming what is in the way when this returns false.
    static bool isAvailable(std::string& reason);

    /// Removes DEBUGINFOD_URLS from the environment, so that looking for the debug information of a
    /// module stays on the local disk. Call this once at startup from the main thread, before any
    /// other thread exists, because changing the environment while another thread reads it is not
    /// safe.
    static void keepDebugInfoLookupLocal();

    StackWalker();
    ~StackWalker();

    StackWalker(const StackWalker&) = delete;
    StackWalker& operator=(const StackWalker&) = delete;

    /// Reads the target's module list and attaches to it. The reason is filled in on failure.
    bool attach(pid_t pid, const Options& options, std::string& reason);

    /// Detaches and frees every module and every open file. Safe to call when not attached.
    void detach();

    bool isAttached() const;
    pid_t pid() const { return _pid; }

    /// The tids of the target's threads that the kernel currently reports as on a CPU or in an
    /// uninterruptible wait. A thread parked in a poll is left out, so it is never stopped.
    std::vector<pid_t> runningThreads() const;

    /// Walks one thread. The thread is stopped for the duration and runs again on return. Returns
    /// false when the thread could not be walked at all, for instance because it exited in the
    /// meantime, and then fills in the reason.
    bool sampleThread(pid_t tid, Sample& sample, std::string& reason);

    /// True while the target is a live process, and is still the same process that attach saw. A
    /// zombie counts as gone.
    bool targetAlive() const;

    /// Reads the call frame information and the symbol table of every reported module, so that a
    /// walk into a library that has not been walked before costs no more than any other walk. Takes
    /// a while, and stops no thread, so call it before the first sample and after a module reread.
    /// Returns how many modules were read.
    unsigned warmModules();

    /// Rereads the target's module list, so that a library loaded since the last read resolves.
    /// Every parsed module that is still mapped is kept, along with its symbols and its call frame
    /// information. Only ever call this with no thread stopped.
    bool refreshModules(std::string& reason);

    /// How many program counters were looked up, and how many of those the label cache answered.
    uint64_t addressLookups() const { return _addressLookups; }
    uint64_t addressCacheHits() const { return _addressCacheHits; }
    /// How many times the module list was reread over the life of this attach.
    unsigned moduleRefreshes() const { return _moduleRefreshes; }

private:
    struct DwflState;

    /// Turns one program counter into a frame label, going through the label cache.
    const std::string& labelFor(uintptr_t programCounter, bool& resolved);

    std::unique_ptr<DwflState> _state;
    Options _options;
    pid_t _pid = 0;
    /// Field 22 of /proc/<pid>/stat, the moment the target was started. A pid that comes back with
    /// a different value here is a different process that happens to have been given the same
    /// number.
    unsigned long long _startTime = 0;
    uint64_t _addressLookups = 0;
    uint64_t _addressCacheHits = 0;
    unsigned _moduleRefreshes = 0;
};

/// Small readers over /proc that the sampler needs and that ProcUtil does not already offer.
namespace ProcRead
{
/// The state character from /proc/<pid>/task/<tid>/stat, for example R for running or S for
/// sleeping. Returns 0 when the thread is gone or the file cannot be read.
char threadState(pid_t pid, pid_t tid);

/// Field 22 of /proc/<pid>/stat, the moment the process was started, in clock ticks since the
/// machine booted. Returns 0 when the process is gone.
unsigned long long startTime(pid_t pid);

/// The contents of /proc/<pid>/task/<tid>/comm with the trailing newline removed.
std::string threadName(pid_t pid, pid_t tid);

/// The pid of the process currently tracing this one, from the TracerPid line of
/// /proc/<pid>/status. Zero means nobody is tracing it.
pid_t tracerPid(pid_t pid);

/// The value of /proc/sys/kernel/yama/ptrace_scope. Returns 0 when the file is absent, which is
/// what a kernel built without yama looks like and means no restriction.
int yamaPtraceScope();
} // namespace ProcRead

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
