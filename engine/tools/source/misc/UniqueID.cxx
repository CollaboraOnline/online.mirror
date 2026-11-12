/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <tools/UniqueID.hxx>
#include <atomic>

namespace
{
// the next id the counter gives, for all threads
std::atomic<sal_uInt64>& counter()
{
    static std::atomic<sal_uInt64> staticCounter(1);
    return staticCounter;
}

// the reserved id the next one made in this thread takes, nought for none
thread_local sal_uInt64 nGivenNext = 0;
}

UniqueID::UniqueID()
{
    if (nGivenNext)
    {
        mnID = nGivenNext;
        nGivenNext = 0;
    }
    else
        mnID = counter().fetch_add(1);
}

sal_uInt64 UniqueID::reserve(sal_uInt64 nCount) { return counter().fetch_add(nCount); }

void UniqueID::giveNext(sal_uInt64 nId) { nGivenNext = nId; }

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
