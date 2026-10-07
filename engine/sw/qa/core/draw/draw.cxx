/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <swmodeltestbase.hxx>

#include <svx/svdpage.hxx>

#include <IDocumentDrawModelAccess.hxx>
#include <docsh.hxx>
#include <drawdoc.hxx>
#include <wrtsh.hxx>
#include <frameformats.hxx>
#include <textboxhelper.hxx>

#include <com/sun/star/awt/Rectangle.hpp>
#include <com/sun/star/drawing/PointSequenceSequence.hpp>
#include <com/sun/star/table/BorderLine2.hpp>
#include <com/sun/star/text/XTextFramesSupplier.hpp>

using namespace css;
using namespace ::cpo;
using namespace ::cpo::uno;

/// Covers sw/source/core/draw/ fixes.
class SwCoreDrawTest : public SwModelTestBase
{
public:
    SwCoreDrawTest()
        : SwModelTestBase(u"/sw/qa/core/draw/data/"_ustr)
    {
    }
};

CPPUNIT_TEST_FIXTURE(SwCoreDrawTest, testTextboxDeleteAsChar)
{
    // Load a document with an as-char shape in it that has a textbox and an image in it.
    createSwDoc("as-char-textbox.docx");
    SwDoc* pDoc = getSwDoc();
    SwWrtShell* pWrtShell = getSwDocShell()->GetWrtShell();
    SdrPage* pPage = pDoc->getIDocumentDrawModelAccess().GetDrawModel()->GetPage(0);
    sal_Int32 nActual = pPage->GetObjCount();
    // 3 objects on the draw page: a shape + fly frame pair and a Writer image.
    CPPUNIT_ASSERT_EQUAL(static_cast<sal_Int32>(3), nActual);

    // Select the shape of the textbox and delete it.
    SdrObject* pObject = pPage->GetObj(0);
    pWrtShell->SelectObj(Point(), 0, pObject);
    pWrtShell->DelSelectedObj();
    nActual = pPage->GetObjCount();

    // Without the accompanying fix in place, this test would have failed with:
    // - Expected: 0
    // - Actual  : 2
    // i.e. the fly frame of the shape and the inner Writer image was not deleted.
    CPPUNIT_ASSERT_EQUAL(static_cast<sal_Int32>(0), nActual);
}

CPPUNIT_TEST_FIXTURE(SwCoreDrawTest, testTextboxUndoOrdNum)
{
    // Given a document with 5 frame formats:
    // - picture
    // - draw format + fly format and a picture in it
    // - picture
    createSwDoc("textbox-undo-ordnum.docx");
    SwDoc* pDoc = getSwDoc();
    SwWrtShell* pWrtShell = getSwDocShell()->GetWrtShell();
    const auto& rFormats = *pDoc->GetSpzFrameFormats();
    // Test the state before del + undo.
    for (const auto& pFormat : rFormats)
    {
        const SwFrameFormat* pFlyFormat
            = SwTextBoxHelper::getOtherTextBoxFormat(pFormat, RES_DRAWFRMFMT);
        if (!pFlyFormat)
        {
            continue;
        }

        sal_Int32 nDrawOrdNum = pFormat->FindRealSdrObject()->GetOrdNum();
        sal_Int32 nFlyOrdNum = pFlyFormat->FindRealSdrObject()->GetOrdNum();
        CPPUNIT_ASSERT_EQUAL(nDrawOrdNum + 1, nFlyOrdNum);
    }

    // When selecting the first page, deleting the selection and undoing:
    pWrtShell->Down(true, 3);
    pWrtShell->DelLeft();
    pWrtShell->Undo();

    // Then the z-order of the fly format should be still the z-order of the draw format + 1, when
    // the fly and draw formats form a textbox pair.
    for (const auto& pFormat : rFormats)
    {
        const SwFrameFormat* pFlyFormat
            = SwTextBoxHelper::getOtherTextBoxFormat(pFormat, RES_DRAWFRMFMT);
        if (!pFlyFormat)
        {
            continue;
        }

        sal_Int32 nDrawOrdNum = pFormat->FindRealSdrObject()->GetOrdNum();
        sal_Int32 nFlyOrdNum = pFlyFormat->FindRealSdrObject()->GetOrdNum();
        // Without the accompanying fix in place, this test would have failed with:
        // - Expected: 4
        // - Actual  : 2
        // i.e. the fly format was behind the draw format, not visible.
        CPPUNIT_ASSERT_EQUAL(nDrawOrdNum + 1, nFlyOrdNum);
    }
}

CPPUNIT_TEST_FIXTURE(SwCoreDrawTest, testTdf107727FrameBorder)
{
    // Load a document with a textframe without border, one with only left border
    createSwDoc("tdf107727_FrameBorder.odt");

    // Export to RTF and reload
    saveAndReload(TestFilter::RTF);

    // Get frame without border and inspect it.
    uno::Reference<text::XTextFramesSupplier> xTextFramesSupplier(mxComponent, uno::UNO_QUERY);
    uno::Reference<container::XIndexAccess> xIndexAccess(xTextFramesSupplier->getTextFrames(),
                                                         uno::UNO_QUERY);
    uno::Reference<beans::XPropertySet> xFrame0(xIndexAccess->getByIndex(0), uno::UNO_QUERY);
    auto aBorder = getProperty<table::BorderLine2>(xFrame0, u"LeftBorder"_ustr);
    // fo:border="none" is not available via API, and aBorder.LineWidth has wrong value (why?).
    sal_uInt32 nBorderWidth
        = aBorder.OuterLineWidth + aBorder.InnerLineWidth + aBorder.LineDistance;
    // Without patch it failed with Expected 0, Actual 26
    CPPUNIT_ASSERT_EQUAL(static_cast<sal_uInt32>(0), nBorderWidth);

    // Get frame with left border and inspect it.
    uno::Reference<beans::XPropertySet> xFrame1(xIndexAccess->getByIndex(1), uno::UNO_QUERY);
    aBorder = getProperty<table::BorderLine2>(xFrame1, u"LeftBorder"_ustr);
    // Without patch it failed with Expected 127, Actual 26. Default border width was used.
    nBorderWidth = aBorder.OuterLineWidth + aBorder.InnerLineWidth + aBorder.LineDistance;
    CPPUNIT_ASSERT_EQUAL(static_cast<sal_uInt32>(127), nBorderWidth);
    // Without patch it failed with Expected Color: R:0 G:0 B:255 A:0, Actual Color: R:0 G:0 B:0 A:0.
    // Default border color was used.
    CPPUNIT_ASSERT_EQUAL(COL_LIGHTBLUE, Color(ColorTransparency, aBorder.Color));
}

CPPUNIT_TEST_FIXTURE(SwCoreDrawTest, testSdtTextboxHeader)
{
    // Given a 2 page document, same header on both pages, content control in the header and
    // shape+fly pair (textbox) anchored in the same header
    // When loading that document, then make sure that layout doesn't fail with an assertion because
    // the "master SdrObj should have the highest index" invariant doesn't hold:
    createSwDoc("sdt-textbox-header.docx");
}

CPPUNIT_TEST_FIXTURE(SwCoreDrawTest, testHeaderPolylineCopyPolyPolygon)
{
    // Page 2 shows an SwDrawVirtObj copy of the header's polyline.
    createSwDoc("header-polyline.fodt");
    CPPUNIT_ASSERT_EQUAL(2, getPages());
    CPPUNIT_ASSERT_EQUAL(2, getShapes());

    auto xOriginal = getShape(1).queryThrow<beans::XPropertySet>();
    auto xCopy = getShape(2).queryThrow<beans::XPropertySet>();
    auto aOriginalBounds = getProperty<awt::Rectangle>(xOriginal, u"BoundRect"_ustr);
    auto aCopyBounds = getProperty<awt::Rectangle>(xCopy, u"BoundRect"_ustr);
    if (aCopyBounds.Y < aOriginalBounds.Y)
    {
        std::swap(xOriginal, xCopy);
        std::swap(aOriginalBounds, aCopyBounds);
    }
    CPPUNIT_ASSERT_GREATER(aOriginalBounds.Y + 5000, aCopyBounds.Y);

    // The copy's points are the original's, moved as far as its bounds are.
    auto aOriginalPoints
        = getProperty<drawing::PointSequenceSequence>(xOriginal, u"PolyPolygon"_ustr);
    auto aCopyPoints = getProperty<drawing::PointSequenceSequence>(xCopy, u"PolyPolygon"_ustr);
    const sal_Int32 nDX = aCopyBounds.X - aOriginalBounds.X;
    const sal_Int32 nDY = aCopyBounds.Y - aOriginalBounds.Y;
    CPPUNIT_ASSERT_EQUAL(sal_Int32(1), aCopyPoints.getLength());
    CPPUNIT_ASSERT_EQUAL(sal_Int32(2), aCopyPoints[0].getLength());
    CPPUNIT_ASSERT_DOUBLES_EQUAL(aOriginalPoints[0][0].X + nDX, aCopyPoints[0][0].X, 2);
    // Without the accompanying fix in place, this test would have failed with:
    // - Expected: 12101
    // - Actual  : 1601
    CPPUNIT_ASSERT_DOUBLES_EQUAL(aOriginalPoints[0][0].Y + nDY, aCopyPoints[0][0].Y, 2);
    CPPUNIT_ASSERT_DOUBLES_EQUAL(aOriginalPoints[0][1].X + nDX, aCopyPoints[0][1].X, 2);
    CPPUNIT_ASSERT_DOUBLES_EQUAL(aOriginalPoints[0][1].Y + nDY, aCopyPoints[0][1].Y, 2);

    // Writing the copy's points back leaves the original where it was.
    xCopy->setPropertyValue(u"PolyPolygon"_ustr, uno::Any(aCopyPoints));
    auto aOriginalPointsAfter
        = getProperty<drawing::PointSequenceSequence>(xOriginal, u"PolyPolygon"_ustr);
    CPPUNIT_ASSERT_DOUBLES_EQUAL(aOriginalPoints[0][0].Y, aOriginalPointsAfter[0][0].Y, 2);
}

CPPUNIT_TEST_FIXTURE(SwCoreDrawTest, testResizePageRelativeFrame)
{
    // Given a frame that is 25% of the page wide:
    createSwDoc("page-relative-frame.fodt");
    SwWrtShell* pWrtShell = getSwDocShell()->GetWrtShell();
    CPPUNIT_ASSERT(pWrtShell->GotoFly(UIName(u"Frame1"_ustr), FLYCNTTYPE_FRM));
    SwRect aOldRect = pWrtShell->GetAnyCurRect(CurRectType::FlyEmbedded);
    SdrObject* pObject = pWrtShell->GetFlyFrameFormat()->FindRealSdrObject();
    CPPUNIT_ASSERT(pObject);

    // When the frame is made 60% as wide with the mouse:
    pObject->Resize(pObject->GetSnapRect().TopLeft(), 0.6, 1.0);

    // Then the frame has the new width, as a percentage of the page:
    calcLayout();
    CPPUNIT_ASSERT(pWrtShell->GotoFly(UIName(u"Frame1"_ustr), FLYCNTTYPE_FRM));
    SwRect aNewRect = pWrtShell->GetAnyCurRect(CurRectType::FlyEmbedded);
    // Without the accompanying fix in place, this test would have failed, because the new
    // percentage was measured against the paragraph area and then taken of the wider page.
    CPPUNIT_ASSERT_DOUBLES_EQUAL(aOldRect.Width() * 0.6, aNewRect.Width(), 2.0);
}

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
