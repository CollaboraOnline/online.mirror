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

#ifndef INCLUDED_SW_INC_UNOTEXTCURSOR_HXX
#define INCLUDED_SW_INC_UNOTEXTCURSOR_HXX

#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/beans/XPropertyState.hpp>
#include <com/sun/star/beans/XMultiPropertySet.hpp>
#include <com/sun/star/beans/XMultiPropertyStates.hpp>
#include <com/sun/star/container/XEnumerationAccess.hpp>
#include <com/sun/star/container/XContentEnumerationAccess.hpp>
#include <com/sun/star/util/XSortable.hpp>
#include <com/sun/star/document/XDocumentInsertable.hpp>
#include <com/sun/star/text/XSentenceCursor.hpp>
#include <com/sun/star/text/XWordCursor.hpp>
#include <com/sun/star/text/XParagraphCursor.hpp>
#include <com/sun/star/text/XRedline.hpp>
#include <com/sun/star/text/XMarkingAccess.hpp>

#include <cppuhelper/implbase.hxx>

#include <comphelper/uno3.hxx>

#include "unobaseclass.hxx"
#include "TextCursorHelper.hxx"
#include "unocrsr.hxx"

class SwDoc;
struct SwPosition;
class SwXTextRange;
class SfxItemPropertySet;

typedef ::cppu::ImplInheritanceHelper
<   OTextCursorHelper
,   css::lang::XServiceInfo
,   css::beans::XPropertyState
,   css::beans::XMultiPropertySet
,   css::beans::XMultiPropertyStates
,   css::container::XEnumerationAccess
,   css::container::XContentEnumerationAccess
,   css::util::XSortable
,   css::document::XDocumentInsertable
,   css::text::XSentenceCursor
,   css::text::XWordCursor
,   css::text::XParagraphCursor
,   css::text::XRedline
,   css::text::XMarkingAccess
> SwXTextCursor_Base;

class SW_DLLPUBLIC SwXTextCursor final
    : public SwXTextCursor_Base
{

private:

    const SfxItemPropertySet &  m_rPropSet;
    const CursorType            m_eType;
    const cpo::uno::Reference< css::text::XText > m_xParentText;
    sw::UnoCursorPointer m_pUnoCursor;
    SetAttrMode m_nAttrMode = SetAttrMode::DEFAULT;

    SwUnoCursor& GetCursorOrThrow() {
        if(!m_pUnoCursor)
            throw cpo::uno::RuntimeException(u"SwXTextCursor: disposed or invalid"_ustr, nullptr);
        return *m_pUnoCursor;
    }

    virtual ~SwXTextCursor() override;

public:

    SwXTextCursor(
            SwDoc & rDoc,
            cpo::uno::Reference< css::text::XText > xParent,
            const CursorType eType,
            SwPosition const& rPos,
            SwPosition const*const pMark = nullptr);
    SwXTextCursor(
            cpo::uno::Reference< css::text::XText > xParent,
            SwPaM const& rSourceCursor,
            const CursorType eType = CursorType::All);

    SwUnoCursor& GetCursor();
    bool IsAtEndOfMeta() const;
    bool IsAtEndOfContentControl() const;

    void DeleteAndInsert(std::u16string_view aText, ::sw::DeleteAndInsertMode eMode);
    // OTextCursorHelper
    virtual const SwPaM*        GetPaM() const override;
    virtual SwPaM*              GetPaM() override;
    virtual const SwDoc*        GetDoc() const override;
    virtual SwDoc*              GetDoc() override;

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames() override;

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
            const cpo::uno::Reference<
                css::beans::XPropertyChangeListener >& xListener) override;
    virtual void removePropertyChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference<
                css::beans::XPropertyChangeListener >& xListener) override;
    virtual void addVetoableChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference<
                css::beans::XVetoableChangeListener >& xListener) override;
    virtual void removeVetoableChangeListener(
            const OUString& rPropertyName,
            const cpo::uno::Reference<
                css::beans::XVetoableChangeListener >& xListener) override;

    // XPropertyState
    virtual css::beans::PropertyState
        getPropertyState(const OUString& rPropertyName) override;
    virtual cpo::uno::Sequence< css::beans::PropertyState >
        getPropertyStates(
            const cpo::uno::Sequence< OUString >& rPropertyNames) override;
    virtual void setPropertyToDefault(
            const OUString& rPropertyName) override;
    virtual cpo::uno::Any getPropertyDefault(
            const OUString& rPropertyName) override;

    // XMultiPropertySet
    virtual void setPropertyValues(
            const cpo::uno::Sequence< OUString >& aPropertyNames,
            const cpo::uno::Sequence< cpo::uno::Any >& aValues ) override;

    virtual cpo::uno::Sequence< cpo::uno::Any >
        getPropertyValues( const cpo::uno::Sequence< OUString >& aPropertyNames ) override;

    virtual void addPropertiesChangeListener(
        const cpo::uno::Sequence< OUString >& aPropertyNames,
        const cpo::uno::Reference< css::beans::XPropertiesChangeListener >& xListener ) override;

    virtual void removePropertiesChangeListener(
        const cpo::uno::Reference< css::beans::XPropertiesChangeListener >& xListener ) override;

    virtual void firePropertiesChangeEvent(
        const cpo::uno::Sequence< OUString >& aPropertyNames,
        const cpo::uno::Reference< css::beans::XPropertiesChangeListener >& xListener ) override;

    // XMultiPropertyStates
    virtual void setAllPropertiesToDefault() override;
    virtual void setPropertiesToDefault(
            const cpo::uno::Sequence< OUString >&  rPropertyNames) override;
    virtual cpo::uno::Sequence< cpo::uno::Any >
        getPropertyDefaults(
            const cpo::uno::Sequence< OUString >&  rPropertyNames) override;

    // XElementAccess
    virtual cpo::uno::Type getElementType() override;
    virtual bool hasElements() override;

    // XEnumerationAccess
    virtual cpo::uno::Reference< css::container::XEnumeration >
        createEnumeration() override;

    // XContentEnumerationAccess
    virtual cpo::uno::Reference< css::container::XEnumeration >
        createContentEnumeration(const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getAvailableServiceNames() override;

    // XSortable
    virtual cpo::uno::Sequence< css::beans::PropertyValue >
        createSortDescriptor() override;
    virtual void sort(
            const cpo::uno::Sequence< css::beans::PropertyValue >& xDescriptor) override;

    // XDocumentInsertable
    virtual void insertDocumentFromURL(
            const OUString& rURL,
            const cpo::uno::Sequence< css::beans::PropertyValue >& rOptions) override;

    // XTextRange
    virtual cpo::uno::Reference< css::text::XText >
        getText() override;
    virtual cpo::uno::Reference< css::text::XTextRange > getStart() override;
    virtual cpo::uno::Reference< css::text::XTextRange > getEnd() override;
    virtual OUString getString() override;
    virtual void setString(const OUString& rString) override;

    // XTextCursor
    virtual void collapseToStart() override;
    virtual void collapseToEnd() override;
    virtual bool isCollapsed() override;
    virtual bool goLeft(sal_Int16 nCount, bool bExpand) override;
    virtual bool goRight(sal_Int16 nCount, bool bExpand) override;
    virtual void gotoStart(bool bExpand) override;
    virtual void gotoEnd(bool bExpand) override;
    virtual void gotoRange(
            const cpo::uno::Reference< css::text::XTextRange >& xRange,
            bool bExpand) override;

    // XWordCursor
    virtual bool isStartOfWord() override;
    virtual bool isEndOfWord() override;
    virtual bool gotoNextWord(bool bExpand) override;
    virtual bool gotoPreviousWord(bool bExpand) override;
    virtual bool gotoEndOfWord(bool bExpand) override;
    virtual bool gotoStartOfWord(bool bExpand) override;

    // XSentenceCursor
    virtual bool isStartOfSentence() override;
    virtual bool isEndOfSentence() override;
    virtual bool gotoNextSentence(bool Expand) override;
    virtual bool gotoPreviousSentence(bool Expand) override;
    virtual bool gotoStartOfSentence(bool Expand) override;
    virtual bool gotoEndOfSentence(bool Expand) override;

    // XParagraphCursor
    virtual bool isStartOfParagraph() override;
    virtual bool isEndOfParagraph() override;
    virtual bool gotoStartOfParagraph(bool Expand) override;
    virtual bool gotoEndOfParagraph(bool Expand) override;
    virtual bool gotoNextParagraph(bool Expand) override;
    virtual bool gotoPreviousParagraph(bool Expand) override;

    // XRedline
    virtual void makeRedline(
            const OUString& rRedlineType,
            const cpo::uno::Sequence< css::beans::PropertyValue >& RedlineProperties) override;

    //XMarkingAccess
    virtual void invalidateMarkings(::sal_Int32 nType) override;

private:
    void gotoRangeImpl(
            const SwXTextRange* pRange,
            OTextCursorHelper* pCursor,
            bool bExpand);
};

#endif // INCLUDED_SW_INC_UNOTEXTCURSOR_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
