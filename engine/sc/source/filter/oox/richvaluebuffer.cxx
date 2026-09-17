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

#include <sal/config.h>

#include <richvaluebuffer.hxx>

#include <algorithm>

#include <o3tl/safeint.hxx>
#include <oox/core/filterbase.hxx>
#include <oox/helper/graphichelper.hxx>
#include <sal/log.hxx>
#include <vcl/graph.hxx>

namespace oox::xls
{
namespace
{
/** Name of the rich value structure that stands for a picture stored in the package. */
constexpr OUString gaLocalImageType = u"_localImage"_ustr;

/** Name of the key of a picture rich value that holds the index into the relationship part. */
constexpr OUString gaLocalImageKey = u"_rvRel:LocalImageIdentifier"_ustr;
}

RichValueBuffer::RichValueBuffer(const WorkbookHelper& rHelper)
    : WorkbookHelper(rHelper)
{
}

void RichValueBuffer::addRichValueBlock(sal_Int32 nBlock, sal_Int32 nRichValue)
{
    if (nBlock >= 0 && nRichValue >= 0)
        maBlockToRichValue[nBlock] = nRichValue;
}

void RichValueBuffer::addValueMetadata(sal_Int32 nEntry, sal_Int32 nBlock)
{
    if (nEntry > 0 && nBlock >= 0)
        maValueMetadataToBlock[nEntry] = nBlock;
}

OUString RichValueBuffer::getImagePath(sal_Int32 nValueMetadataIndex) const
{
    const auto aBlock = maValueMetadataToBlock.find(nValueMetadataIndex);
    if (aBlock == maValueMetadataToBlock.end())
        return OUString();

    const auto aRichValue = maBlockToRichValue.find(aBlock->second);
    if (aRichValue == maBlockToRichValue.end())
        return OUString();

    if (aRichValue->second < 0 || o3tl::make_unsigned(aRichValue->second) >= maRichValues.size())
        return OUString();
    const RichValue& rRichValue = maRichValues[aRichValue->second];

    if (rRichValue.mnStructure < 0
        || o3tl::make_unsigned(rRichValue.mnStructure) >= maStructures.size())
        return OUString();
    const RichValueStructure& rStructure = maStructures[rRichValue.mnStructure];
    if (rStructure.maType != gaLocalImageType)
        return OUString();

    // The value that names the picture sits at the place its key takes among the keys.
    const auto aKey
        = std::find(rStructure.maKeys.begin(), rStructure.maKeys.end(), gaLocalImageKey);
    if (aKey == rStructure.maKeys.end())
        return OUString();

    const size_t nKey = aKey - rStructure.maKeys.begin();
    if (nKey >= rRichValue.maValues.size())
        return OUString();

    const sal_Int32 nImage = rRichValue.maValues[nKey].toInt32();
    if (nImage < 0 || o3tl::make_unsigned(nImage) >= maImagePaths.size())
        return OUString();
    return maImagePaths[nImage];
}

bool RichValueBuffer::isImage(sal_Int32 nValueMetadataIndex) const
{
    return !getImagePath(nValueMetadataIndex).isEmpty();
}

Graphic RichValueBuffer::getImage(sal_Int32 nValueMetadataIndex) const
{
    const OUString aPath = getImagePath(nValueMetadataIndex);
    if (aPath.isEmpty())
        return Graphic();

    const cpo::uno::Reference<css::graphic::XGraphic> xGraphic
        = getBaseFilter().getGraphicHelper().importEmbeddedGraphic(aPath);
    SAL_WARN_IF(!xGraphic.is(), "sc.filter",
                "RichValueBuffer::getImage - cannot read the picture " << aPath);
    return Graphic(xGraphic);
}

} // namespace oox::xls

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
