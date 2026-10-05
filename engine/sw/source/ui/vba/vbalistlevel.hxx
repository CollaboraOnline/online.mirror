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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBALISTLEVEL_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBALISTLEVEL_HXX

#include <ooo/vba/word/XListLevel.hpp>
#include <vbahelper/vbahelperinterface.hxx>
#include "vbalisthelper.hxx"

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XListLevel > SwVbaListLevel_BASE;

class SwVbaListLevel : public SwVbaListLevel_BASE
{
private:
    SwVbaListHelperRef m_pListHelper;
    sal_Int32 mnLevel;

public:
    /// @throws cpo::uno::RuntimeException
    SwVbaListLevel( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent, const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext, SwVbaListHelperRef  pHelper, sal_Int32 nLevel );
    virtual ~SwVbaListLevel() override;

    // Attributes
    virtual ::sal_Int32 getAlignment() override;
    virtual void setAlignment( ::sal_Int32 _alignment ) override;
    virtual cpo::uno::Reference< ::ooo::vba::word::XFont > getFont() override;
    virtual void setFont( const cpo::uno::Reference< ::ooo::vba::word::XFont >& _font ) override;
    virtual ::sal_Int32 getIndex() override;
    virtual OUString getLinkedStyle() override;
    virtual void setLinkedStyle( const OUString& _linkedstyle ) override;
    virtual OUString getNumberFormat() override;
    virtual void setNumberFormat( const OUString& _numberformat ) override;
    virtual float getNumberPosition() override;
    virtual void setNumberPosition( float _numberposition ) override;
    virtual ::sal_Int32 getNumberStyle() override;
    virtual void setNumberStyle( ::sal_Int32 _numberstyle ) override;
    virtual ::sal_Int32 getResetOnHigher() override;
    virtual void setResetOnHigher( ::sal_Int32 _resetonhigher ) override;
    virtual ::sal_Int32 getStartAt() override;
    virtual void setStartAt( ::sal_Int32 _startat ) override;
    virtual float getTabPosition() override;
    virtual void setTabPosition( float _tabposition ) override;
    virtual float getTextPosition() override;
    virtual void setTextPosition( float _textposition ) override;
    virtual ::sal_Int32 getTrailingCharacter() override;
    virtual void setTrailingCharacter( ::sal_Int32 _trailingcharacter ) override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBALISTLEVEL_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
