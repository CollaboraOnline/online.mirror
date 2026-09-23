/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <rtl/ustring.hxx>

namespace desktop
{
/// The name of the pipe that makes a second start talk to the running process.
/// It is derived from the user installation path, so one profile is one office.
OUString generateOfficePipeId();
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
