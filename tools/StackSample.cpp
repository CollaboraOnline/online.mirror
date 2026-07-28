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

/*
 * Samples the call stacks of a running process and prints them in the folded form that
 * flamegraph.pl reads. It uses the same StackWalker the admin console uses, so it is also how the
 * cost of one sample gets measured on a real machine.
 */

#include <config.h>

#include <common/Log.hpp>
#include <wsd/StackWalker.hpp>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <string>
#include <thread>
#include <vector>

#include <dirent.h>
#include <getopt.h>
#include <signal.h>
#include <unistd.h>

namespace
{
volatile sig_atomic_t Interrupted = 0;

void onInterrupt(int) { Interrupted = 1; }

void printUsage(const char* program)
{
    std::cerr
        << "Usage: " << program << " [options] <pid>\n"
        << "\n"
        << "  -r, --rate <hz>       samples per second, default 10\n"
        << "  -d, --duration <s>    how long to sample for, default 10, 0 means until interrupted\n"
        << "  -o, --output <file>    where to write the folded stacks, default standard output\n"
        << "  -m, --max-depth <n>   deepest stack to walk, default 128\n"
        << "  -l, --log-level <s>   trace, debug, information, warning, error. Default error\n"
        << "  -a, --all-threads     sample every thread, not only the running ones\n"
        << "  -h, --help\n";
}

/// One folded stack line without its count, which is the key the counts are gathered under.
std::string foldedKey(const std::string& threadName, const std::vector<std::string>& frames)
{
    std::string key = threadName;
    for (auto frame = frames.rbegin(); frame != frames.rend(); ++frame)
    {
        key.push_back(';');
        key.append(*frame);
    }

    return key;
}

/// Every thread in the task list, whatever state it is in. Sampling all of them is what shows the
/// cost the running-threads-only rule avoids.
std::vector<pid_t> allThreadsOf(pid_t pid)
{
    std::vector<pid_t> threads;
    const std::string taskDirectory = "/proc/" + std::to_string(pid) + "/task";
    DIR* directory = ::opendir(taskDirectory.c_str());
    if (!directory)
        return threads;

    while (const dirent* entry = ::readdir(directory))
    {
        if (entry->d_name[0] >= '0' && entry->d_name[0] <= '9')
            threads.push_back(static_cast<pid_t>(std::strtol(entry->d_name, nullptr, 10)));
    }

    ::closedir(directory);
    return threads;
}
} // namespace

int main(int argc, char** argv)
{
    unsigned rate = 10;
    unsigned durationSeconds = 10;
    unsigned maxDepth = 128;
    bool allThreads = false;
    std::string outputPath;
    std::string logLevel("error");

    static const option LongOptions[] = { { "rate", required_argument, nullptr, 'r' },
                                          { "duration", required_argument, nullptr, 'd' },
                                          { "output", required_argument, nullptr, 'o' },
                                          { "max-depth", required_argument, nullptr, 'm' },
                                          { "log-level", required_argument, nullptr, 'l' },
                                          { "all-threads", no_argument, nullptr, 'a' },
                                          { "help", no_argument, nullptr, 'h' },
                                          { nullptr, 0, nullptr, 0 } };

    int option;
    while ((option = getopt_long(argc, argv, "r:d:o:m:l:ah", LongOptions, nullptr)) != -1)
    {
        switch (option)
        {
            case 'r':
                rate = std::strtoul(optarg, nullptr, 10);
                break;
            case 'd':
                durationSeconds = std::strtoul(optarg, nullptr, 10);
                break;
            case 'o':
                outputPath = optarg;
                break;
            case 'm':
                maxDepth = std::strtoul(optarg, nullptr, 10);
                break;
            case 'l':
                logLevel = optarg;
                break;
            case 'a':
                allThreads = true;
                break;
            case 'h':
                printUsage(argv[0]);
                return 0;
            default:
                printUsage(argv[0]);
                return 1;
        }
    }

    if (optind >= argc || rate == 0)
    {
        printUsage(argv[0]);
        return 1;
    }

    const pid_t pid = static_cast<pid_t>(std::strtol(argv[optind], nullptr, 10));
    if (pid <= 0)
    {
        std::cerr << "Not a process number: " << argv[optind] << '\n';
        return 1;
    }

    Log::initialize("stacksample", logLevel, true, false);
    StackWalker::keepDebugInfoLookupLocal();

    std::string reason;
    if (!StackWalker::isAvailable(reason))
    {
        std::cerr << reason << '\n';
        return 1;
    }

    StackWalker::Options options;
    options.maxStackDepth = maxDepth;

    StackWalker walker;
    if (!walker.attach(pid, options, reason))
    {
        std::cerr << reason << '\n';
        return 1;
    }

    // The admin console sampler reads the call frame information and the symbols of every module
    // before its first sample, so do the same here or the numbers below describe a different program.
    const auto warmingStartedAt = std::chrono::steady_clock::now();
    const unsigned warmedModules = walker.warmModules();
    const auto warmingCost = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - warmingStartedAt);

    struct sigaction interruptAction;
    std::memset(&interruptAction, 0, sizeof(interruptAction));
    interruptAction.sa_handler = onInterrupt;
    ::sigaction(SIGINT, &interruptAction, nullptr);
    ::sigaction(SIGTERM, &interruptAction, nullptr);

    const auto interval = std::chrono::microseconds(1000000 / rate);
    const auto startedAt = std::chrono::steady_clock::now();
    const auto endAt = startedAt + std::chrono::seconds(durationSeconds);

    std::map<std::string, uint32_t> folded;
    std::vector<long long> sampleCosts;
    std::vector<long long> stopTimes;
    unsigned samples = 0;
    unsigned idleSamples = 0;
    unsigned walkedThreads = 0;
    unsigned lostThreads = 0;
    uint64_t totalFrames = 0;
    uint64_t unresolvedFrames = 0;
    uint64_t cutStacks = 0;
    long long firstSampleCost = 0;

    auto nextSampleAt = startedAt;
    while (!Interrupted && (durationSeconds == 0 || std::chrono::steady_clock::now() < endAt))
    {
        const auto now = std::chrono::steady_clock::now();
        if (now < nextSampleAt)
        {
            std::this_thread::sleep_for(nextSampleAt - now);
            continue;
        }
        nextSampleAt += interval;

        if (!walker.targetAlive())
        {
            std::cerr << "Process " << pid << " has gone after " << samples << " samples.\n";
            break;
        }

        const auto sampleStartedAt = std::chrono::steady_clock::now();

        const std::vector<pid_t> threads =
            allThreads ? allThreadsOf(pid) : walker.runningThreads();

        if (threads.empty())
            ++idleSamples;

        for (const pid_t tid : threads)
        {
            StackWalker::Sample sample;
            if (!walker.sampleThread(tid, sample, reason))
            {
                ++lostThreads;
                continue;
            }

            ++walkedThreads;
            totalFrames += sample.frames.size();
            unresolvedFrames += sample.unresolvedFrames;
            if (sample.cut)
                ++cutStacks;
            stopTimes.push_back(sample.stoppedFor.count());

            ++folded[foldedKey(sample.threadName, sample.frames)];
        }

        const auto cost = std::chrono::duration_cast<std::chrono::microseconds>(
                              std::chrono::steady_clock::now() - sampleStartedAt)
                              .count();
        if (samples == 0)
            firstSampleCost = cost;
        else
            sampleCosts.push_back(cost);
        ++samples;
    }

    // The counters go with the attach, so read them while it is still up.
    const uint64_t addressLookups = walker.addressLookups();
    const uint64_t addressCacheHits = walker.addressCacheHits();
    const unsigned moduleRefreshes = walker.moduleRefreshes();
    const auto symbolSearchTime = walker.symbolSearchTime();
    const auto nameBuildTime = walker.nameBuildTime();
    const auto symbolIndexTime = walker.symbolIndexTime();
    const uint64_t indexedSymbols = walker.indexedSymbols();
    walker.detach();

    std::ofstream outputFile;
    if (!outputPath.empty())
    {
        outputFile.open(outputPath, std::ios::trunc);
        if (!outputFile)
        {
            std::cerr << "Could not write to " << outputPath << '\n';
            return 1;
        }
    }
    std::ostream& output = outputPath.empty() ? std::cout : outputFile;

    for (const auto& [stack, count] : folded)
        output << stack << ' ' << count << '\n';
    output.flush();

    const auto percentile = [](std::vector<long long>& values, double fraction) -> long long
    {
        if (values.empty())
            return 0;
        std::sort(values.begin(), values.end());
        size_t index = static_cast<size_t>(fraction * values.size());
        if (index >= values.size())
            index = values.size() - 1;
        return values[index];
    };

    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startedAt);

    std::cerr << "\nSampled process " << pid << " for " << elapsed.count() << " ms at " << rate
              << " Hz\n"
              << "  samples                 " << samples << ", of which " << idleSamples
              << " found no running thread\n"
              << "  threads walked          " << walkedThreads << ", " << lostThreads
              << " gone before they could be walked\n"
              << "  distinct stacks         " << folded.size() << '\n'
              << "  frames                  " << totalFrames << ", " << unresolvedFrames
              << " without a name, " << cutStacks << " stacks cut at the depth cap\n"
              << "  modules read up front   " << warmedModules << " in " << warmingCost.count()
              << " ms\n"
              << "  first sample            " << firstSampleCost
              << " us, which pays for whatever the read above did not cover\n"
              << "  later samples           median " << percentile(sampleCosts, 0.5) << " us, 95th "
              << percentile(sampleCosts, 0.95) << " us, worst "
              << (sampleCosts.empty() ? 0 : *std::max_element(sampleCosts.begin(),
                                                              sampleCosts.end()))
              << " us\n"
              << "  thread stopped for      median " << percentile(stopTimes, 0.5) << " us, 95th "
              << percentile(stopTimes, 0.95) << " us, worst "
              << (stopTimes.empty() ? 0 : *std::max_element(stopTimes.begin(), stopTimes.end()))
              << " us\n"
              << "  address lookups         " << addressLookups << ", " << addressCacheHits
              << " answered from the cache\n";

    // Where an address the cache could not answer spends its time. The two lines together are what
    // an interval short enough to matter has to fit around, so they say which half is worth
    // attacking.
    const uint64_t misses = addressLookups - addressCacheHits;
    const auto perMiss = [misses](std::chrono::nanoseconds total) -> long long
    { return misses ? total.count() / static_cast<long long>(misses) : 0; };

    std::cerr << "  symbols indexed         " << indexedSymbols << " functions read in "
              << std::chrono::duration_cast<std::chrono::milliseconds>(symbolIndexTime).count()
              << " ms\n"
              << "  symbol table searched   "
              << std::chrono::duration_cast<std::chrono::milliseconds>(symbolSearchTime).count()
              << " ms over " << misses << " misses, " << perMiss(symbolSearchTime)
              << " ns each\n"
              << "  names demangled         "
              << std::chrono::duration_cast<std::chrono::milliseconds>(nameBuildTime).count()
              << " ms over " << misses << " misses, " << perMiss(nameBuildTime) << " ns each\n"
              << "  module list reread      " << moduleRefreshes << " times\n";

    return 0;
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
