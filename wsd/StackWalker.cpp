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

#include "StackWalker.hpp"

#include <common/Log.hpp>
#include <common/ProcUtil.hpp>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <unordered_map>

#include <dirent.h>
#include <fcntl.h>
#include <signal.h>
#include <unistd.h>

#if ENABLE_LIBDW
#include <dwarf.h>
#include <elfutils/libdwfl.h>
#endif

namespace
{
std::string readWholeFile(const std::string& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file)
        return std::string();

    std::ostringstream contents;
    contents << file.rdbuf();
    return contents.str();
}

/// The fields of a stat file after the comm field, which is the only one that can hold arbitrary
/// text, including spaces and closing parentheses. Splitting from the last closing parenthesis is
/// what makes a thread called "kit) 0 0" harmless. Element zero is field 3 of the file, the state.
std::vector<std::string> statFieldsAfterName(const std::string& stat)
{
    const size_t nameEnd = stat.rfind(')');
    if (nameEnd == std::string::npos)
        return {};

    std::vector<std::string> fields;
    std::istringstream rest(stat.substr(nameEnd + 1));
    std::string field;
    while (rest >> field)
        fields.push_back(field);

    return fields;
}
} // namespace

namespace ProcRead
{
char threadState(pid_t pid, pid_t tid)
{
    const std::string stat =
        readWholeFile("/proc/" + std::to_string(pid) + "/task/" + std::to_string(tid) + "/stat");
    const std::vector<std::string> fields = statFieldsAfterName(stat);
    if (fields.empty() || fields[0].empty())
        return 0;

    return fields[0][0];
}

unsigned long long startTime(pid_t pid)
{
    const std::string stat = readWholeFile("/proc/" + std::to_string(pid) + "/stat");
    const std::vector<std::string> fields = statFieldsAfterName(stat);
    // Field 22 of the file, counting the pid as field 1, so element 19 once the pid and the name
    // are gone.
    if (fields.size() <= 19)
        return 0;

    return std::strtoull(fields[19].c_str(), nullptr, 10);
}

std::string threadName(pid_t pid, pid_t tid)
{
    std::string comm =
        readWholeFile("/proc/" + std::to_string(pid) + "/task/" + std::to_string(tid) + "/comm");
    while (!comm.empty() && (comm.back() == '\n' || comm.back() == '\r'))
        comm.pop_back();

    return comm;
}

pid_t tracerPid(pid_t pid)
{
    std::ifstream status("/proc/" + std::to_string(pid) + "/status");
    std::string line;
    while (std::getline(status, line))
    {
        constexpr std::string_view Key("TracerPid:");
        if (line.compare(0, Key.size(), Key) == 0)
            return static_cast<pid_t>(std::strtol(line.c_str() + Key.size(), nullptr, 10));
    }

    return 0;
}

int yamaPtraceScope()
{
    const std::string scope = readWholeFile("/proc/sys/kernel/yama/ptrace_scope");
    if (scope.empty())
        return 0;

    return static_cast<int>(std::strtol(scope.c_str(), nullptr, 10));
}
} // namespace ProcRead

namespace StackText
{
std::string foldThreadName(const std::string& comm)
{
    // Longest first, so that kit_spare_001 folds to kit_spare and not to kit.
    static constexpr std::string_view Families[] = { "lokit_main", "kit_spare", "kitbgsv",
                                                     "kitbroker", "docbroker", "kit" };

    for (const std::string_view family : Families)
    {
        if (comm.compare(0, family.size(), family) == 0)
            return std::string(family);
    }

    return comm;
}

/// Whether the character can appear inside an identifier, so that a word boundary can be found.
bool isIdentifierCharacter(char c)
{
    return c == '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

/// The position of the parenthesis that closes the one at open, or npos when it is unbalanced.
size_t matchingParenthesis(std::string_view name, size_t open)
{
    int depth = 0;
    for (size_t i = open; i < name.size(); ++i)
    {
        if (name[i] == '(')
            ++depth;
        else if (name[i] == ')' && --depth == 0)
            return i;
    }

    return std::string::npos;
}

/// The first space that is outside every parenthesis, brace and pair of angle brackets, or npos
/// when the text has none. A demangled name puts the return type before such a space.
size_t topLevelSpace(std::string_view name)
{
    int parenDepth = 0;
    int braceDepth = 0;
    int templateDepth = 0;
    for (size_t i = 0; i < name.size(); ++i)
    {
        const char c = name[i];
        if (c == '(')
            ++parenDepth;
        else if (c == ')' && parenDepth > 0)
            --parenDepth;
        else if (c == '{')
            ++braceDepth;
        else if (c == '}' && braceDepth > 0)
            --braceDepth;
        else if (c == '<')
            ++templateDepth;
        else if (c == '>' && templateDepth > 0)
            --templateDepth;
        else if (c == ' ' && parenDepth == 0 && braceDepth == 0 && templateDepth == 0)
            return i;
    }

    return std::string_view::npos;
}

/// The compact form of one candidate name, empty when the text turned out to be a return type and
/// nothing else.
std::string compactOnce(std::string_view name)
{
    // Cut the parameter list off. A parenthesis inside template arguments is part of a type, and a
    // parenthesis right after the word operator is part of the function's own name.
    int templateDepth = 0;
    int braceDepth = 0;
    size_t nameEnd = name.size();
    // Half-open ranges of the name that spell the parameter list of an enclosing function, which
    // the compact form leaves out.
    std::vector<std::pair<size_t, size_t>> enclosingParameters;
    for (size_t i = 0; i < name.size(); ++i)
    {
        const char c = name[i];
        if (c == '<')
            ++templateDepth;
        else if (c == '>' && templateDepth > 0)
            --templateDepth;
        else if (c == '{')
            ++braceDepth;
        else if (c == '}' && braceDepth > 0)
            --braceDepth;
        else if (c == '(' && templateDepth == 0 && braceDepth == 0)
        {
            // A name can be inside an unnamed namespace, and it can be a lambda, and both spell
            // themselves with parentheses that belong to the name.
            constexpr std::string_view Anonymous("(anonymous namespace)");
            if (name.compare(i, Anonymous.size(), Anonymous) == 0)
            {
                i += Anonymous.size() - 1;
                continue;
            }

            constexpr std::string_view Operator("operator");
            const bool belongsToOperatorName =
                i >= Operator.size() && name.compare(i - Operator.size(), Operator.size(),
                                                     Operator) == 0;
            if (belongsToOperatorName)
            {
                // Step over the pair of parentheses that spell operator().
                const size_t close = name.find(')', i);
                if (close == std::string::npos)
                    break;
                i = close;
                continue;
            }

            // A lambda spells out the function that encloses it, parameter list and all, before
            // its own name, so a parameter list with a scope operator after it belongs to an
            // enclosing function and the name carries on past it.
            const size_t close = matchingParenthesis(name, i);
            if (close != std::string::npos && name.compare(close + 1, 2, "::") == 0)
            {
                enclosingParameters.emplace_back(i, close + 1);
                i = close;
                continue;
            }

            nameEnd = i;
            break;
        }
    }

    // Drop the template arguments and the parameter lists of enclosing functions, keeping
    // everything outside them.
    std::string compact;
    compact.reserve(nameEnd);
    templateDepth = 0;
    size_t nextEnclosing = 0;
    for (size_t i = 0; i < nameEnd; ++i)
    {
        if (nextEnclosing < enclosingParameters.size() &&
            i == enclosingParameters[nextEnclosing].first)
        {
            i = enclosingParameters[nextEnclosing].second - 1;
            ++nextEnclosing;
            continue;
        }

        const char c = name[i];
        if (c == '<')
            ++templateDepth;
        else if (c == '>' && templateDepth > 0)
            --templateDepth;
        else if (templateDepth == 0)
            compact.push_back(c);
    }

    // A demangled name carries its return type in front, so the name starts after the last space
    // that separates the two. A space inside a parenthesis or a brace is part of the name, as in
    // (anonymous namespace)::f and {lambda()#2}, and the space in operator new or operator bool
    // belongs to the name as well, so neither of those separates anything.
    size_t nameStart = std::string::npos;
    int parenDepth = 0;
    braceDepth = 0;
    for (size_t i = 0; i < compact.size(); ++i)
    {
        const char c = compact[i];
        if (c == '(')
            ++parenDepth;
        else if (c == ')' && parenDepth > 0)
            --parenDepth;
        else if (c == '{')
            ++braceDepth;
        else if (c == '}' && braceDepth > 0)
            --braceDepth;
        else if (c == ' ' && parenDepth == 0 && braceDepth == 0)
        {
            constexpr std::string_view Operator("operator");
            const bool wordBeforeIsOperator =
                i >= Operator.size() &&
                compact.compare(i - Operator.size(), Operator.size(), Operator) == 0 &&
                (i == Operator.size() || !isIdentifierCharacter(compact[i - Operator.size() - 1]));
            if (!wordBeforeIsOperator)
                nameStart = i + 1;
        }
    }

    if (nameStart != std::string::npos)
        compact.erase(0, nameStart);

    while (!compact.empty() && compact.front() == ' ')
        compact.erase(0, 1);
    while (!compact.empty() && compact.back() == ' ')
        compact.pop_back();

    return compact;
}

std::string compactSymbolName(const std::string& name)
{
    std::string_view text(name);
    // A demangled template function whose return type is written as decltype of an expression puts
    // a parenthesised expression before its own name, so the first pass finds only the return type.
    // Each further pass starts just after the return type it found.
    for (int attempt = 0; attempt < 4; ++attempt)
    {
        std::string compact = compactOnce(text);
        if (!compact.empty())
            return compact;

        const size_t space = topLevelSpace(text);
        if (space == std::string_view::npos)
            break;

        text = text.substr(space + 1);
    }

    return name;
}

std::string sanitiseFrameLabel(const std::string& label)
{
    std::string clean;
    clean.reserve(label.size());
    bool lastWasSpace = false;
    for (const char c : label)
    {
        if (c == ';')
        {
            clean.push_back(':');
            lastWasSpace = false;
        }
        else if (c == ' ' || c == '\t' || c == '\n' || c == '\r')
        {
            if (!lastWasSpace && !clean.empty())
                clean.push_back(' ');
            lastWasSpace = true;
        }
        else
        {
            clean.push_back(c);
            lastWasSpace = false;
        }
    }

    while (!clean.empty() && clean.back() == ' ')
        clean.pop_back();

    // A name the demangler cannot read, for example one that carries a C++20 requires clause, stays
    // in its mangled form and can run to a thousand characters. The first characters name the
    // namespace and the class, so the front of the name is the part worth keeping.
    constexpr size_t MaxLabelLength = 200;
    constexpr std::string_view Elision("...");
    if (clean.size() > MaxLabelLength)
    {
        clean.resize(MaxLabelLength - Elision.size());
        clean.append(Elision);
    }

    return clean;
}

std::string foldedLine(const std::string& threadName,
                       const std::vector<std::string>& framesInnerToOuter, uint32_t count)
{
    std::string line = threadName;
    for (auto frame = framesInnerToOuter.rbegin(); frame != framesInnerToOuter.rend(); ++frame)
    {
        line.push_back(';');
        line.append(*frame);
    }

    line.push_back(' ');
    line.append(std::to_string(count));
    return line;
}
} // namespace StackText

#if ENABLE_LIBDW

namespace
{
/// The process libdw is currently reporting modules for. The find_elf callback gets no pointer of
/// our own to work with, so the pid it needs to open a jailed path travels here. Only the one thread
/// that owns an attach ever runs these callbacks.
thread_local pid_t CurrentTarget = 0;

class ScopedTarget
{
public:
    explicit ScopedTarget(pid_t pid)
        : _previous(CurrentTarget)
    {
        CurrentTarget = pid;
    }

    ~ScopedTarget() { CurrentTarget = _previous; }

    ScopedTarget(const ScopedTarget&) = delete;
    ScopedTarget& operator=(const ScopedTarget&) = delete;

private:
    const pid_t _previous;
};

/// A kit maps its libraries from inside its jail, so the paths in its memory map, such as
/// /lo/program/libmergedlo.so, name nothing on the host. Reaching the same file through
/// /proc/<pid>/root gets at the jail's own view of the filesystem.
int findElfWithJailFallback(Dwfl_Module* module, void** userData, const char* moduleName,
                           Dwarf_Addr base, char** fileName, Elf** elf)
{
    const int fd = dwfl_linux_proc_find_elf(module, userData, moduleName, base, fileName, elf);
    if (fd >= 0 || !moduleName || moduleName[0] != '/' || CurrentTarget == 0)
        return fd;

    const std::string jailed =
        "/proc/" + std::to_string(CurrentTarget) + "/root" + std::string(moduleName);
    const int jailedFd = open(jailed.c_str(), O_RDONLY);
    if (jailedFd < 0)
        return fd;

    // libdwfl takes ownership of the name and frees it with free.
    *fileName = strdup(jailed.c_str());
    *elf = nullptr;
    return jailedFd;
}

struct FrameContext
{
    std::vector<uintptr_t>* programCounters = nullptr;
    unsigned maxDepth = 0;
    std::chrono::steady_clock::time_point deadline;
    bool cut = false;
};

int collectFrame(Dwfl_Frame* frame, void* argument)
{
    FrameContext* context = static_cast<FrameContext*>(argument);

    Dwarf_Addr programCounter = 0;
    bool isActivation = false;
    if (!dwfl_frame_pc(frame, &programCounter, &isActivation))
        return DWARF_CB_ABORT;

    // For every frame but the innermost, the saved program counter is the return address, which is
    // the instruction after the call. One byte back lands inside the call itself, and so inside the
    // right line and the right inlined function.
    if (!isActivation && programCounter > 0)
        --programCounter;

    context->programCounters->push_back(static_cast<uintptr_t>(programCounter));

    if (context->programCounters->size() >= context->maxDepth ||
        std::chrono::steady_clock::now() >= context->deadline)
    {
        context->cut = true;
        return DWARF_CB_ABORT;
    }

    return DWARF_CB_OK;
}

std::string toHex(uintptr_t value)
{
    char buffer[2 + 2 * sizeof(uintptr_t) + 1];
    std::snprintf(buffer, sizeof(buffer), "0x%lx", static_cast<unsigned long>(value));
    return buffer;
}

/// The last libdw error as a sentence, or the errno text when libdw handed one back instead.
std::string libdwError(int result)
{
    if (result > 0)
        return std::strerror(result);

    const char* message = dwfl_errmsg(-1);
    return message ? message : "unknown libdw failure";
}
} // namespace

struct StackWalker::DwflState
{
    ~DwflState()
    {
        if (dwfl)
            dwfl_end(dwfl);
    }

    Dwfl* dwfl = nullptr;
    Dwfl_Callbacks callbacks{};

    struct Label
    {
        std::string text;
        bool resolved = false;
    };

    /// Program counter to frame label. Every entry stays valid for the life of the attach, so a
    /// reference handed out here does not go stale.
    std::unordered_map<uintptr_t, Label> labels;
    /// Thread id to folded thread name.
    std::unordered_map<pid_t, std::string> threadNames;
    /// Set when an address landed in no known module, which is what a library loaded since the last
    /// module read looks like.
    bool sawUnknownModule = false;
    std::chrono::steady_clock::time_point lastModuleRefresh;
};

#else // !ENABLE_LIBDW

struct StackWalker::DwflState
{
};

#endif

StackWalker::StackWalker() = default;

StackWalker::~StackWalker() = default;

void StackWalker::keepDebugInfoLookupLocal()
{
    // With this set, looking for a module's separate debug information can turn into an HTTP request
    // to a debuginfod server, which would block the sampling thread for as long as that takes.
    ::unsetenv("DEBUGINFOD_URLS");
}

bool StackWalker::isAvailable(std::string& reason)
{
#if !ENABLE_LIBDW
    reason = "This build has no libdw from elfutils, so it cannot walk the stack of a kit.";
    return false;
#else
    const int scope = ProcRead::yamaPtraceScope();
    if (scope >= 2)
    {
        reason = "The kernel setting /proc/sys/kernel/yama/ptrace_scope is " +
                 std::to_string(scope) + ", which allows only a program running as root to inspect "
                                         "another process. Sampling needs the value 0 or 1.";
        return false;
    }

    return true;
#endif
}

bool StackWalker::isAttached() const
{
#if ENABLE_LIBDW
    return _state && _state->dwfl;
#else
    return false;
#endif
}

bool StackWalker::attach([[maybe_unused]] pid_t pid, [[maybe_unused]] const Options& options,
                         std::string& reason)
{
    detach();

#if !ENABLE_LIBDW
    reason = "This build has no libdw from elfutils, so it cannot walk the stack of a kit.";
    return false;
#else
    if (!isAvailable(reason))
        return false;

    _startTime = ProcRead::startTime(pid);
    if (_startTime == 0)
    {
        reason = "There is no process with the number " + std::to_string(pid) + " any more.";
        return false;
    }

    const pid_t tracer = ProcRead::tracerPid(pid);
    if (tracer != 0 && tracer != ::getpid())
    {
        reason = "Process " + std::to_string(pid) + " is already being inspected by process " +
                 std::to_string(tracer) + ", perhaps a debugger. Only one at a time is allowed.";
        return false;
    }

    _pid = pid;
    _options = options;
    _state = std::make_unique<DwflState>();
    _state->callbacks.find_elf = findElfWithJailFallback;
    _state->callbacks.find_debuginfo = dwfl_standard_find_debuginfo;
    _state->callbacks.section_address = nullptr;
    _state->callbacks.debuginfo_path = nullptr;

    ScopedTarget target(pid);

    _state->dwfl = dwfl_begin(&_state->callbacks);
    if (!_state->dwfl)
    {
        reason = "Could not start reading the debug information: " + libdwError(-1);
        detach();
        return false;
    }

    // Report the modules before attaching. Attaching works out which architecture the target is
    // from whichever module it finds, so there has to be one by then.
    if (dwfl_linux_proc_report(_state->dwfl, pid) != 0 ||
        dwfl_report_end(_state->dwfl, nullptr, nullptr) != 0)
    {
        reason = "Could not read the memory map of process " + std::to_string(pid) + ": " +
                 libdwError(-1);
        detach();
        return false;
    }

    // With the last argument false, libdw stops each thread itself when it walks that thread, and
    // lets it run again straight afterwards.
    const int result = dwfl_linux_proc_attach(_state->dwfl, pid, /*assume_ptrace_stopped=*/false);
    if (result != 0)
    {
        reason =
            "Could not attach to process " + std::to_string(pid) + ": " + libdwError(result);
        detach();
        return false;
    }

    _state->lastModuleRefresh = std::chrono::steady_clock::now();
    return true;
#endif
}

void StackWalker::detach()
{
    _state.reset();
    _pid = 0;
    _startTime = 0;
    _addressLookups = 0;
    _addressCacheHits = 0;
    _moduleRefreshes = 0;
}

bool StackWalker::targetAlive() const
{
    if (_pid == 0)
        return false;

    if (::kill(_pid, 0) != 0)
        return false;

    // A process that has exited but has not been collected by its parent still answers to a signal
    // of zero, so ask what state it is in as well.
    const char state = ProcRead::threadState(_pid, _pid);
    if (state == 0 || state == 'Z' || state == 'X')
        return false;

    // A process number is reused once the kernel has run through the whole range, so the moment the
    // process started tells us whether this is still the same one.
    return ProcRead::startTime(_pid) == _startTime;
}

std::vector<pid_t> StackWalker::runningThreads() const
{
    std::vector<pid_t> running;
    if (_pid == 0)
        return running;

    const std::string taskDirectory = "/proc/" + std::to_string(_pid) + "/task";
    DIR* directory = ::opendir(taskDirectory.c_str());
    if (!directory)
        return running;

    while (const dirent* entry = ::readdir(directory))
    {
        if (entry->d_name[0] < '0' || entry->d_name[0] > '9')
            continue;

        const pid_t tid = static_cast<pid_t>(std::strtol(entry->d_name, nullptr, 10));
        const char state = ProcRead::threadState(_pid, tid);
        // R is on a processor or waiting for one. D is in an uninterruptible wait, which in practice
        // means disk, and is worth showing because the time is really being spent there.
        if (state == 'R' || state == 'D')
            running.push_back(tid);
    }

    ::closedir(directory);
    return running;
}

#if ENABLE_LIBDW

unsigned StackWalker::warmModules()
{
    if (!isAttached())
        return 0;

    ScopedTarget target(_pid);

    struct WarmCount
    {
        unsigned modules = 0;
    } counted;

    dwfl_getmodules(
        _state->dwfl,
        [](Dwfl_Module* module, void**, const char*, Dwarf_Addr, void* argument) -> int
        {
            // Reading the call frame information here is the whole point. It is what libdw would
            // otherwise read during the first walk that reaches this library, with a thread stopped
            // and waiting for it.
            Dwarf_Addr bias = 0;
            dwfl_module_eh_cfi(module, &bias);
            dwfl_module_dwarf_cfi(module, &bias);
            // The symbol table is read for the labels, which happens with no thread stopped, so this
            // only moves work out of the first few samples.
            dwfl_module_getsymtab(module);

            ++static_cast<WarmCount*>(argument)->modules;
            return DWARF_CB_OK;
        },
        &counted, 0);

    return counted.modules;
}

bool StackWalker::refreshModules(std::string& reason)
{
    if (!isAttached())
    {
        reason = "Not attached to any process.";
        return false;
    }

    ScopedTarget target(_pid);

    // report_begin_add keeps every module that is already known, along with its symbols and its
    // parsed call frame information, so a refresh costs one pass over the memory map.
    dwfl_report_begin_add(_state->dwfl);
    const bool reported = dwfl_linux_proc_report(_state->dwfl, _pid) == 0;
    const bool ended = dwfl_report_end(_state->dwfl, nullptr, nullptr) == 0;
    if (!reported || !ended)
    {
        reason = "Could not reread the memory map of process " + std::to_string(_pid) + ": " +
                 libdwError(-1);
        return false;
    }

    ++_moduleRefreshes;
    _state->sawUnknownModule = false;
    _state->lastModuleRefresh = std::chrono::steady_clock::now();
    return true;
}

const std::string& StackWalker::labelFor(uintptr_t programCounter, bool& resolved)
{
    ++_addressLookups;

    const auto known = _state->labels.find(programCounter);
    if (known != _state->labels.end())
    {
        ++_addressCacheHits;
        resolved = known->second.resolved;
        return known->second.text;
    }

    DwflState::Label label;
    Dwfl_Module* module = dwfl_addrmodule(_state->dwfl, programCounter);
    if (module)
    {
        GElf_Off offsetInSymbol = 0;
        GElf_Sym symbol;
        const char* symbolName = dwfl_module_addrinfo(module, programCounter, &offsetInSymbol,
                                                      &symbol, nullptr, nullptr, nullptr);
        if (symbolName && *symbolName)
        {
            const std::string demangled = ProcUtil::demangle(symbolName);
            label.text = StackText::sanitiseFrameLabel(
                StackText::compactSymbolName(demangled.empty() ? std::string(symbolName)
                                                               : demangled));
            label.resolved = true;
        }
        else
        {
            // The module is known but carries no symbol covering this address, which is what a
            // stripped library with no debug information package installed looks like.
            Dwarf_Addr moduleStart = 0;
            const char* moduleName =
                dwfl_module_info(module, nullptr, &moduleStart, nullptr, nullptr, nullptr, nullptr,
                                 nullptr);
            std::string shortName = moduleName ? moduleName : "?";
            const size_t lastSlash = shortName.rfind('/');
            if (lastSlash != std::string::npos)
                shortName.erase(0, lastSlash + 1);

            label.text = StackText::sanitiseFrameLabel(
                shortName + "+" + toHex(programCounter - moduleStart));
        }
    }
    else
    {
        label.text = "[unknown " + toHex(programCounter) + ']';
        _state->sawUnknownModule = true;
    }

    resolved = label.resolved;
    return _state->labels.emplace(programCounter, std::move(label)).first->second.text;
}

bool StackWalker::sampleThread(pid_t tid, Sample& sample, std::string& reason)
{
    if (!isAttached())
    {
        reason = "Not attached to any process.";
        return false;
    }

    // A library mapped since the last read shows up as an address in no module. Reading the map
    // again is only safe with no thread stopped, which is here, between samples.
    constexpr std::chrono::seconds RefreshInterval(5);
    constexpr unsigned MaxRefreshes = 20;
    if (_state->sawUnknownModule && _moduleRefreshes < MaxRefreshes &&
        std::chrono::steady_clock::now() - _state->lastModuleRefresh > RefreshInterval)
    {
        std::string refreshReason;
        if (!refreshModules(refreshReason))
        {
            LOG_WRN("Stack sampler could not reread the modules of " << _pid << ": "
                                                                     << refreshReason);
            // Start again from nothing, so that a half reported module list does not produce
            // nonsense labels for the rest of the capture.
            const Options options = _options;
            const pid_t pid = _pid;
            detach();
            if (!attach(pid, options, refreshReason))
            {
                reason = refreshReason;
                return false;
            }
        }

        // The library that turned up is read here rather than during the walk that reaches it.
        warmModules();
    }

    ScopedTarget target(_pid);

    std::vector<uintptr_t> programCounters;
    programCounters.reserve(_options.maxStackDepth);

    FrameContext context;
    context.programCounters = &programCounters;
    context.maxDepth = _options.maxStackDepth;
    context.deadline = std::chrono::steady_clock::now() + _options.perThreadDeadline;

    const auto stoppedAt = std::chrono::steady_clock::now();
    const int result = dwfl_getthread_frames(_state->dwfl, tid, collectFrame, &context);
    const auto stoppedFor =
        std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() -
                                                             stoppedAt);

    if (programCounters.empty())
    {
        // Nothing came back. A thread that has gone is ordinary, threads come and go all the time,
        // and the caller drops it. Anything else is a stack this build of the unwinder could not
        // follow, and saying so in the graph is better than a hole.
        if (ProcRead::threadState(_pid, tid) == 0)
        {
            reason = "Thread " + std::to_string(tid) + " has gone.";
            return false;
        }

        LOG_DBG("Stack sampler could not walk thread " << tid << " of " << _pid << ": "
                                                       << libdwError(result));
        sample.tid = tid;
        sample.frames.assign(1, "[unwind failed]");
        sample.unresolvedFrames = 1;
        sample.stoppedFor = stoppedFor;
        sample.cut = true;
    }
    else
    {
        sample.tid = tid;
        sample.frames.clear();
        sample.frames.reserve(programCounters.size());
        sample.unresolvedFrames = 0;
        sample.stoppedFor = stoppedFor;
        sample.cut = context.cut;

        for (const uintptr_t programCounter : programCounters)
        {
            bool resolved = false;
            sample.frames.push_back(labelFor(programCounter, resolved));
            if (!resolved)
                ++sample.unresolvedFrames;
        }
    }

    auto name = _state->threadNames.find(tid);
    if (name == _state->threadNames.end())
    {
        name = _state->threadNames
                   .emplace(tid, StackText::foldThreadName(ProcRead::threadName(_pid, tid)))
                   .first;
    }
    sample.threadName = name->second;

    return true;
}

#else // !ENABLE_LIBDW

unsigned StackWalker::warmModules() { return 0; }

bool StackWalker::refreshModules(std::string& reason)
{
    reason = "This build has no libdw from elfutils.";
    return false;
}

const std::string& StackWalker::labelFor(uintptr_t, bool& resolved)
{
    static const std::string Unavailable("[no libdw]");
    resolved = false;
    return Unavailable;
}

bool StackWalker::sampleThread(pid_t, Sample&, std::string& reason)
{
    reason = "This build has no libdw from elfutils.";
    return false;
}

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
