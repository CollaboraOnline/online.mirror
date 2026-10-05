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
#ifndef INCLUDED_SW_INC_UNOSRCH_HXX
#define INCLUDED_SW_INC_UNOSRCH_HXX

#include <com/sun/star/util/XPropertyReplace.hpp>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <cppuhelper/implbase.hxx>
#include <rtl/ustring.hxx>
#include <memory>

class SfxItemPropertySet;
class SwSearchProperties_Impl;
class SfxItemSet;

namespace i18nutil {
    struct SearchOptions2;
}

class SwXTextSearch final : public cppu::WeakImplHelper
<
    css::util::XPropertyReplace,
    css::lang::XServiceInfo
>
{
    friend class SwXTextDocument;

    OUString                m_sSearchText;
    OUString                m_sReplaceText;

    std::unique_ptr<SwSearchProperties_Impl> m_pSearchProperties;
    std::unique_ptr<SwSearchProperties_Impl> m_pReplaceProperties;

    const SfxItemPropertySet*   m_pPropSet;
    bool                    m_bAll  : 1;
    bool                    m_bWord : 1;
    bool                    m_bBack : 1;
    bool                    m_bExpr : 1;
    bool                    m_bCase : 1;
    bool                    m_bStyles:1;
    bool                    m_bSimilarity : 1;
    bool                    m_bLevRelax       :1;
    sal_Int16                   m_nLevExchange;
    sal_Int16                   m_nLevAdd;
    sal_Int16                   m_nLevRemove;

    bool                    m_bIsValueSearch :1;

    virtual ~SwXTextSearch() override;
public:
    SwXTextSearch();

    //XSearchDescriptor
    virtual OUString getSearchString(  ) override;
    virtual void setSearchString( const OUString& aString ) override;

    //XReplaceDescriptor
    virtual OUString getReplaceString() override;
    virtual void setReplaceString(const OUString& aReplaceString) override;

    //XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo > getPropertySetInfo(  ) override;
    virtual void setPropertyValue( const OUString& aPropertyName, const cpo::uno::Any& aValue ) override;
    virtual cpo::uno::Any getPropertyValue( const OUString& PropertyName ) override;
    virtual void addPropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener ) override;
    virtual void removePropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& aListener ) override;
    virtual void addVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;
    virtual void removeVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;

    //XPropertyReplace
    virtual bool getValueSearch() override;
    virtual void setValueSearch(bool ValueSearch_) override;
    virtual cpo::uno::Sequence< css::beans::PropertyValue > getSearchAttributes() override;
    virtual void setSearchAttributes(const cpo::uno::Sequence< css::beans::PropertyValue >& aSearchAttribs) override;
    virtual cpo::uno::Sequence< css::beans::PropertyValue > getReplaceAttributes() override;
    virtual void setReplaceAttributes(const cpo::uno::Sequence< css::beans::PropertyValue >& aSearchAttribs) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;

    void    FillSearchItemSet(SfxItemSet& rSet) const;
    void    FillReplaceItemSet(SfxItemSet& rSet) const;

    bool    HasSearchAttributes() const;
    bool    HasReplaceAttributes() const;

    void    FillSearchOptions( i18nutil::SearchOptions2& rSearchOpt ) const;
};

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
