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

#include <memory>
#include <deque>

#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/container/XChild.hpp>
#include <com/sun/star/container/XEnumerationAccess.hpp>
#include <com/sun/star/text/XTextContent.hpp>
#include <com/sun/star/text/XTextField.hpp>

#include <cppuhelper/implbase.hxx>

#include <sfx2/Metadatable.hxx>

#include <unobaseclass.hxx>

class SwXTextPortion;
class SwPaM;
class SwTextNode;
class SwXText;
namespace sw {
    class Meta;
}

typedef std::deque<
    rtl::Reference<SwXTextPortion> >
    TextRangeList_t;



typedef ::cppu::ImplInheritanceHelper
<   ::sfx2::MetadatableMixin
,   css::lang::XServiceInfo
,   css::container::XChild
,   css::container::XEnumerationAccess
,   css::text::XTextContent
,   css::text::XText
> SwXMeta_Base;

class SwXMeta
    : public SwXMeta_Base
{

public:

    class Impl;

protected:

    ::sw::UnoImplPtr<Impl> m_pImpl;

    /// @throws css::lang::IllegalArgumentException
    /// @throws cpo::uno::RuntimeException
    void AttachImpl(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange,
            const sal_uInt16 nWhich);

    virtual ~SwXMeta() override;

    SwXMeta(SwXMeta const&) = delete;
    SwXMeta& operator=(SwXMeta const&) = delete;

    /// @param pDoc and pMeta != 0, but not & because of ImplInheritanceHelper
    SwXMeta(SwDoc *const pDoc, ::sw::Meta *const pMeta,
        cpo::uno::Reference<SwXText> const&  xParentText,
        std::unique_ptr<TextRangeList_t const> pPortions);

    SwXMeta(SwDoc *const pDoc);

public:

    static rtl::Reference<SwXMeta>
        CreateXMeta(
            ::sw::Meta & rMeta,
            const cpo::uno::Reference<SwXText>& xParentText,
            std::unique_ptr<TextRangeList_t const> && pPortions);

    static rtl::Reference<SwXMeta>
        CreateXMeta(SwDoc & rDoc, bool isField);

    /// init params with position of the attribute content (w/out CH_TXTATR)
    bool SetContentRange( SwTextNode *& rpNode, sal_Int32 & rStart, sal_Int32 & rEnd) const;
    cpo::uno::Reference< SwXText > const & GetParentText() const;

    /// @throws css::lang::IllegalArgumentException
    /// @throws cpo::uno::RuntimeException
    bool CheckForOwnMemberMeta(const SwPaM & rPam, const bool bAbsorb);

    // MetadatableMixin
    virtual ::sfx2::Metadatable * GetCoreObject() override;
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

    // XChild
    virtual cpo::uno::Reference< cpo::uno::XInterface >
        getParent() override;
    virtual void setParent(
            cpo::uno::Reference< cpo::uno::XInterface> const& xParent) override;

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

    // XTextRange
    virtual cpo::uno::Reference< css::text::XText >
        getText() override;
    virtual cpo::uno::Reference<
                css::text::XTextRange > getStart() override;
    virtual cpo::uno::Reference<
                css::text::XTextRange > getEnd() override;
    virtual OUString getString() override;
    virtual void setString(const OUString& rString) override;

    // XSimpleText
    virtual cpo::uno::Reference< css::text::XTextCursor >
        createTextCursor() override;
    virtual cpo::uno::Reference< css::text::XTextCursor >
        createTextCursorByRange(
            const cpo::uno::Reference< css::text::XTextRange > & xTextPosition) override;
    virtual void insertString(
            const cpo::uno::Reference< css::text::XTextRange > & xRange,
            const OUString& aString, bool bAbsorb) override;
    virtual void insertControlCharacter(
            const cpo::uno::Reference< css::text::XTextRange > & xRange,
            sal_Int16 nControlCharacter, bool bAbsorb) override;

    // XText
    virtual void insertTextContent(
            const cpo::uno::Reference< css::text::XTextRange > & xRange,
            const cpo::uno::Reference< css::text::XTextContent > & xContent,
            bool bAbsorb) override;
    virtual void removeTextContent(
            const cpo::uno::Reference< css::text::XTextContent > & xContent) override;

};

typedef ::cppu::ImplInheritanceHelper
<   SwXMeta
,   css::beans::XPropertySet
,   css::text::XTextField
> SwXMetaField_Base;

class SwXMetaField final
    : public SwXMetaField_Base
{

private:

    virtual ~SwXMetaField() override;

    friend rtl::Reference<SwXMeta>
        SwXMeta::CreateXMeta(::sw::Meta &,
            const cpo::uno::Reference<SwXText>&,
            std::unique_ptr<TextRangeList_t const> && pPortions);

    SwXMetaField(SwDoc *const pDoc, ::sw::Meta *const pMeta,
        cpo::uno::Reference<SwXText> const& xParentText,
        std::unique_ptr<TextRangeList_t const> pPortions);

    friend rtl::Reference<SwXMeta>
        SwXMeta::CreateXMeta(SwDoc &, bool);

    SwXMetaField(SwDoc *const pDoc);

public:

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames( ) override;

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
    virtual cpo::uno::Any
        getPropertyValue(const OUString& rPropertyName) override;
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

    // XTextContent
    virtual void attach(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor() override;

    // XTextField
    virtual OUString getPresentation(bool bShowCommand) override;

};

/// get prefix/suffix from the RDF repository. @throws RuntimeException
void getPrefixAndSuffix(
        const cpo::uno::Reference< css::frame::XModel>& xModel,
        const cpo::uno::Reference< css::rdf::XMetadatable>& xMetaField,
        OUString *const o_pPrefix, OUString *const o_pSuffix, OUString *const o_pShadowColor);

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
