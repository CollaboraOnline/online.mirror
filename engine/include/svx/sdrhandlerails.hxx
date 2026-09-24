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

#include <basegfx/point/b2dpoint.hxx>

/** The shape of the freedom a handle has.

    A handle of an object either cannot be moved at all, runs along a line, moves anywhere inside
    a box, or turns about a point. Those four cover every handle the drawing layer offers: the
    corner radius of a rectangle runs along the upper side, the angles of a piece of a circle turn
    about its middle, a point a custom shape is shaped by does any of the four depending on the
    shape, and the offsets of a measurement run along lines of their own.
 */
enum class SdrHandleRailKind
{
    Nowhere,
    Along,
    Inside,
    Around
};

/** How far one handle of an object may be moved.

    Every place is given in the object's own logic coordinates, the same ones SdrHdl::GetPos
    answers in, so that whoever reads them needs to know nothing about how the object is turned or
    which way it faces. A place that is not given leaves that side open.
 */
struct SdrHandleRails
{
    SdrHandleRailKind meKind = SdrHandleRailKind::Nowhere;

    /** Along and Inside: whether the handle moves on each of the object's two ways, and the
        places it is held between on each of them. A handle that moves on one way only stays
        where it is on the other.
     */
    bool mbMovesAcross = false;
    bool mbMovesDown = false;
    bool mbHasLeastAcross = false;
    bool mbHasMostAcross = false;
    bool mbHasLeastDown = false;
    bool mbHasMostDown = false;
    basegfx::B2DPoint maLeastAcross;
    basegfx::B2DPoint maMostAcross;
    basegfx::B2DPoint maLeastDown;
    basegfx::B2DPoint maMostDown;

    /// Around: the point the handle turns about.
    basegfx::B2DPoint maAround;

    /** Around: the nearest and furthest the handle may come to that point, each given as a place
        it would stand at.
     */
    bool mbHasNearest = false;
    bool mbHasFurthest = false;
    basegfx::B2DPoint maNearest;
    basegfx::B2DPoint maFurthest;

    /** Around: the two ends of the piece of the way round the handle may take, each given as a
        place it would stand at. Neither given means it may go the whole way round.
     */
    bool mbHasFrom = false;
    bool mbHasTo = false;
    basegfx::B2DPoint maFrom;
    basegfx::B2DPoint maTo;

    /** Whether the handle keeps a length of its own when the object is made larger or smaller,
        rather than travelling with it. The corner radius of a rectangle is such a length; a point
        a custom shape is shaped by is a share of the shape and travels with it.
     */
    bool mbKeepsItsLength = false;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
