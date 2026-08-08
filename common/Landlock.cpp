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
 * Landlock offers un-privileged restrictions of access to the file-system
 * to lock-down the environment, and to stop document processes seeing each
 * other. While stat() etc. still function, document jails include hard
 * random path elements to make them un-guessable.
 */

#include <config.h>

#include "Landlock.hpp"

#include <common/Log.hpp>

#ifdef __linux__
#  include <linux/landlock.h>
#  include <linux/prctl.h>
#  include <sys/prctl.h>
#  include <sys/syscall.h>
#  include <unistd.h>
#endif // __linux__

namespace Landlock {

#ifndef __linux__
bool lock(const std::vector<Permission> &perms)
{
    return false;
}
#else // is linux:

static const uint64_t AllowedToRead = \
    LANDLOCK_ACCESS_FS_READ_FILE |
    LANDLOCK_ACCESS_FS_READ_DIR;

static const uint64_t AllowedToWrite = \
    LANDLOCK_ACCESS_FS_WRITE_FILE;

static const uint64_t AllowedToWriteDir = \
    LANDLOCK_ACCESS_FS_REMOVE_DIR |
    LANDLOCK_ACCESS_FS_REMOVE_FILE |
    LANDLOCK_ACCESS_FS_MAKE_DIR |
    LANDLOCK_ACCESS_FS_MAKE_REG |
    LANDLOCK_ACCESS_FS_MAKE_SYM;

namespace {

bool addPerm(int rules, const Permission &perm)
{
    bool success = true;
    struct landlock_path_beneath_attr subPath = {0,};

    subPath.allowed_access = AllowedToRead;

    switch (perm._access) {
    case Access::ReadOnly:
    case Access::ReadOnlyDir:
        break; // no-op
    case Access::ReadWrite:
        subPath.allowed_access |= AllowedToWrite;
    case Access::ReadWriteDir:
        subPath.allowed_access |= AllowedToWrite;
        subPath.allowed_access |= AllowedToWriteDir;
        break;
    }

    subPath.parent_fd = open(perm._path, O_PATH | O_CLOEXEC);
    if (subPath.parent_fd == -1)
    {
        LOG_SYS("Failed to open '" << perm._path << "'");
        success = false;
    }
    if (landlock_add_rule(rules, LANDLOCK_RULE_PATH_BENEATH, &subPath, 0))
    {
        LOG_SYS("Failed to add '" << perm._path <<
                "' to ruleset with perms " << subPath.allowed_access);
        success = false;
    }
    close(subPath.parent_fd);
    return success;
}

} // anonymous namespace

bool lock(const std::vector<Permission> &perms)
{
    int abi = landlock_create_ruleset(
        nullptr, 0, LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 0)
    {
        LOG_SYS("Landlock not present or enabled");
        return false;
    }

    // we work nicely with the oldest abi anyway

    struct landlock_ruleset_attr attr = {0,};

    attr.handled_access_fs =
        LANDLOCK_ACCESS_FS_EXECUTE |
        LANDLOCK_ACCESS_FS_WRITE_FILE |
        LANDLOCK_ACCESS_FS_READ_FILE |
        LANDLOCK_ACCESS_FS_READ_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_FILE |
        LANDLOCK_ACCESS_FS_MAKE_DIR |
        LANDLOCK_ACCESS_FS_MAKE_REG |
        LANDLOCK_ACCESS_FS_MAKE_SYM;

    int rules;
    rules = landlock_create_ruleset(&attr, sizeof(attr), 0);
    if (rules < 0)
    {
        LOG_SYS("Landlock can't create ruleset");
        return false;
    }

    bool success = true;

    // we allow access to already system protected file paths
    success = success && addPerm(rules, Permission("/etc", Access::ReadOnlyDir));

    success = success && addPerm(rules, Permission("/usr", Access::ReadOnlyDir));
    success = success && addPerm(rules, Permission("/lib", Access::ReadOnlyDir));
    success = success && addPerm(rules, Permission("/lib64", Access::ReadOnlyDir));

    // fonts and fontconfig cache
    success = success && addPerm(rules, Permission("/var", Access::ReadOnlyDir));
    if (!access("/nix"))
        success = success && addPerm(rules, Permission("/nix", Access::ReadOnlyDir));
    for (const auto &perm : perms)
        success = success && addPerm(rules, perm);

    if (success && landlock_restrict_self(rules, 0))
    {
        LOG_SYS("Failed to enforce landlock rules");
        success = false;
    }
    close(rules);

    // seccomp does this already but lets do it again just in case.
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0))
    {
        LOG_ERR("Cannot turn off acquisition of new privileges for us & children");
        success = false;
    }

    return success;
}

#endif // __linux__

void setAllowedPaths(const std::vector<Permission> &perms)
{
    std::string envVar;
    for (const auto &perm : perms)
    {
        switch (perm._access) {
        case Access::ReadOnly:
        case Access::ReadOnlyDir:
            envVar += ":w:";
            break;
        case Access::ReadWrite:
        case Access::ReadWriteDir:
            envVar += ":r:";
            break;
        }
        envVar += perm._path;
    }
    ::setenv("SAL_ALLOWED_PATHS", envVar.c_str(), 1);
}
} // namespace Landlock

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
