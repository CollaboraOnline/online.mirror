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

// The current high-level preprocessor structure is:
//
// if !HAVE_FEATURE_UI
//   => STATIC_SAL_INSTANCE
// else
//   ? !STATIC_SAL_INSTANCE
//   ? UNIX_DESKTOP_DETECT
// endif
//

#include <config_features.h>
#include <config_vclplug.h>

// We are splitting this rather complex code along the HAVE_FEATURE_UI axis,
// to reduce the complexity a little.

#if HAVE_FEATURE_UI
#include "salplug_enablegui.cxx"
#else
#include "salplug_disablegui.cxx"
#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
