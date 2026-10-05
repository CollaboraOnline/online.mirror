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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBASELECTION_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBASELECTION_HXX

#include <ooo/vba/word/XSelection.hpp>
#include <ooo/vba/word/XRange.hpp>
#include <vbahelper/vbahelperinterface.hxx>
#include <com/sun/star/text/XTextViewCursor.hpp>
#include <com/sun/star/text/XTextTable.hpp>
#include <ooo/vba/word/XParagraphFormat.hpp>
#include <ooo/vba/word/XFind.hpp>
#include <ooo/vba/word/XFont.hpp>
#include <ooo/vba/word/XHeaderFooter.hpp>
#include "wordvbahelper.hxx"

class SwXTextTable;

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XSelection > SwVbaSelection_BASE;

class SwVbaSelection : public SwVbaSelection_BASE
{
private:
    rtl::Reference< SwXTextDocument > mxModel;
    cpo::uno::Reference< css::text::XTextViewCursor > mxTextViewCursor;

private:
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    void Move( const cpo::uno::Any& _unit, const cpo::uno::Any& _count, const cpo::uno::Any& _extend, ooo::vba::word::E_DIRECTION eDirection );
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    void NextCell( sal_Int32 nCount, ooo::vba::word::E_DIRECTION eDirection );
    /// @throws cpo::uno::RuntimeException
    cpo::uno::Reference< css::text::XTextRange > GetSelectedRange();
    /// @throws cpo::uno::RuntimeException
    void GetSelectedCellRange( OUString& sTLName, OUString& sBRName );
    /// @throws cpo::uno::RuntimeException
    rtl::Reference< SwXTextTable > GetXTextTable() const;
    /// @throws cpo::uno::RuntimeException
    bool IsInTable() const;
    /// @throws cpo::uno::RuntimeException
    bool HasSelection();

public:
    /// @throws cpo::uno::RuntimeException
    SwVbaSelection( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent, const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext, rtl::Reference< SwXTextDocument > xModel );
    virtual ~SwVbaSelection() override;

    // Attribute
    virtual OUString getText() override;
    virtual void setText( const OUString& rText ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XRange > getRange() override;
    virtual void HomeKey( const cpo::uno::Any& _unit, const cpo::uno::Any& _extend ) override;
    virtual void EndKey( const cpo::uno::Any& _unit, const cpo::uno::Any& _extend ) override;
    virtual void TypeText( const OUString& rText ) override;
    virtual void Delete( const cpo::uno::Any& _unit, const cpo::uno::Any& _count ) override;
    virtual void MoveRight( const cpo::uno::Any& _unit, const cpo::uno::Any& _count, const cpo::uno::Any& _extend ) override;
    virtual void MoveLeft( const cpo::uno::Any& _unit, const cpo::uno::Any& _count, const cpo::uno::Any& _extend ) override;
    virtual void MoveDown( const cpo::uno::Any& _unit, const cpo::uno::Any& _count, const cpo::uno::Any& _extend ) override;
    virtual void MoveUp( const cpo::uno::Any& _unit, const cpo::uno::Any& _count, const cpo::uno::Any& _extend ) override;
    virtual void TypeParagraph() override;
    virtual void InsertParagraph() override;
    virtual void InsertParagraphBefore() override;
    virtual void InsertParagraphAfter() override;
    virtual cpo::uno::Reference< ooo::vba::word::XParagraphFormat > getParagraphFormat() override;
    virtual void setParagraphFormat( const cpo::uno::Reference< ooo::vba::word::XParagraphFormat >& rParagraphFormat ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XFind > getFind() override;
    virtual cpo::uno::Any getStyle() override;
    virtual void setStyle( const cpo::uno::Any& _xStyle ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XFont > getFont() override;
    virtual void TypeBackspace() override;
    virtual cpo::uno::Reference< ooo::vba::word::XRange > GoTo( const cpo::uno::Any& _what, const cpo::uno::Any& _which, const cpo::uno::Any& _count, const cpo::uno::Any& _name ) override;
    virtual ::sal_Int32 getLanguageID( ) override;
    virtual void setLanguageID( ::sal_Int32 _languageid ) override;
    virtual cpo::uno::Any Information( sal_Int32 _type ) override;
    virtual void InsertBreak( const cpo::uno::Any& _breakType ) override;
    virtual cpo::uno::Any Tables( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Fields( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XHeaderFooter > getHeaderFooter() override;
    virtual cpo::uno::Any ShapeRange( ) override;
    virtual ::sal_Int32 getStart() override;
    virtual void setStart( ::sal_Int32 _start ) override;
    virtual ::sal_Int32 getEnd() override;
    virtual void setEnd( ::sal_Int32 _end ) override;
    virtual void SelectRow() override;
    virtual void SelectColumn() override;
    virtual cpo::uno::Any Rows( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Columns( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Cells( const cpo::uno::Any& aIndex ) override;
    virtual void Copy(  ) override;
    virtual void CopyAsPicture(  ) override;
    virtual void Paste(  ) override;
    virtual void Collapse( const cpo::uno::Any& Direction ) override;
    virtual void WholeStory(  ) override;
    virtual bool InRange( const cpo::uno::Reference< ::ooo::vba::word::XRange >& Range ) override;
    virtual void SplitTable() override;
    virtual cpo::uno::Any Paragraphs( const cpo::uno::Any& aIndex ) override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBASELECTION_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
