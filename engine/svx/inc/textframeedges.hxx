/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <tools/gen.hxx>
#include <tools/long.hxx>

class SdrTextObj;

namespace svx
{
/// Moves the edges of rRectangle, the frame of rTextObj, so that the frame is nWidth wide and
/// nHeight high, measured from one edge to the other, in each direction where bWidth or bHeight
/// is set. The edges move the way they move when the frame grows around its text: away from the
/// side the text is anchored to, and turned with the object when it is rotated. Returns whether
/// the rectangle changed.
bool MoveTextFrameEdges(const SdrTextObj& rTextObj, tools::Rectangle& rRectangle,
                        tools::Long nWidth, tools::Long nHeight, bool bWidth, bool bHeight);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
