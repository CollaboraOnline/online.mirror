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
#include <com/sun/star/container/XEnumeration.hpp>
#include <com/sun/star/util/XUpdatable.hpp>
#include <com/sun/star/text/XDependentTextField.hpp>

#include <cppuhelper/implbase.hxx>

#include <unobaseclass.hxx>
#include <unocoll.hxx>
#include <fldbas.hxx>
#include <names.hxx>

class SwDoc;
class SwFormatField;
class SwSetExpField;
class ProgName;

typedef ::cppu::WeakImplHelper
<   css::beans::XPropertySet
,   css::lang::XServiceInfo
,   css::lang::XComponent
> SwXFieldMaster_Base;

class SW_DLLPUBLIC SwXFieldMaster final
    : public SwXFieldMaster_Base
{

private:
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    virtual ~SwXFieldMaster() override;

    SwXFieldMaster(SwFieldType& rType, SwDoc * pDoc);

    /// descriptor
    SwXFieldMaster(SwDoc& rDoc, SwFieldIds nResId);

public:

    static rtl::Reference<SwXFieldMaster>
        CreateXFieldMaster(SwDoc * pDoc, SwFieldType * pType,
                SwFieldIds nResId = SwFieldIds::Unknown);

    static ProgName GetProgrammaticName(const SwFieldType& rType, SwDoc& rDoc);
    static OUString LocalizeFormula(const SwSetExpField& rField, const OUString& rFormula, bool bQuery);

    SwFieldType* GetFieldType(bool bDontCreate = false) const;

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

};

typedef ::cppu::WeakImplHelper
<   css::text::XDependentTextField
,   css::lang::XServiceInfo
,   css::beans::XPropertySet
,   css::util::XUpdatable
> SwXTextField_Base;

/**
 * UNO wrapper around an SwFormatField, i.e. a Writer field that the user creates via Insert ->
 * Field.
 */
class SW_DLLPUBLIC SwXTextField final
    : public SwXTextField_Base
{

private:
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    virtual ~SwXTextField() override;

    SwXTextField(SwFormatField& rFormat, SwDoc & rDoc);

    /// descriptor
    SwXTextField(SwServiceType nServiceId, SwDoc* pDoc);

public:
    SwServiceType GetServiceId() const;

    static void TransmuteLeadToInputField(SwSetExpField & rField, std::optional<SwGetSetExpType> oSubType);

    /// @return an SwXTextField, either an already existing one or a new one
    static rtl::Reference<SwXTextField>
        CreateXTextField(SwDoc * pDoc, SwFormatField const* pFormat,
                SwServiceType nServiceId = SwServiceType::Invalid);

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

    // XUpdatable
    virtual void update() override;

    // XTextContent
    virtual void attach(
            const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor() override;

    // XTextField
    virtual OUString getPresentation(bool bShowCommand) override;

    // XDependentTextField
    virtual void attachTextFieldMaster(
            const cpo::uno::Reference< css::beans::XPropertySet > & xFieldMaster) override;
    virtual cpo::uno::Reference< css::beans::XPropertySet> getTextFieldMaster() override;

    void OnFormatFieldDelete();

};

typedef ::cppu::WeakImplHelper
<   css::container::XEnumeration
,   css::lang::XServiceInfo
> SwXFieldEnumeration_Base;

class SW_DLLPUBLIC SwXFieldEnumeration final
    : public SwXFieldEnumeration_Base
{

private:
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    virtual ~SwXFieldEnumeration() override;

public:
    explicit SwXFieldEnumeration(SwDoc & rDoc);

    // XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(
            const OUString& rServiceName) override;
    virtual cpo::uno::Sequence< OUString >
        getSupportedServiceNames() override;

    // XEnumeration
    virtual bool hasMoreElements() override;
    virtual cpo::uno::Any nextElement() override;

};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
