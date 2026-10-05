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

#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBATABLE_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBATABLE_HXX

#include <vbahelper/vbahelperinterface.hxx>
#include <com/sun/star/text/XTextDocument.hpp>
#include <com/sun/star/text/XTextTable.hpp>
#include <ooo/vba/word/XRange.hpp>
#include <ooo/vba/word/XTable.hpp>
#include <rtl/ref.hxx>

class SwXTextDocument;
class SwXTextTable;

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XTable > SwVbaTable_BASE;

class SwVbaTable : public SwVbaTable_BASE
{
    rtl::Reference< SwXTextDocument > mxTextDocument;
    rtl::Reference< SwXTextTable > mxTextTable;
public:
    /// @throws cpo::uno::RuntimeException
    SwVbaTable( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent, const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext, rtl::Reference< SwXTextDocument > xDocument, const rtl::Reference< SwXTextTable >& xTextTable);
    virtual cpo::uno::Reference< ::ooo::vba::word::XRange > Range(  ) override;
    virtual void Select(  ) override;
    virtual void Delete(  ) override;
    virtual OUString getName(  ) override;
    virtual cpo::uno::Any Borders( const cpo::uno::Any& aIndex ) override;
    virtual float getBottomPadding(  ) override;
    virtual void setBottomPadding( float fValue ) override;
    virtual float getLeftPadding(  ) override;
    virtual void setLeftPadding( float fValue ) override;
    virtual float getRightPadding(  ) override;
    virtual void setRightPadding( float fValue ) override;
    virtual float getTopPadding(  ) override;
    virtual void setTopPadding( float fValue ) override;
    virtual cpo::uno::Any Rows( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Columns( const cpo::uno::Any& aIndex ) override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
