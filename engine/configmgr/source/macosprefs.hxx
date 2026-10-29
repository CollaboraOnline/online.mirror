/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 */

#pragma once

#include <sal/config.h>

#include <premac.h>
#include <CoreFoundation/CoreFoundation.h>
#include <postmac.h>

#include <rtl/ustring.hxx>

namespace configmgr
{
struct TempFile;

// Writes one <item> element per configuration key (a key that starts with '/') found in prefs
// to out, in sorted key order. Keys contained in forcedKeys were delivered by a configuration
// profile; only those may be marked Final. See macosprefs.mm for the key and value format.
void writeMacOSPreferencesXcu(CFDictionaryRef prefs, CFSetRef forcedKeys, TempFile& out);

// Dumps the configuration keys found in the application's preferences (managed preferences from
// an MDM configuration profile, plus plain user defaults) into a temporary .xcu file whose URL is
// returned in *pFileURL. Returns false when there is nothing to dump.
bool dumpMacOSPreferences(OUString* pFileURL);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
