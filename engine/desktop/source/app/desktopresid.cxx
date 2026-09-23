/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <sal/config.h>

#include <unotools/resmgr.hxx>

#include <desktopresid.hxx>

OUString DesktopResId(TranslateId aId)
{
    // "dkt" is the catalogue desktop/AllLangMoTarget_dkt.mk builds from
    // translations/source/<lang>/desktop/messages.po.
    static std::locale SINGLETON = Translate::Create("dkt");
    return Translate::get(aId, SINGLETON);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
