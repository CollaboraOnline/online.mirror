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

#include "swdllapi.h"
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/beans/XPropertyState.hpp>
#include <com/sun/star/beans/XMultiPropertySet.hpp>
#include <com/sun/star/container/XNamed.hpp>
#include <com/sun/star/text/XTextSection.hpp>

#include <cppuhelper/implbase.hxx>

#include <sfx2/Metadatable.hxx>

#include "unobaseclass.hxx"

class SwSectionFormat;

typedef ::cppu::ImplInheritanceHelper
<   ::sfx2::MetadatableMixin
,   css::lang::XServiceInfo
,   css::beans::XPropertySet
,   css::container::XNamed
,   css::text::XTextContent
> SwXSection_Base;

/// Base class for SwXTextSection and SwXDocumentIndex
class SW_DLLPUBLIC SwXSection
    : public SwXSection_Base
{
public:
    ~SwXSection();
};


typedef ::cppu::ImplInheritanceHelper
<   SwXSection
,   css::beans::XPropertyState
,   css::beans::XMultiPropertySet
,   css::text::XTextSection
> SwXTextSection_Base;

class SW_DLLPUBLIC SwXTextSection final
    : public SwXTextSection_Base
{

private:

    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    SwXTextSection(SwSectionFormat *const pFormat, const bool bIndexHeader);

    virtual ~SwXTextSection() override;

public:

    SwSectionFormat*   GetFormat() const;

    static rtl::Reference< SwXTextSection >
        CreateXTextSection(SwSectionFormat *const pFormat,
                const bool bIndexHeader = false);

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
            const cpo::uno::Sequence< OUString >&  rPropertyNames,
            const cpo::uno::Sequence< cpo::uno::Any >& rValues) override;
    virtual cpo::uno::Sequence< cpo::uno::Any >
        getPropertyValues(
            const cpo::uno::Sequence< OUString >& rPropertyNames) override;
    virtual void addPropertiesChangeListener(
            const cpo::uno::Sequence< OUString >& rPropertyNames,
            const cpo::uno::Reference< css::beans::XPropertiesChangeListener >& xListener) override;
    virtual void removePropertiesChangeListener(
            const cpo::uno::Reference< css::beans::XPropertiesChangeListener >& xListener) override;
    virtual void firePropertiesChangeEvent(
            const cpo::uno::Sequence< OUString >&  rPropertyNames,
            const cpo::uno::Reference< css::beans::XPropertiesChangeListener >& xListener) override;

    // XNamed
    virtual OUString getName() override;
    virtual void setName(const OUString& rName) override;

    // XTextContent
    virtual void attach(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor() override;

    // XTextSection
    virtual cpo::uno::Reference< css::text::XTextSection >
        getParentSection() override;
    virtual cpo::uno::Sequence< cpo::uno::Reference< css::text::XTextSection >  >
        getChildSections() override;

};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
