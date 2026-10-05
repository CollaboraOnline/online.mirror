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

#include <cppuhelper/implbase.hxx>

#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/text/XFlatParagraph.hpp>
#include <com/sun/star/text/XFlatParagraphIterator.hpp>
#include <svl/listener.hxx>
#include "unotextmarkup.hxx"
#include <nodeoffset.hxx>

#include <set>

class SwTextNode;
class SwDoc;
class ModelToViewHelper;

typedef ::cppu::ImplInheritanceHelper
<   SwXTextMarkup
,   css::beans::XPropertySet
,   css::text::XFlatParagraph
> SwXFlatParagraph_Base;

class SwXFlatParagraph final
    :   public SwXFlatParagraph_Base
{
public:
    SwXFlatParagraph( SwTextNode& rTextNode, OUString aExpandText, const ModelToViewHelper& rConversionMap );
    virtual ~SwXFlatParagraph() override;

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

    // text::XTextMarkup:
    virtual cpo::uno::Reference< css::container::XStringKeyMap > getMarkupInfoContainer() override;

    virtual void commitStringMarkup(::sal_Int32 nType, const OUString & aIdentifier, ::sal_Int32 nStart, ::sal_Int32 nLength,
                                   const cpo::uno::Reference< css::container::XStringKeyMap > & xMarkupInfoContainer) override;

    virtual void commitTextRangeMarkup(::sal_Int32 nType, const OUString & aIdentifier, const cpo::uno::Reference< css::text::XTextRange> & xRange,
                                                const cpo::uno::Reference< css::container::XStringKeyMap > & xMarkupInfoContainer) override;

    // text::XFlatParagraph:
    virtual OUString getText() override;
    virtual bool isModified() override;
    virtual void setChecked(::sal_Int32 nType, bool bVal) override;
    virtual bool isChecked(::sal_Int32 nType) override;
    virtual css::lang::Locale getLanguageOfText(::sal_Int32 nPos, ::sal_Int32 nLen) override;
    virtual css::lang::Locale getPrimaryLanguageOfText(::sal_Int32 nPos, ::sal_Int32 nLen) override;
    virtual void changeText(::sal_Int32 nPos, ::sal_Int32 nLen, const OUString & aNewText, const cpo::uno::Sequence< css::beans::PropertyValue > & aAttributes) override;
    virtual void changeAttributes(::sal_Int32 nPos, ::sal_Int32 nLen, const cpo::uno::Sequence< css::beans::PropertyValue > & aAttributes) override;
    virtual cpo::uno::Sequence< ::sal_Int32 > getLanguagePortions() override;

    using SwXTextMarkup::GetTextNode;

private:
    SwXFlatParagraph( const SwXFlatParagraph & ) = delete;
    SwXFlatParagraph & operator = ( const SwXFlatParagraph & ) = delete;

    OUString maExpandText;
    OUString maOrigText;
};

class SwXFlatParagraphIterator final :
    public ::cppu::WeakImplHelper
    <
        css::text::XFlatParagraphIterator
    >,
    public SvtListener
{
public:
    SwXFlatParagraphIterator( SwDoc& rDoc, sal_Int32 nType, bool bAutomatic );
    virtual ~SwXFlatParagraphIterator() override;

    // text::XFlatParagraphIterator:
    virtual cpo::uno::Reference< css::text::XFlatParagraph > getFirstPara() override;
    virtual cpo::uno::Reference< css::text::XFlatParagraph > getNextPara() override;
    virtual cpo::uno::Reference< css::text::XFlatParagraph > getLastPara() override;
    virtual cpo::uno::Reference< css::text::XFlatParagraph > getParaBefore(const cpo::uno::Reference< css::text::XFlatParagraph > & xPara) override;
    virtual cpo::uno::Reference< css::text::XFlatParagraph > getParaAfter(const cpo::uno::Reference< css::text::XFlatParagraph > & xPara) override;

    virtual void Notify( const SfxHint& ) override;

private:
    SwXFlatParagraphIterator( const SwXFlatParagraphIterator & ) = delete;
    SwXFlatParagraphIterator & operator =(const SwXFlatParagraphIterator & ) = delete;

    SwDoc* mpDoc;
    const sal_Int32 mnType;
    const bool mbAutomatic;

    SwNodeOffset mnCurrentNode;    // used for non-automatic mode
    SwNodeOffset mnEndNode;        // used for non-automatic mode
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
