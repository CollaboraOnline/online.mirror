/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <swmodeltestbase.hxx>

#include <com/sun/star/beans/PropertyValue.hpp>

#include <comphelper/propertyvalue.hxx>
#include <comphelper/scopeguard.hxx>
#include <svl/intitem.hxx>

#include <docsh.hxx>
#include <doc.hxx>
#include <hintids.hxx>
#include <ndtxt.hxx>
#include <swdtflvr.hxx>
#include <wrtsh.hxx>

using namespace css;
using namespace cpo;

namespace
{
/// Covers sw/source/core/txtnode/ndtxt.cxx fixes.
class SwCoreNdtxtTest : public SwModelTestBase
{
public:
    SwCoreNdtxtTest()
        : SwModelTestBase(u"/sw/qa/core/txtnode/data/"_ustr)
    {
    }
};
}

CPPUNIT_TEST_FIXTURE(SwCoreNdtxtTest, testMergedPasteListLevelShift)
{
    // Given a Writer document whose "target" paragraph is at list level 1,
    // with the cursor on it:
    createSwDoc();
    SwDoc* pDoc = getSwDocShell()->GetDoc();
    {
        cpo::uno::Sequence<beans::PropertyValue> aTargetArgs
            = { comphelper::makePropertyValue(
                u"Name"_ustr, createFileURL(u"merged-paste-list-target.html")) };
        dispatchCommand(mxComponent, u".uno:InsertDoc"_ustr, aTargetArgs);
    }
    SwNodes& rNodes = pDoc->GetNodes();
    SwTextNode* pOrigDest = nullptr;
    for (SwNodeOffset i(0); i < rNodes.Count(); ++i)
    {
        SwTextNode* pCandidate = rNodes[i]->GetTextNode();
        if (pCandidate && pCandidate->GetText() == u"target")
        {
            pOrigDest = pCandidate;
            break;
        }
    }
    CPPUNIT_ASSERT(pOrigDest);
    CPPUNIT_ASSERT_EQUAL(1, pOrigDest->GetAttrListLevel());
    SwWrtShell* pWrtShell = getSwDocShell()->GetWrtShell();
    pWrtShell->GetCursor()->GetPoint()->Assign(*pOrigDest,
                                               pOrigDest->GetText().getLength());

    // When pasting a nested unordered list at that cursor position, with merged paste:
    pDoc->SetInMergedPaste(true);
    pDoc->SetMergedPasteOrigDestNode(pOrigDest);
    auto pParaAttrs = std::make_shared<SfxItemSet>(pOrigDest->GetSwAttrSet());
    pParaAttrs->Put(SfxInt16Item(RES_PARATR_LIST_LEVEL,
                                 static_cast<sal_Int16>(pOrigDest->GetAttrListLevel())));
    pDoc->SetMergedPasteParaAttrs(pParaAttrs);
    comphelper::ScopeGuard g([pDoc] {
        pDoc->SetInMergedPaste(false);
        pDoc->SetMergedPasteOrigDestNode(nullptr);
        pDoc->SetMergedPasteParaAttrs(nullptr);
    });
    cpo::uno::Sequence<beans::PropertyValue> aArgs
        = { comphelper::makePropertyValue(u"Name"_ustr, createFileURL(u"merged-paste-list.html")) };
    dispatchCommand(mxComponent, u".uno:InsertDoc"_ustr, aArgs);

    // Then the pasted "inner" bullet (clipboard depth 1) lands at level 2,
    // the clipboard's own depth shifted by the paste position's level:
    SwTextNode* pInnerNode = nullptr;
    for (SwNodeOffset i(0); i < rNodes.Count(); ++i)
    {
        SwTextNode* pCandidate = rNodes[i]->GetTextNode();
        if (pCandidate && pCandidate->GetText() == u"inner")
        {
            pInnerNode = pCandidate;
            break;
        }
    }
    CPPUNIT_ASSERT(pInnerNode);
    // Without the accompanying fix in place, this test would have failed with
    // level 1, the clipboard's own depth, not shifted by the paste position's
    // level.
    CPPUNIT_ASSERT_EQUAL(2, pInnerNode->GetAttrListLevel());
}

CPPUNIT_TEST_FIXTURE(SwCoreNdtxtTest, testMergedPasteListLevelShiftInternal)
{
    // Given a Writer document whose first three paragraphs are a three-level list ("Level 1"/
    // "Level 2"/"Level 3") and whose last paragraph is an empty list item at UI list level 2:
    createSwDoc("merged-paste-list-internal.odt");
    SwDoc* pDoc = getSwDocShell()->GetDoc();
    SwNodes& rNodes = pDoc->GetNodes();
    SwTextNode* pLevel1Src = nullptr;
    SwTextNode* pLevel3Src = nullptr;
    SwTextNode* pOrigDest = nullptr;
    for (SwNodeOffset i(0); i < rNodes.Count(); ++i)
    {
        SwTextNode* pCandidate = rNodes[i]->GetTextNode();
        if (!pCandidate)
        {
            continue;
        }
        if (!pLevel1Src && pCandidate->GetText() == u"Level 1")
        {
            pLevel1Src = pCandidate;
        }
        if (!pLevel3Src && pCandidate->GetText() == u"Level 3")
        {
            pLevel3Src = pCandidate;
        }
        pOrigDest = pCandidate;
    }
    CPPUNIT_ASSERT(pLevel1Src);
    CPPUNIT_ASSERT(pLevel3Src);
    CPPUNIT_ASSERT(pOrigDest);
    // Internally 0-based.
    CPPUNIT_ASSERT_EQUAL(1, pOrigDest->GetAttrListLevel());
    // Select the three source paragraphs:
    SwWrtShell* pWrtShell = getSwDocShell()->GetWrtShell();
    pWrtShell->GetCursor()->GetPoint()->Assign(*pLevel1Src, 0);
    pWrtShell->GetCursor()->SetMark();
    pWrtShell->GetCursor()->GetPoint()->Assign(*pLevel3Src, pLevel3Src->GetText().getLength());
    // Copy them to the internal clipboard:
    rtl::Reference<SwTransferable> xTransfer = new SwTransferable(*pWrtShell);
    xTransfer->Copy();

    // When placing the cursor at the end of the trailing empty list item, then merged-pasting the
    // clipboard there:
    pWrtShell->GetCursor()->DeleteMark();
    pWrtShell->GetCursor()->GetPoint()->Assign(*pOrigDest, pOrigDest->GetText().getLength());
    pDoc->SetInMergedPaste(true);
    pDoc->SetMergedPasteOrigDestNode(pOrigDest);
    auto pParaAttrs = std::make_shared<SfxItemSet>(pOrigDest->GetSwAttrSet());
    pParaAttrs->Put(SfxInt16Item(RES_PARATR_LIST_LEVEL,
                                 static_cast<sal_Int16>(pOrigDest->GetAttrListLevel())));
    pDoc->SetMergedPasteParaAttrs(pParaAttrs);
    comphelper::ScopeGuard g(
        [pDoc]
        {
            pDoc->SetInMergedPaste(false);
            pDoc->SetMergedPasteOrigDestNode(nullptr);
            pDoc->SetMergedPasteParaAttrs(nullptr);
        });
    TransferableDataHelper aHelper(xTransfer);
    SwTransferable::Paste(*pWrtShell, aHelper);

    // Then the pasted paragraphs land at UI levels 2, 3, 4: the clipboard's own depth shifted by
    // the paste position's level.
    SwTextNode* pPastedL1 = nullptr;
    SwTextNode* pPastedL2 = nullptr;
    SwTextNode* pPastedL3 = nullptr;
    for (SwNodeOffset i = rNodes.Count() - 1; i >= SwNodeOffset(0); --i)
    {
        SwTextNode* pCandidate = rNodes[i]->GetTextNode();
        if (!pCandidate)
        {
            continue;
        }
        if (!pPastedL3 && pCandidate->GetText() == u"Level 3")
        {
            pPastedL3 = pCandidate;
            continue;
        }
        if (pPastedL3 && !pPastedL2 && pCandidate->GetText() == u"Level 2")
        {
            pPastedL2 = pCandidate;
            continue;
        }
        if (pPastedL2 && !pPastedL1 && pCandidate->GetText() == u"Level 1")
        {
            pPastedL1 = pCandidate;
            break;
        }
    }
    CPPUNIT_ASSERT(pPastedL1);
    CPPUNIT_ASSERT(pPastedL2);
    CPPUNIT_ASSERT(pPastedL3);
    // Without the accompanying fix, this would have failed with:
    // - Expected: the internal list levels are 1,2,3
    // - Actual  : the internal list levels are 2,3,3
    // i.e. only the last bullet was correct.
    CPPUNIT_ASSERT_EQUAL(1, pPastedL1->GetAttrListLevel());
    CPPUNIT_ASSERT_EQUAL(2, pPastedL2->GetAttrListLevel());
    CPPUNIT_ASSERT_EQUAL(3, pPastedL3->GetAttrListLevel());
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
