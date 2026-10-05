/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
#pragma once

#include <ooo/vba/word/XContentControlListEntries.hpp>
#include <ooo/vba/word/XContentControlListEntry.hpp>

#include <vbahelper/vbacollectionimpl.hxx>

#include <textcontentcontrol.hxx>

#include "vbacontentcontrollistentries.hxx"
#include "vbacontentcontrollistentry.hxx"

typedef CollTestImplHelper<ooo::vba::word::XContentControlListEntries>
    SwVbaContentControlListEntries_BASE;

class SwVbaContentControlListEntries : public SwVbaContentControlListEntries_BASE
{
private:
    std::shared_ptr<SwContentControl> m_pCC;

public:
    /// @throws cpo::uno::RuntimeException
    SwVbaContentControlListEntries(const cpo::uno::Reference<ov::XHelperInterface>& xParent,
                                   const cpo::uno::Reference<cpo::uno::XComponentContext>& xContext,
                                   std::shared_ptr<SwContentControl> pCC);

    // XContentControlListEntries
    cpo::uno::Reference<ooo::vba::word::XContentControlListEntry>
    Add(const OUString& rName, const cpo::uno::Any& rValue, const cpo::uno::Any& rIndex) override;
    void Clear() override;
    sal_Int32 getCount() override;

    // XEnumerationAccess
    cpo::uno::Type getElementType() override;
    cpo::uno::Reference<css::container::XEnumeration> createEnumeration() override;

    // SwVbaContentControlListEntries_BASE
    cpo::uno::Any createCollectionObject(const cpo::uno::Any& aSource) override;
    OUString getServiceImplName() override;
    cpo::uno::Sequence<OUString> getServiceNames() override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
