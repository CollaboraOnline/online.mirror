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

#pragma once

#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/container/XNamed.hpp>
#include <com/sun/star/util/XRefreshable.hpp>
#include <com/sun/star/text/XDocumentIndexMark.hpp>
#include <com/sun/star/text/XDocumentIndex.hpp>

#include <cppuhelper/implbase.hxx>

#include <sfx2/Metadatable.hxx>

#include "toxe.hxx"
#include "unobaseclass.hxx"
#include "unosection.hxx"
#include "swdllapi.h"

class SwDoc;
class SwTOXBaseSection;
class SwTOXMark;
class SwTOXType;

typedef ::cppu::ImplInheritanceHelper
<   SwXSection
,   css::util::XRefreshable
,   css::text::XDocumentIndex
> SwXDocumentIndex_Base;

class SW_DLLPUBLIC SwXDocumentIndex final
    : public SwXDocumentIndex_Base
{

private:

    class StyleAccess_Impl;
    class TokenAccess_Impl;

    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    virtual ~SwXDocumentIndex() override;

    SwXDocumentIndex(SwTOXBaseSection &, SwDoc &);

    /// descriptor
    SwXDocumentIndex(const TOXTypes eToxType, SwDoc& rDoc);

public:

    static rtl::Reference<SwXDocumentIndex>
        CreateXDocumentIndex(SwDoc & rDoc, SwTOXBaseSection * pSection,
                TOXTypes eTypes = TOX_INDEX);

    // MetadatableMixin
    virtual ::sfx2::Metadatable* GetCoreObject() override;
    virtual cpo::uno::Reference< css::frame::XModel >
        GetModel() override;

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames() override;

    // XComponent
    virtual void dispose() override;
    virtual void addEventListener(
            const cpo::uno::Reference< css::lang::XEventListener > & xListener) override;
    virtual void removeEventListener(
            const cpo::uno::Reference< css::lang::XEventListener > & xListener) override;

    // XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo >
        getPropertySetInfo() override;
    virtual void setPropertyValue(
            const OUString& rPropertyName,
            const cpo::uno::Any& rValue) override;
    virtual cpo::uno::Any getPropertyValue(
            const OUString& rPropertyName) override;
    virtual void addPropertyChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener) override;
    virtual void removePropertyChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener) override;
    virtual void addVetoableChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XVetoableChangeListener >& xListener) override;
    virtual void removeVetoableChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XVetoableChangeListener >& xListener) override;

    // XNamed
    virtual OUString getName() override;
    virtual void setName(const OUString& rName) override;

    // XRefreshable
    virtual void refresh() override;
    virtual void addRefreshListener(
            const cpo::uno::Reference< css::util::XRefreshListener>& xListener) override;
    virtual void removeRefreshListener(
            const cpo::uno::Reference< css::util::XRefreshListener>& xListener) override;

    // XTextContent
    virtual void attach(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor() override;

    // XDocumentIndex
    virtual OUString getServiceName() override;
    virtual void update() override;

};

typedef ::cppu::WeakImplHelper
<   css::lang::XServiceInfo
,   css::beans::XPropertySet
,   css::text::XDocumentIndexMark
> SwXDocumentIndexMark_Base;

class SwXDocumentIndexMark final
    : public SwXDocumentIndexMark_Base
{

private:

    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    virtual ~SwXDocumentIndexMark() override;

    SwXDocumentIndexMark(SwDoc & rDoc,
                const SwTOXType & rType, const SwTOXMark & rMark);

    /// descriptor
    SwXDocumentIndexMark(const TOXTypes eToxType);

public:

    static rtl::Reference<SwXDocumentIndexMark>
        CreateXDocumentIndexMark(SwDoc & rDoc,
            SwTOXMark * pMark, TOXTypes eType = TOX_INDEX);

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames() override;

    // XComponent
    virtual void dispose() override;
    virtual void addEventListener(
            const cpo::uno::Reference< css::lang::XEventListener > & xListener) override;
    virtual void removeEventListener(
            const cpo::uno::Reference< css::lang::XEventListener > & xListener) override;

    // XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo >
        getPropertySetInfo() override;
    virtual void setPropertyValue(
            const OUString& rPropertyName,
            const cpo::uno::Any& rValue) override;
    virtual cpo::uno::Any getPropertyValue(
            const OUString& rPropertyName) override;
    virtual void addPropertyChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener) override;
    virtual void removePropertyChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference<css::beans::XPropertyChangeListener >& xListener) override;
    virtual void addVetoableChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XVetoableChangeListener >& xListener) override;
    virtual void removeVetoableChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference< css::beans::XVetoableChangeListener >& xListener) override;

    // XTextContent
    virtual void attach(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor() override;

    // XDocumentIndexMark
    virtual OUString getMarkEntry() override;
    virtual void setMarkEntry(const OUString& rIndexEntry) override;

    // called when the associated SwTOXMark is deleted
    void OnSwTOXMarkDeleted();

};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
