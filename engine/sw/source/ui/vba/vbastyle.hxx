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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBASTYLE_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBASTYLE_HXX

#include <ooo/vba/word/XStyle.hpp>
#include <vbahelper/vbahelperinterface.hxx>
#include <i18nlangtag/lang.h>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/frame/XModel.hpp>
#include <com/sun/star/style/XStyle.hpp>
#include <ooo/vba/word/XFont.hpp>
#include <rtl/ref.hxx>

class SwXTextDocument;

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XStyle > SwVbaStyle_BASE;

class SwVbaStyle : public SwVbaStyle_BASE
{
private:
    rtl::Reference< SwXTextDocument > mxModel;
    cpo::uno::Reference< css::beans::XPropertySet > mxStyleProps;
    cpo::uno::Reference< css::style::XStyle > mxStyle;
public:
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    SwVbaStyle( const cpo::uno::Reference< ov::XHelperInterface >& xParent,
                const cpo::uno::Reference< cpo::uno::XComponentContext > & xContext,
                rtl::Reference< SwXTextDocument > xModel,
                const cpo::uno::Reference< css::beans::XPropertySet >& _xPropertySet );

    /// @throws cpo::uno::RuntimeException
    static void setStyle( const cpo::uno::Reference< css::beans::XPropertySet >& xParaProps, const cpo::uno::Any& xStyle );
    /// @throws cpo::uno::RuntimeException
    static LanguageType getLanguageID( const cpo::uno::Reference< css::beans::XPropertySet >& xTCProps );
    /// @throws cpo::uno::RuntimeException
    static void setLanguageID( const cpo::uno::Reference< css::beans::XPropertySet >& xTCProps, LanguageType _languageid );

    // Attributes
    virtual OUString getName() override;
    virtual void setName( const OUString& Name ) override;
    virtual ::sal_Int32 getLanguageID( ) override;
    virtual void setLanguageID( ::sal_Int32 _languageid ) override;
    virtual ::sal_Int32 getType() override;
    virtual cpo::uno::Reference< ooo::vba::word::XFont > getFont() override;
    virtual OUString getNameLocal() override;
    virtual void setNameLocal( const OUString& _namelocal ) override;
    virtual cpo::uno::Reference< ::ooo::vba::word::XParagraphFormat > getParagraphFormat() override;
    virtual bool getAutomaticallyUpdate() override;
    virtual void setAutomaticallyUpdate( bool _automaticallyupdate ) override;
    virtual cpo::uno::Any getBaseStyle() override;
    virtual void setBaseStyle( const cpo::uno::Any& _basestyle ) override;
    virtual cpo::uno::Any getNextParagraphStyle() override;
    virtual void setNextParagraphStyle( const cpo::uno::Any& _nextparagraphstyle ) override;
    virtual ::sal_Int32 getListLevelNumber() override;

    //XDefaultProperty
    virtual OUString getDefaultPropertyName(  ) override { return u"Name"_ustr; }

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};

#endif //SW_VBA_AXIS_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
