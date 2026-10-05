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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBAPARAGRAPHFORMAT_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBAPARAGRAPHFORMAT_HXX

#include <ooo/vba/word/XParagraphFormat.hpp>
#include <vbahelper/vbahelperinterface.hxx>
#include <com/sun/star/style/LineSpacing.hpp>
#include <com/sun/star/style/ParagraphAdjust.hpp>

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XParagraphFormat > SwVbaParagraphFormat_BASE;

class SwVbaParagraphFormat : public SwVbaParagraphFormat_BASE
{
private:
    cpo::uno::Reference< css::beans::XPropertySet > mxParaProps;

private:
    static css::style::LineSpacing getOOoLineSpacing( float _lineSpace, sal_Int16 mode );
    css::style::LineSpacing getOOoLineSpacingFromRule( sal_Int32 _linespacingrule );
    static float getMSWordLineSpacing( css::style::LineSpacing const & rLineSpacing );
    static sal_Int32 getMSWordLineSpacingRule( css::style::LineSpacing const & rLineSpacing );
    /// @throws cpo::uno::RuntimeException
    sal_Int16 getCharHeight();
    static css::style::ParagraphAdjust getOOoAlignment( sal_Int32 _alignment );
    static sal_Int32 getMSWordAlignment( css::style::ParagraphAdjust _alignment );

public:
    SwVbaParagraphFormat( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent, const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext, cpo::uno::Reference< css::beans::XPropertySet > xParaProps );
    virtual ~SwVbaParagraphFormat() override;

    // Attributes
    virtual ::sal_Int32 getAlignment() override;
    virtual void setAlignment( ::sal_Int32 _alignment ) override;
    virtual float getFirstLineIndent() override;
    virtual void setFirstLineIndent( float _firstlineindent ) override;
    virtual cpo::uno::Any getKeepTogether() override;
    virtual void setKeepTogether( const cpo::uno::Any& _keeptogether ) override;
    virtual cpo::uno::Any getKeepWithNext() override;
    virtual void setKeepWithNext( const cpo::uno::Any& _keepwithnext ) override;
    virtual cpo::uno::Any getHyphenation() override;
    virtual void setHyphenation( const cpo::uno::Any& _hyphenation ) override;
    virtual float getLineSpacing() override;
    virtual void setLineSpacing( float _linespacing ) override;
    virtual ::sal_Int32 getLineSpacingRule() override;
    virtual void setLineSpacingRule( ::sal_Int32 _linespacingrule ) override;
    virtual cpo::uno::Any getNoLineNumber() override;
    virtual void setNoLineNumber( const cpo::uno::Any& _nolinenumber ) override;
    virtual ::sal_Int32 getOutlineLevel() override;
    virtual void setOutlineLevel( ::sal_Int32 _outlinelevel ) override;
    virtual cpo::uno::Any getPageBreakBefore() override;
    virtual void setPageBreakBefore( const cpo::uno::Any& _pagebreakbefore ) override;
    virtual float getSpaceBefore() override;
    virtual void setSpaceBefore( float _spacebefore ) override;
    virtual float getSpaceAfter() override;
    virtual void setSpaceAfter( float _spaceafter ) override;
    virtual float getLeftIndent() override;
    virtual void setLeftIndent( float _leftindent ) override;
    virtual float getRightIndent() override;
    virtual void setRightIndent( float _rightindent ) override;
    virtual cpo::uno::Any getTabStops() override;
    virtual void setTabStops( const cpo::uno::Any& _tabstops ) override;
    virtual cpo::uno::Any getWidowControl() override;
    virtual void setWidowControl( const cpo::uno::Any& _widowcontrol ) override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBAPARAGRAPHFORMAT_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
