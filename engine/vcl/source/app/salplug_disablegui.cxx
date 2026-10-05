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

#include <cstdio>
#include <rtl/bootstrap.hxx>
#include <rtl/process.h>
#include <salinst.hxx>
#include <sal/backtrace.hxx>
#include <sal/log.hxx>
#include <svdata.hxx>
#include <vcl/svapp.hxx>
#include <staticsalinstance.hxx>

#if defined(ANDROID)
#include <android/androidinst.hxx>
#endif

#if defined(_WIN32)
#include <stdlib.h>
#else
#include <unistd.h>
#endif

#if ENABLE_HEADLESS
#include <headless/svpdata.hxx>
#include <headless/svpinst.hxx>
#endif

namespace {

#if ENABLE_HEADLESS
SalInstance* svp_create_SalInstance()
{
    SvpSalInstance* pInstance = new SvpSalInstance(std::make_unique<SvpSalYieldMutex>());
    new SvpSalData();
    return pInstance;
}
#endif


// HACK to obtain Application::IsHeadlessModeEnabled early on, before
// Application::EnableHeadlessMode has potentially been called:
bool IsHeadlessModeRequested()
{
    if (Application::IsHeadlessModeEnabled()) {
        return true;
    }
    sal_uInt32 n = rtl_getAppCommandArgCount();
    for (sal_uInt32 i = 0; i < n; ++i) {
        OUString arg;
        rtl_getAppCommandArg(i, &arg.pData);
        if ( arg == "--headless" || arg == "-headless" ) {
            return true;
        }
    }
    return false;
}

} // anonymous namespace

SalInstance *CreateSalInstance()
{
    OUString aUsePlugin;
    rtl::Bootstrap::get(u"SAL_USE_VCLPLUGIN"_ustr, aUsePlugin);
    SAL_INFO_IF(!aUsePlugin.isEmpty(), "vcl.plugadapt", "Requested VCL plugin: " << aUsePlugin);

    if (Application::IsBitmapRendering() || (aUsePlugin.isEmpty() && IsHeadlessModeRequested()))
        aUsePlugin = u"svp"_ustr;

    if (aUsePlugin == "svp")
    {
        Application::EnableBitmapRendering();
#if ENABLE_HEADLESS
        return svp_create_SalInstance();
#else
        aUsePlugin.clear();
#endif
    }

    return create_SalInstance();
}

void DestroySalInstance( SalInstance *pInst )
{
    delete pInst;
}

const OUString& SalGetDesktopEnvironment()
{
    static constexpr OUString aDesktopEnvironment(u"headless"_ustr);
    return aDesktopEnvironment;
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
