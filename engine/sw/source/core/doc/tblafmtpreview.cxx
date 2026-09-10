/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <tblafmtpreview.hxx>

#include <tblafmt.hxx>
#include <swtable.hxx>

#include <editeng/boxitem.hxx>
#include <editeng/brushitem.hxx>
#include <editeng/colritem.hxx>
#include <svx/sdr/table/TableStylePreviewPaint.hxx>
#include <tools/color.hxx>
#include <map>
#include <docmodel/theme/ColorSet.hxx>
#include <ThemeColorChanger.hxx>

namespace sw
{
namespace
{
/// Which box format position a cell in the preview grid resolves to, given the settings.
sal_uInt8 GetPreviewCellPos(sal_Int32 nRow, sal_Int32 nCol, const SwTableStyleSettings& rSettings)
{
    const sal_uInt8 nRowRole = SwTableAutoFormat::GetTableStyleRowRole(
            nRow, sdr::table::nTableStylePreviewRows, rSettings);
    const sal_uInt8 nColRole = SwTableAutoFormat::GetTableStyleColRole(
            nCol, sdr::table::nTableStylePreviewColumns, rSettings);
    return static_cast<sal_uInt8>(nRowRole * SwTableAutoFormat::nRoleCount + nColRole);
}
}

OString CreateTableStylePreviewDataUri(const SwTableAutoFormat& rStyle,
                                       const SwTableStyleSettings& rSettings, bool bIsPageDark,
                                       const model::ColorSet* pThemeColors)
{
    // A theme color the style gives is shown with the document theme's value for it. The box
    // items with resolved line colors live here, one per role position, for the paint call.
    std::map<sal_uInt8, SvxBoxItem> aResolvedBoxes;
    const Bitmap aBitmap = sdr::table::PaintTableStylePreview(
        [&rStyle, &rSettings, pThemeColors, &aResolvedBoxes](
            sal_Int32 nRow, sal_Int32 nCol) -> sdr::table::TableStylePreviewCell
        {
            const sal_uInt8 nPos = GetPreviewCellPos(nRow, nCol, rSettings);
            const SwAutoFormatProps& rProps = rStyle.GetBoxFormat(nPos).GetProps();
            sdr::table::TableStylePreviewCell aCell{ rProps.GetBackground().GetColor(),
                                                     rProps.GetColor().GetValue(),
                                                     &rProps.GetBox() };
            if (!pThemeColors)
                return aCell;

            const model::ComplexColor& rFill = rProps.GetBackground().getComplexColor();
            if (rFill.isValidThemeType())
                aCell.aBackColor = pThemeColors->resolveColor(rFill);
            const model::ComplexColor& rText = rProps.GetColor().getComplexColor();
            if (rText.isValidThemeType())
                aCell.aTextColor = pThemeColors->resolveColor(rText);

            auto it = aResolvedBoxes.find(nPos);
            if (it == aResolvedBoxes.end())
            {
                SvxBoxItem aBox(rProps.GetBox());
                if (sw::ResolveThemeColors(aBox, *pThemeColors))
                    it = aResolvedBoxes.emplace(nPos, aBox).first;
            }
            if (it != aResolvedBoxes.end())
                aCell.pBorder = &it->second;
            return aCell;
        },
        bIsPageDark);

    return sdr::table::EncodeTableStylePreviewDataUri(aBitmap);
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
