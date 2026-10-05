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

#include <swdllapi.h>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/container/XEnumerationAccess.hpp>
#include <com/sun/star/text/XFootnote.hpp>

#include <cppuhelper/implbase.hxx>

#include <unotext.hxx>

class SwDoc;
class SwFormatFootnote;
class SwUnoInternalPaM;

typedef ::cppu::WeakImplHelper
<   css::lang::XServiceInfo
,   css::beans::XPropertySet
,   css::container::XEnumerationAccess
,   css::text::XFootnote
> SwXFootnote_Base;

class SW_DLLPUBLIC SwXFootnote final
    : public SwXFootnote_Base
    , public SwXText
{
    friend class SwXFootnotes;

    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    virtual const SwStartNode *GetStartNode() const override;

    virtual ~SwXFootnote() override;

    SwXFootnote(SwDoc & rDoc, SwFormatFootnote & rFormat);
    SwXFootnote(const bool bEndnote);

public:

    static rtl::Reference<SwXFootnote>
        CreateXFootnote(SwDoc & rDoc, SwFormatFootnote * pFootnoteFormat,
                bool isEndnote = false);

    // XInterface
    virtual cpo::uno::Any queryInterface(
            const cpo::uno::Type& rType) override;
    virtual void acquire() noexcept override { OWeakObject::acquire(); }
    virtual void release() noexcept override { OWeakObject::release(); }

    // XTypeProvider
    virtual cpo::uno::Sequence< cpo::uno::Type >
        getTypes() override;
    virtual cpo::uno::Sequence< sal_Int8 >
        getImplementationId() override;

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

    // XElementAccess
    virtual cpo::uno::Type getElementType() override;
    virtual bool hasElements() override;

    // XEnumerationAccess
    virtual cpo::uno::Reference< css::container::XEnumeration >
        createEnumeration() override;

    // XTextContent
    virtual void attach(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor() override;

    // XFootnote
    virtual OUString getLabel() override;
    virtual void setLabel(const OUString& rLabel) override;

    // XSimpleText
    virtual rtl::Reference< SwXTextCursor > createXTextCursor() override;
    virtual rtl::Reference< SwXTextCursor > createXTextCursorByRange(
            const ::cpo::uno::Reference< ::css::text::XTextRange >& aTextPosition ) override;

    void OnFormatFootnoteDeleted();

private:
    rtl::Reference< SwXTextCursor > createXTextCursorByRangeImpl(SwUnoInternalPaM& rPam);
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
