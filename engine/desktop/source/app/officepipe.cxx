/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <sal/config.h>

#include <cstddef>
#include <vector>

#include <comphelper/hash.hxx>
#include <cpo/uno/Exception.hpp>
#include <rtl/ustrbuf.hxx>
#include <unotools/bootstrap.hxx>

#include <officepipe.hxx>

using cpo::uno::Exception;

namespace desktop
{
OUString generateOfficePipeId()
{
    // The name of the named pipe is created with the hashcode of the user installation directory
    // (without /user). We have to retrieve this information from a unotools implementation.

    OUString userPath;
    ::utl::Bootstrap::PathStatus aLocateResult = ::utl::Bootstrap::locateUserInstallation(userPath);
    if (aLocateResult != ::utl::Bootstrap::PATH_EXISTS
        && aLocateResult != ::utl::Bootstrap::PATH_VALID)
    {
        throw Exception(u"Could not obtain path for UserInstallation."_ustr, nullptr);
    }

    sal_uInt8 const* data = reinterpret_cast<sal_uInt8 const*>(userPath.getStr());
    std::size_t size = userPath.getLength() * sizeof(sal_Unicode);

    std::vector<unsigned char> hash{ ::comphelper::Hash::calculateHash(
        data, size, ::comphelper::HashType::MD5) };

    // create hex-value string from the MD5 value to keep
    // the string size minimal
    OUStringBuffer buf("SingleOfficeIPC_");
    for (unsigned char b : hash)
    {
        buf.append(static_cast<sal_Int32>(b), 0x10);
    }
    return buf.makeStringAndClear();
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
