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

#include <richvaluefragment.hxx>

#include <oox/helper/attributelist.hxx>
#include <oox/token/namespaces.hxx>
#include <oox/token/tokens.hxx>

namespace oox::xls
{
namespace
{
/** Name of the metadata type that carries rich values. */
constexpr OUString gaRichValueTypeName = u"XLRICHVALUE"_ustr;
}

MetadataFragment::MetadataFragment(const WorkbookHelper& rHelper, const OUString& rFragmentPath)
    : WorkbookFragmentBase(rHelper, rFragmentPath)
{
}

core::ContextHandlerRef MetadataFragment::onCreateContext(sal_Int32 nElement,
                                                          const AttributeList& rAttribs)
{
    switch (getCurrentElement())
    {
        case core::XML_ROOT_CONTEXT:
            if (nElement == XLS_TOKEN(metadata))
                return this;
            break;

        case XLS_TOKEN(metadata):
            if (nElement == XLS_TOKEN(metadataTypes))
                return this;
            if (nElement == XLS_TOKEN(futureMetadata))
            {
                mbInRichValueFutureMetadata
                    = rAttribs.getStringDefaulted(XML_name) == gaRichValueTypeName;
                mnFutureBlock = -1;
                return this;
            }
            if (nElement == XLS_TOKEN(valueMetadata))
            {
                mnValueEntry = 0;
                return this;
            }
            break;

        case XLS_TOKEN(metadataTypes):
            if (nElement == XLS_TOKEN(metadataType))
            {
                // The type index a value metadata entry refers to counts from one.
                ++mnTypeCount;
                if (rAttribs.getStringDefaulted(XML_name) == gaRichValueTypeName)
                    mnRichValueType = mnTypeCount;
            }
            break;

        case XLS_TOKEN(futureMetadata):
            if (nElement == XLS_TOKEN(bk) && mbInRichValueFutureMetadata)
            {
                ++mnFutureBlock;
                return this;
            }
            break;

        case XLS_TOKEN(bk):
            if (nElement == XLS_TOKEN(extLst))
                return this;
            if (nElement == XLS_TOKEN(rc) && mnRichValueType > 0
                && rAttribs.getInteger(XML_t, -1) == mnRichValueType)
                getRichValues().addValueMetadata(mnValueEntry, rAttribs.getInteger(XML_v, -1));
            break;

        case XLS_TOKEN(extLst):
            if (nElement == XLS_TOKEN(ext))
                return this;
            break;

        case XLS_TOKEN(ext):
            if (nElement == XLRD_TOKEN(rvb))
                getRichValues().addRichValueBlock(mnFutureBlock, rAttribs.getInteger(XML_i, -1));
            break;

        case XLS_TOKEN(valueMetadata):
            if (nElement == XLS_TOKEN(bk))
            {
                // The value metadata index a cell carries counts from one.
                ++mnValueEntry;
                return this;
            }
            break;
    }
    return {};
}

RichValueStructureFragment::RichValueStructureFragment(const WorkbookHelper& rHelper,
                                                       const OUString& rFragmentPath)
    : WorkbookFragmentBase(rHelper, rFragmentPath)
{
}

core::ContextHandlerRef RichValueStructureFragment::onCreateContext(sal_Int32 nElement,
                                                                    const AttributeList& rAttribs)
{
    switch (getCurrentElement())
    {
        case core::XML_ROOT_CONTEXT:
            if (nElement == XLRD_TOKEN(rvStructures))
                return this;
            break;

        case XLRD_TOKEN(rvStructures):
            if (nElement == XLRD_TOKEN(s))
            {
                maStructure = RichValueStructure();
                maStructure.maType = rAttribs.getStringDefaulted(XML_t);
                return this;
            }
            break;

        case XLRD_TOKEN(s):
            if (nElement == XLRD_TOKEN(k))
                maStructure.maKeys.push_back(rAttribs.getStringDefaulted(XML_n));
            break;
    }
    return {};
}

void RichValueStructureFragment::onEndElement()
{
    if (getCurrentElement() == XLRD_TOKEN(s))
        getRichValues().addStructure(std::move(maStructure));
}

RichValueFragment::RichValueFragment(const WorkbookHelper& rHelper, const OUString& rFragmentPath)
    : WorkbookFragmentBase(rHelper, rFragmentPath)
{
}

core::ContextHandlerRef RichValueFragment::onCreateContext(sal_Int32 nElement,
                                                           const AttributeList& rAttribs)
{
    switch (getCurrentElement())
    {
        case core::XML_ROOT_CONTEXT:
            if (nElement == XLRD_TOKEN(rvData))
                return this;
            break;

        case XLRD_TOKEN(rvData):
            if (nElement == XLRD_TOKEN(rv))
            {
                maRichValue = RichValue();
                maRichValue.mnStructure = rAttribs.getInteger(XML_s, -1);
                return this;
            }
            break;

        case XLRD_TOKEN(rv):
            if (nElement == XLRD_TOKEN(v))
            {
                maValue.setLength(0);
                return this;
            }
            break;
    }
    return {};
}

void RichValueFragment::onCharacters(const OUString& rChars)
{
    if (getCurrentElement() == XLRD_TOKEN(v))
        maValue.append(rChars);
}

void RichValueFragment::onEndElement()
{
    if (getCurrentElement() == XLRD_TOKEN(v))
        maRichValue.maValues.push_back(maValue.makeStringAndClear());
    else if (getCurrentElement() == XLRD_TOKEN(rv))
        getRichValues().addRichValue(std::move(maRichValue));
}

RichValueRelFragment::RichValueRelFragment(const WorkbookHelper& rHelper,
                                           const OUString& rFragmentPath)
    : WorkbookFragmentBase(rHelper, rFragmentPath)
{
}

core::ContextHandlerRef RichValueRelFragment::onCreateContext(sal_Int32 nElement,
                                                              const AttributeList& rAttribs)
{
    switch (getCurrentElement())
    {
        case core::XML_ROOT_CONTEXT:
            if (nElement == XLRVR_TOKEN(richValueRels))
                return this;
            break;

        case XLRVR_TOKEN(richValueRels):
            if (nElement == XLRVR_TOKEN(rel))
            {
                // The relationships of this part lead to the pictures in the media folder.
                const OUString aRelId = rAttribs.getStringDefaulted(R_TOKEN(id));
                getRichValues().addImagePath(aRelId.isEmpty() ? OUString()
                                                              : getFragmentPathFromRelId(aRelId));
            }
            break;
    }
    return {};
}

} // namespace oox::xls

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
