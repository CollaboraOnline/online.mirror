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

#include <sal/config.h>

#include <rtl/ustrbuf.hxx>

#include "excelhandlers.hxx"
#include "richvaluebuffer.hxx"

namespace oox::xls
{
/** Fragment handler for the sheet metadata part (xl/metadata.xml).

    Reads the entries of the rich value metadata type, which lead from the value metadata index of
    a cell to a rich value. */
class MetadataFragment final : public WorkbookFragmentBase
{
public:
    explicit MetadataFragment(const WorkbookHelper& rHelper, const OUString& rFragmentPath);

private:
    virtual oox::core::ContextHandlerRef onCreateContext(sal_Int32 nElement,
                                                         const AttributeList& rAttribs) override;

    sal_Int32 mnRichValueType = -1;
    sal_Int32 mnTypeCount = 0;
    sal_Int32 mnFutureBlock = -1;
    sal_Int32 mnValueEntry = 0;
    bool mbInRichValueFutureMetadata = false;
};

/** Fragment handler for the rich value structure part (xl/richData/rdrichvaluestructure.xml). */
class RichValueStructureFragment final : public WorkbookFragmentBase
{
public:
    explicit RichValueStructureFragment(const WorkbookHelper& rHelper,
                                        const OUString& rFragmentPath);

private:
    virtual oox::core::ContextHandlerRef onCreateContext(sal_Int32 nElement,
                                                         const AttributeList& rAttribs) override;
    virtual void onEndElement() override;

    RichValueStructure maStructure;
};

/** Fragment handler for the rich value part (xl/richData/rdrichvalue.xml). */
class RichValueFragment final : public WorkbookFragmentBase
{
public:
    explicit RichValueFragment(const WorkbookHelper& rHelper, const OUString& rFragmentPath);

private:
    virtual oox::core::ContextHandlerRef onCreateContext(sal_Int32 nElement,
                                                         const AttributeList& rAttribs) override;
    virtual void onCharacters(const OUString& rChars) override;
    virtual void onEndElement() override;

    RichValue maRichValue;
    OUStringBuffer maValue;
};

/** Fragment handler for the rich value relationship part (xl/richData/richValueRel.xml).

    Each entry names a picture in the media folder of the package, in the order the local image
    identifiers of the rich values count. */
class RichValueRelFragment final : public WorkbookFragmentBase
{
public:
    explicit RichValueRelFragment(const WorkbookHelper& rHelper, const OUString& rFragmentPath);

private:
    virtual oox::core::ContextHandlerRef onCreateContext(sal_Int32 nElement,
                                                         const AttributeList& rAttribs) override;
};

} // namespace oox::xls

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
