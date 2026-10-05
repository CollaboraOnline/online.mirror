/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
#pragma once

#include <ooo/vba/word/XContentControlListEntry.hpp>

#include <vbahelper/vbahelperinterface.hxx>

#include <textcontentcontrol.hxx>

typedef InheritedHelperInterfaceWeakImpl<ooo::vba::word::XContentControlListEntry>
    SwVbaContentControlListEntry_BASE;

class SwVbaContentControlListEntry : public SwVbaContentControlListEntry_BASE
{
private:
    std::shared_ptr<SwContentControl> m_pCC;
    // All LO and internal UNO functions are 0-based. Convert to 1-based when sending to VBA
    size_t m_nZIndex;

public:
    /// @throws cpo::uno::RuntimeException
    SwVbaContentControlListEntry(const cpo::uno::Reference<ooo::vba::XHelperInterface>& rParent,
                                 const cpo::uno::Reference<cpo::uno::XComponentContext>& rContext,
                                 std::shared_ptr<SwContentControl> pCC, size_t nZIndex);
    ~SwVbaContentControlListEntry() override;

    // XContentControlListEntry
    sal_Int32 getIndex() override;
    void setIndex(sal_Int32 nSet) override;

    OUString getText() override;
    void setText(const OUString& sSet) override;

    OUString getValue() override;
    void setValue(const OUString& sSet) override;

    void Delete() override;
    void MoveDown() override;
    void MoveUp() override;
    void Select() override;

    // XHelperInterface
    OUString getServiceImplName() override;
    cpo::uno::Sequence<OUString> getServiceNames() override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
