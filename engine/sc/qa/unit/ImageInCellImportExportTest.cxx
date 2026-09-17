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

#include "helper/qahelper.hxx"

#include <document.hxx>
#include <drwlayer.hxx>
#include <userdat.hxx>

#include <svx/svdograf.hxx>
#include <svx/svdpage.hxx>

#include <string_view>

namespace sc
{
namespace
{
/** Returns the picture that sits in the passed cell, or nothing when no picture sits there. */
const SdrGrafObj* findPictureInCell(const ScDocument& rDocument, const ScAddress& rAddress)
{
    const ScDrawLayer* pDrawLayer = rDocument.GetDrawLayer();
    if (!pDrawLayer)
        return nullptr;

    const SdrPage* pPage = pDrawLayer->GetPage(static_cast<sal_uInt16>(rAddress.Tab()));
    if (!pPage)
        return nullptr;

    for (size_t nObject = 0; nObject < pPage->GetObjCount(); ++nObject)
    {
        SdrObject* pObject = pPage->GetObj(nObject);
        const SdrGrafObj* pPicture = dynamic_cast<const SdrGrafObj*>(pObject);
        if (!pPicture || !ScDrawLayer::IsInCellImage(*pPicture))
            continue;

        const ScDrawObjData* pObjectData = ScDrawLayer::GetObjDataTab(pObject, rAddress.Tab());
        if (pObjectData && pObjectData->maStart == rAddress)
            return pPicture;
    }
    return nullptr;
}

size_t countDrawingObjects(const ScDocument& rDocument, SCTAB nTab)
{
    const ScDrawLayer* pDrawLayer = rDocument.GetDrawLayer();
    const SdrPage* pPage
        = pDrawLayer ? pDrawLayer->GetPage(static_cast<sal_uInt16>(nTab)) : nullptr;
    return pPage ? pPage->GetObjCount() : 0;
}
}

class ImageInCellImportExportTest : public ScModelTestBase
{
public:
    ImageInCellImportExportTest()
        : ScModelTestBase(u"sc/qa/unit/data"_ustr)
    {
    }

protected:
    /** The test file holds one picture that the cells A1 and A2 both show. */
    void assertBothCellsShowTheirPicture(std::string_view aWhen)
    {
        const OString aWhenMessage(aWhen);
        ScDocument* pDocument = getScDoc();

        // The picture stands for the content of its cell, so the cell itself stays empty.
        CPPUNIT_ASSERT_EQUAL_MESSAGE(aWhenMessage.getStr(), CELLTYPE_NONE,
                                     pDocument->GetCellType(ScAddress(0, 0, 0)));
        CPPUNIT_ASSERT_EQUAL(CELLTYPE_NONE, pDocument->GetCellType(ScAddress(0, 1, 0)));

        // The cells next to them keep the text they carry, so nothing else of the row is lost.
        CPPUNIT_ASSERT_EQUAL(u"first"_ustr, pDocument->GetString(1, 0, 0));
        CPPUNIT_ASSERT_EQUAL(u"second"_ustr, pDocument->GetString(1, 1, 0));

        CPPUNIT_ASSERT_EQUAL(size_t(2), countDrawingObjects(*pDocument, 0));

        for (SCROW nRow = 0; nRow <= 1; ++nRow)
        {
            const ScAddress aAddress(0, nRow, 0);
            const SdrGrafObj* pPicture = findPictureInCell(*pDocument, aAddress);
            CPPUNIT_ASSERT_MESSAGE(aWhenMessage.getStr(), pPicture != nullptr);

            // The picture fits inside the cell it sits in.
            const tools::Rectangle aCellRect = ScDrawLayer::GetCellRect(*pDocument, aAddress, true);
            const tools::Rectangle aPictureRect = pPicture->GetLogicRect();
            CPPUNIT_ASSERT(!aPictureRect.IsEmpty());
            CPPUNIT_ASSERT(aCellRect.Contains(aPictureRect));

            // A picture that sits in a cell grows and shrinks with it.
            CPPUNIT_ASSERT(ScDrawLayer::IsResizeWithCell(*pPicture));
        }
    }
};

CPPUNIT_TEST_FIXTURE(ImageInCellImportExportTest, testPictureInCellIsShown)
{
    createScDoc("xlsx/image-in-cell.xlsx");
    assertBothCellsShowTheirPicture("after loading");
}

CPPUNIT_TEST_FIXTURE(ImageInCellImportExportTest, testPictureInCellSurvivesRoundTrip)
{
    createScDoc("xlsx/image-in-cell.xlsx");
    saveAndReload(TestFilter::XLSX);
    assertBothCellsShowTheirPicture("after a round trip through xlsx");
}

CPPUNIT_TEST_FIXTURE(ImageInCellImportExportTest, testSavedCellPointsAtItsRichValue)
{
    createScDoc("xlsx/image-in-cell.xlsx");
    save(TestFilter::XLSX);

    // Each of the two cells carries the error value and the index of its own rich value.
    xmlDocUniquePtr pSheet = parseExport(u"xl/worksheets/sheet1.xml"_ustr);
    CPPUNIT_ASSERT(pSheet);
    assertXPath(pSheet, "//x:c[@r='A1']", "t", u"e");
    assertXPath(pSheet, "//x:c[@r='A1']", "vm", u"1");
    assertXPathContent(pSheet, "//x:c[@r='A1']/x:v", u"#VALUE!");
    assertXPath(pSheet, "//x:c[@r='A2']", "vm", u"2");

    // The picture stands for the content of its cell, so the sheet has no drawing holding it a
    // second time.
    assertXPath(pSheet, "//x:drawing", 0);

    // The value metadata entry of a cell names the rich value metadata type and a block of it.
    xmlDocUniquePtr pMetadata = parseExport(u"xl/metadata.xml"_ustr);
    CPPUNIT_ASSERT(pMetadata);
    assertXPath(pMetadata, "//x:metadataType[@name='XLRICHVALUE']", 1);
    assertXPath(pMetadata, "//x:valueMetadata/x:bk", 2);
    assertXPath(pMetadata, "//x:valueMetadata/x:bk[1]/x:rc", "v", u"0");
    assertXPath(pMetadata, "//x:valueMetadata/x:bk[2]/x:rc", "v", u"1");
    assertXPath(pMetadata, "//x:futureMetadata[@name='XLRICHVALUE']/x:bk", 2);

    // The rich values say that they stand for a picture stored in the package.
    xmlDocUniquePtr pStructure = parseExport(u"xl/richData/rdrichvaluestructure.xml"_ustr);
    CPPUNIT_ASSERT(pStructure);
    assertXPath(pStructure, "//xlrd:s", "t", u"_localImage");
    assertXPath(pStructure, "//xlrd:s/xlrd:k[1]", "n", u"_rvRel:LocalImageIdentifier");

    xmlDocUniquePtr pValues = parseExport(u"xl/richData/rdrichvalue.xml"_ustr);
    CPPUNIT_ASSERT(pValues);
    assertXPath(pValues, "//xlrd:rv", 2);
    assertXPathContent(pValues, "//xlrd:rv[1]/xlrd:v[1]", u"0");
    assertXPathContent(pValues, "//xlrd:rv[2]/xlrd:v[1]", u"1");

    // Each rich value names its own entry of the relationship part, and each of those entries
    // leads to a picture in the media folder.
    xmlDocUniquePtr pRelations = parseExport(u"xl/richData/richValueRel.xml"_ustr);
    CPPUNIT_ASSERT(pRelations);
    assertXPath(pRelations, "//xlrvr:rel", 2);

    xmlDocUniquePtr pRelationTargets = parseExport(u"xl/richData/_rels/richValueRel.xml.rels"_ustr);
    CPPUNIT_ASSERT(pRelationTargets);
    assertXPath(pRelationTargets, "//rels:Relationship", 2);
}

CPPUNIT_TEST_FIXTURE(ImageInCellImportExportTest, testPictureInCellBesideADynamicArray)
{
    // The metadata part names its types in a list, and an entry points at one of them by the place
    // it takes in that list. A workbook that carries dynamic array formulas as well puts the rich
    // values second, so the picture is only found when the entry is read against the right type.
    createScDoc("xlsx/image-in-cell-with-dynamic-array.xlsx");
    ScDocument* pDocument = getScDoc();
    CPPUNIT_ASSERT(findPictureInCell(*pDocument, ScAddress(0, 0, 0)) != nullptr);
    CPPUNIT_ASSERT_EQUAL(3.0, pDocument->GetValue(ScAddress(2, 2, 0)));

    save(TestFilter::XLSX);

    // Both kinds of metadata come back, and each entry names its own type.
    xmlDocUniquePtr pMetadata = parseExport(u"xl/metadata.xml"_ustr);
    CPPUNIT_ASSERT(pMetadata);
    assertXPath(pMetadata, "//x:metadataTypes", "count", u"2");
    assertXPath(pMetadata, "//x:metadataTypes/x:metadataType[1]", "name", u"XLDAPR");
    assertXPath(pMetadata, "//x:metadataTypes/x:metadataType[2]", "name", u"XLRICHVALUE");
    assertXPath(pMetadata, "//x:cellMetadata/x:bk/x:rc", "t", u"1");
    assertXPath(pMetadata, "//x:valueMetadata/x:bk/x:rc", "t", u"2");

    xmlDocUniquePtr pSheet = parseExport(u"xl/worksheets/sheet1.xml"_ustr);
    CPPUNIT_ASSERT(pSheet);
    assertXPath(pSheet, "//x:c[@r='A1']", "vm", u"1");
    assertXPath(pSheet, "//x:c[@r='C1']", "cm", u"1");
}

} // namespace sc

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
