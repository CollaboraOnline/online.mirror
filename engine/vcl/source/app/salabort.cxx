/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This file incorporates work covered by the following license notice:
 *
 *   Licensed to the Apache Software Foundation (ASF) under one or more
 *   contributor license agreements. See the NOTICE file distributed
 *   with this work for additional information regarding copyright
 *   ownership. The ASF licenses this file to you under the Apache
 *   License, Version 2.0 (the "License"); you may not use this file
 *   except in compliance with the License. You may obtain a copy of
 *   the License at http://www.apache.org/licenses/LICENSE-2.0 .
 */


#include <config_features.h>
#include <config_vclplug.h>

#include <cstdio>
#include <salinst.hxx>
#include <sal/backtrace.hxx>
#include <sal/log.hxx>
#include <svdata.hxx>
#include <vcl/svapp.hxx>

#if defined(iOS)
#include <premac.h>
#include <UIKit/UIKit.h>
#include <postmac.h>
#elif defined(ANDROID)
#include <android/androidinst.hxx>
#endif

#if defined(_WIN32)
#include <o3tl/char16_t2wchar_t.hxx>
#include <salframe.hxx>
#include <Windows.h>
#else
#include <unistd.h>
#endif

void SalAbort( const OUString& rErrorText, bool bDumpCore )
{
    if (GetSalInstance())
        GetSalInstance()->BeforeAbort(rErrorText, bDumpCore);

#if defined _WIN32
    if( rErrorText.isEmpty() )
    {
        // make sure crash reporter is triggered
        RaiseException( 0, EXCEPTION_NONCONTINUABLE, 0, nullptr );
        FatalAppExitW( 0, L"Application Error" );
    }
    else
    {
        // make sure crash reporter is triggered
        RaiseException( 0, EXCEPTION_NONCONTINUABLE, 0, nullptr );
        FatalAppExitW( 0, o3tl::toW(rErrorText.getStr()) );
    }
#else // !_WIN32
#if defined ANDROID
    OUString aError(rErrorText.isEmpty() ? u"Unspecified application error"_ustr : rErrorText);
    LOGE("SalAbort: '%s'", OUStringToOString(aError, osl_getThreadTextEncoding()).getStr());
#elif defined(iOS)
    NSLog(@"SalAbort: %s", OUStringToOString(rErrorText, osl_getThreadTextEncoding()).getStr());
#else
    OUString sMsg = rErrorText;
    if( sMsg.isEmpty() )
        sMsg = u"Unspecified Application Error"_ustr;
    std::unique_ptr<sal::BacktraceState> backtrace = sal::backtrace_get( 32 );
    sMsg += "\n" + sal::backtrace_to_string( backtrace.get() );
    std::fprintf( stderr, "%s\n", OUStringToOString(sMsg, osl_getThreadTextEncoding()).getStr() );
#endif
    if( bDumpCore )
        abort();
    else
        _exit(1);
#endif // !_WIN32
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
