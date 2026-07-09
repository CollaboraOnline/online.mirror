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

#include "Util.hpp"

#ifdef __linux__
#include <sys/time.h>
#include <sys/resource.h>
#elif defined __FreeBSD__
#include <sys/resource.h>
#include <libutil.h>
#include <sys/user.h>
#endif

#include <dirent.h>

#include <fstream>
#include <iomanip>
#include <unistd.h>

#include <Poco/Exception.h>
#include "Log.hpp"

namespace Util
{

class CounterImpl {
private:
    DIR* _dir = nullptr;

public:
#ifdef __linux__
    CounterImpl(const char* procPath)
        : _dir(opendir(procPath))
    {
        if (!_dir)
            LOG_ERR("No proc mounted for procPath " << procPath << ", can't count threads");
    }
#else
    CounterImpl(__unused const char* procPath) {
    }
#endif
    ~CounterImpl() {
#ifdef __linux__
closedir(_dir);
#endif
}

    int count()
    {
#ifdef __linux__
        if (!_dir)
            return -1;

        rewinddir(_dir);

        int tasks = 0;
        struct dirent* i;
        while ((i = readdir(_dir)))
        {
            if (i->d_name[0] != '.')
                tasks++;
        }

        return tasks;
#endif
#ifdef __FreeBSD__
struct kinfo_proc* ki = kinfo_getproc(getpid());
return ki->ki_numthreads;
#endif
    }
};

ThreadCounter::ThreadCounter() : _impl(new CounterImpl("/proc/self/task")) {}

ThreadCounter::~ThreadCounter() = default;

int ThreadCounter::count() { return _impl->count(); }

FDCounter::FDCounter() : _impl(new CounterImpl("/proc/self/fd")) {}

FDCounter::~FDCounter() = default;

int FDCounter::count() { return _impl->count(); }

} // namespace Util

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
