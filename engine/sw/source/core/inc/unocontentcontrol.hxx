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
#include <memory>
#include <deque>

#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/container/XChild.hpp>
#include <com/sun/star/container/XEnumerationAccess.hpp>
#include <com/sun/star/text/XTextContent.hpp>
#include <com/sun/star/text/XTextField.hpp>

#include <cppuhelper/implbase.hxx>

#include <unobaseclass.hxx>
#include <unocoll.hxx>

class SwTextNode;
class SwContentControl;
class SwXText;
class SwXTextPortion;

typedef std::deque<rtl::Reference<SwXTextPortion>> TextRangeList_t;

/**
 * UNO API wrapper around an SwContentControl, exposed as the com.sun.star.text.ContentControl
 * service.
 */
class SW_DLLPUBLIC SwXContentControl final
    : public cppu::WeakImplHelper<css::lang::XServiceInfo, css::container::XEnumerationAccess,
                                  css::text::XTextContent, css::text::XText,
                                  css::beans::XPropertySet>
{
    class Impl;
    sw::UnoImplPtr<Impl> m_pImpl;

protected:
    void AttachImpl(const cpo::uno::Reference<css::text::XTextRange>& xTextRange,
                    sal_uInt16 nWhich);

    ~SwXContentControl() override;

    SwXContentControl(const SwXContentControl&) = delete;
    SwXContentControl& operator=(const SwXContentControl&) = delete;

    SwXContentControl(SwDoc* pDoc, SwContentControl* pContentControl,
                      const cpo::uno::Reference<SwXText>& xParentText,
                      std::unique_ptr<const TextRangeList_t> pPortions);

    SwXContentControl(SwDoc* pDoc);

public:
    static rtl::Reference<SwXContentControl>
    CreateXContentControl(SwContentControl& rContentControl,
                          const cpo::uno::Reference<SwXText>& xParentText = nullptr,
                          std::unique_ptr<const TextRangeList_t>&& pPortions
                          = std::unique_ptr<const TextRangeList_t>());

    static rtl::Reference<SwXContentControl> CreateXContentControl(SwDoc& rDoc);

    /// Initializes params with position of the attribute content (without CH_TXTATR).
    bool SetContentRange(SwTextNode*& rpNode, sal_Int32& rStart, sal_Int32& rEnd) const;
    const cpo::uno::Reference<SwXText>& GetParentText() const;

    // XServiceInfo
    OUString getImplementationName() override;
    bool supportsService(const OUString& rServiceName) override;
    cpo::uno::Sequence<OUString> getSupportedServiceNames() override;

    // XComponent
    void dispose() override;
    void
    addEventListener(const cpo::uno::Reference<css::lang::XEventListener>& xListener) override;
    void
    removeEventListener(const cpo::uno::Reference<css::lang::XEventListener>& xListener) override;

    // XElementAccess
    cpo::uno::Type getElementType() override;
    bool hasElements() override;

    // XEnumerationAccess
    cpo::uno::Reference<css::container::XEnumeration> createEnumeration() override;

    // XTextContent
    void attach(const cpo::uno::Reference<css::text::XTextRange>& xTextRange) override;
    cpo::uno::Reference<css::text::XTextRange> getAnchor() override;

    // XTextRange
    cpo::uno::Reference<css::text::XText> getText() override;
    cpo::uno::Reference<css::text::XTextRange> getStart() override;
    cpo::uno::Reference<css::text::XTextRange> getEnd() override;
    OUString getString() override;
    void setString(const OUString& rString) override;

    // XSimpleText
    cpo::uno::Reference<css::text::XTextCursor> createTextCursor() override;
    cpo::uno::Reference<css::text::XTextCursor> createTextCursorByRange(
        const cpo::uno::Reference<css::text::XTextRange>& xTextPosition) override;
    void insertString(const cpo::uno::Reference<css::text::XTextRange>& xRange,
                               const OUString& aString, bool bAbsorb) override;
    void insertControlCharacter(const cpo::uno::Reference<css::text::XTextRange>& xRange,
                                         sal_Int16 nControlCharacter, bool bAbsorb) override;

    // XText
    void insertTextContent(const cpo::uno::Reference<css::text::XTextRange>& xRange,
                                    const cpo::uno::Reference<css::text::XTextContent>& xContent,
                                    bool bAbsorb) override;
    void
    removeTextContent(const cpo::uno::Reference<css::text::XTextContent>& xContent) override;

    // XPropertySet
    cpo::uno::Reference<css::beans::XPropertySetInfo> getPropertySetInfo() override;
    void setPropertyValue(const OUString& rPropertyName,
                                   const cpo::uno::Any& rValue) override;
    cpo::uno::Any getPropertyValue(const OUString& rPropertyName) override;
    void addPropertyChangeListener(
        const OUString& rPropertyName,
        const cpo::uno::Reference<css::beans::XPropertyChangeListener>& xListener) override;
    void removePropertyChangeListener(
        const OUString& rPropertyName,
        const cpo::uno::Reference<css::beans::XPropertyChangeListener>& xListener) override;
    void addVetoableChangeListener(
        const OUString& rPropertyName,
        const cpo::uno::Reference<css::beans::XVetoableChangeListener>& xListener) override;
    void removeVetoableChangeListener(
        const OUString& rPropertyName,
        const cpo::uno::Reference<css::beans::XVetoableChangeListener>& xListener) override;
};

/// UNO wrapper around SwContentControlManager.
class SwXContentControls final : public cppu::WeakImplHelper<css::container::XIndexAccess>,
                                 public SwUnoCollection
{
    ~SwXContentControls() override;

public:
    SwXContentControls(SwDoc* pDoc);

    // XIndexAccess
    sal_Int32 getCount() override;
    cpo::uno::Any getByIndex(sal_Int32 nIndex) override;

    // XElementAccess
    cpo::uno::Type getElementType() override;
    bool hasElements() override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
