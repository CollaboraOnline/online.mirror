/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This file incorporates work covered by the following license notice:
 *
 *   Licensed to the Apache Software Foundation (ASF) under one or more
 *   contributor license agreements. See the NOTICE file distributed
 *   with this work for additional information regarding copyright
 *   ownership. The ASF licenses this file to you under the Apache
 *   License, Version 2.0 (the "License"); you may not use this file
 *   except in compliance with the License. You may obtain a copy of
 *   the License at http://www.apache.org/licenses/LICENSE-2.0 .
 */

#ifndef INCLUDED_SW_INC_UNOFIELDCOLL_HXX
#define INCLUDED_SW_INC_UNOFIELDCOLL_HXX

#include <memory>

#include <com/sun/star/util/XRefreshable.hpp>
#include <com/sun/star/container/XUniqueIDAccess.hpp>

#include "unocoll.hxx"

class SwFieldType;
class SwXFieldEnumeration;

typedef ::cppu::WeakImplHelper
<   css::container::XNameAccess
,   css::lang::XServiceInfo
> SwXTextFieldMasters_Base;

class SAL_DLLPUBLIC_RTTI SwXTextFieldMasters final
    : public SwXTextFieldMasters_Base
    , public SwUnoCollection
{
    virtual ~SwXTextFieldMasters() override;

public:
    SwXTextFieldMasters(SwDoc* pDoc);

    static bool getInstanceName(const SwFieldType& rFieldType, OUString& rName);

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames() override;

    // XElementAccess
    virtual cpo::uno::Type getElementType() override;
    virtual bool hasElements() override;

    // XNameAccess
    virtual cpo::uno::Any getByName(
            const OUString& rName) override;
    virtual cpo::uno::Sequence< OUString >
        getElementNames() override;
    SW_DLLPUBLIC virtual bool hasByName(const OUString& rName) override;

    SW_DLLPUBLIC rtl::Reference<SwXFieldMaster> getFieldMasterByName(const OUString& rName);
};

typedef ::cppu::WeakImplHelper
<   css::container::XEnumerationAccess
,   css::lang::XServiceInfo
,   css::util::XRefreshable
,   css::container::XUniqueIDAccess
> SwXTextFieldTypes_Base;

class SW_DLLPUBLIC SwXTextFieldTypes final
    : public SwXTextFieldTypes_Base
    , public SwUnoCollection
{
private:
    class Impl;
    std::unique_ptr<Impl> m_pImpl; // currently does not need UnoImplPtr

    virtual ~SwXTextFieldTypes() override;

public:
    SwXTextFieldTypes(SwDoc* pDoc);

    // SwUnoCollection
    virtual void    Invalidate() override;

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames() override;

    // XElementAccess
    virtual cpo::uno::Type getElementType() override;
    virtual bool hasElements() override;

    // XEnumerationAccess
    virtual cpo::uno::Reference<
            css::container::XEnumeration >
        createEnumeration() override;

    // XRefreshable
    virtual void refresh() override;
    virtual void addRefreshListener(
            const cpo::uno::Reference<
                css::util::XRefreshListener>& xListener) override;
    virtual void removeRefreshListener(
            const cpo::uno::Reference<
                css::util::XRefreshListener>& xListener) override;

    // container::XUniqueIDAccess
    virtual cpo::uno::Any getByUniqueID( const OUString& ID ) override;
    virtual void removeByUniqueID( const OUString& ID ) override;

    rtl::Reference<SwXFieldEnumeration> createFieldEnumeration();
};

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
