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
#include <cppuhelper/implbase.hxx>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/text/XTextContent.hpp>

#include <unobaseclass.hxx>

class SwFormatLineBreak;

/// UNO API wrapper around an SwFormatLineBreak, exposed as the com.sun.star.text.LineBreak service.
class SW_DLLPUBLIC SwXLineBreak final
    : public cppu::WeakImplHelper<css::beans::XPropertySet, css::lang::XServiceInfo,
                                  css::text::XTextContent>
{
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    SwXLineBreak(SwFormatLineBreak& rFormat);
    SwXLineBreak();

    ~SwXLineBreak() override;

public:
    static rtl::Reference<SwXLineBreak> CreateXLineBreak(SwFormatLineBreak* pLineBreakFormat);

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

    // XServiceInfo
    OUString getImplementationName() override;
    bool supportsService(const OUString& rServiceName) override;
    cpo::uno::Sequence<OUString> getSupportedServiceNames() override;

    // XTextContent
    void attach(const cpo::uno::Reference<css::text::XTextRange>& xTextRange) override;
    cpo::uno::Reference<css::text::XTextRange> getAnchor() override;

    // XComponent, via XTextContent
    void dispose() override;
    void
    addEventListener(const cpo::uno::Reference<css::lang::XEventListener>& xListener) override;
    void
    removeEventListener(const cpo::uno::Reference<css::lang::XEventListener>& xListener) override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
