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

#include <test/bootstrapfixture.hxx>

#include <basegfx/matrix/b2dhommatrixtools.hxx>
#include <drawinglayer/primitive2d/mediaprimitive2d.hxx>
#include <vcl/bitmap.hxx>
#include <vcl/graph.hxx>

using namespace drawinglayer;

namespace
{
class MediaPrimitive2dTest : public test::BootstrapFixture
{
public:
    MediaPrimitive2dTest()
        : BootstrapFixture(true, false)
    {
    }

    static Graphic createImage(const Color& rColor)
    {
        Bitmap aBitmap(Size(4, 4), vcl::PixelFormat::N24_BPP);
        aBitmap.Erase(rColor);
        return Graphic(aBitmap);
    }

    static rtl::Reference<primitive2d::MediaPrimitive2D> createVideo(const Graphic& rSnapshot)
    {
        return new primitive2d::MediaPrimitive2D(
            basegfx::utils::createScaleTranslateB2DHomMatrix(200.0, 100.0, 10.0, 20.0),
            u"file:///video.mp4"_ustr, basegfx::BColor(0.2, 0.2, 0.2), 4, rSnapshot);
    }
};

// A video that gets a preview image in place of its placeholder is drawn again with the image.
CPPUNIT_TEST_FIXTURE(MediaPrimitive2dTest, testNewSnapshotIsDrawn)
{
    const rtl::Reference<primitive2d::MediaPrimitive2D> xPlaceholder
        = createVideo(createImage(COL_GRAY));
    const rtl::Reference<primitive2d::MediaPrimitive2D> xPoster = createVideo(createImage(COL_RED));

    CPPUNIT_ASSERT(!xPlaceholder->operator==(*xPoster));
}

// The same image in another graphic leaves the drawn video as it is.
CPPUNIT_TEST_FIXTURE(MediaPrimitive2dTest, testSameSnapshotKeepsTheVideo)
{
    const rtl::Reference<primitive2d::MediaPrimitive2D> xFirst = createVideo(createImage(COL_RED));
    const rtl::Reference<primitive2d::MediaPrimitive2D> xSecond = createVideo(createImage(COL_RED));

    CPPUNIT_ASSERT(xFirst->operator==(*xSecond));
}

} // anonymous namespace

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
