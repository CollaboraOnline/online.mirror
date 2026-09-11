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

#include <cerrno>
#include <cstring>

#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <unistd.h>

#include <common/Log.hpp>
#include <net/Socket.hpp>

namespace net
{

void shutdownDescriptor(int descriptor) { ::shutdown(descriptor, SHUT_RDWR); }

void closeDescriptor(int descriptor) { ::close(descriptor); }

ssize_t writeDescriptor(int descriptor, const void* buffer, std::size_t length)
{
    return ::write(descriptor, buffer, length);
}

void disableNagleAlgorithm(int descriptor)
{
    const int value = 1;
    if (::setsockopt(descriptor, IPPROTO_TCP, TCP_NODELAY, &value, sizeof(value)) == -1)
    {
        LOG_WRN_ONCE("Failed setsockopt TCP_NODELAY. Will not report further "
                     "failures to set TCP_NODELAY: "
                     << strerror(errno));
    }
}

} // namespace net

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
