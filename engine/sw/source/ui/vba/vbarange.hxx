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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBARANGE_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBARANGE_HXX

#include <ooo/vba/word/XRange.hpp>
#include <ooo/vba/word/XParagraphFormat.hpp>
#include <ooo/vba/word/XFont.hpp>
#include <ooo/vba/word/XFind.hpp>
#include <vbahelper/vbahelperinterface.hxx>
#include <com/sun/star/text/XTextRange.hpp>
#include <com/sun/star/text/XTextDocument.hpp>
#include <ooo/vba/word/XListFormat.hpp>
#include <rtl/ref.hxx>

class SwXTextDocument;

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XRange > SwVbaRange_BASE;

class SwVbaRange : public SwVbaRange_BASE
{
private:
    rtl::Reference< SwXTextDocument > mxTextDocument;
    cpo::uno::Reference< css::text::XTextCursor >   mxTextCursor;
    cpo::uno::Reference< css::text::XText >         mxText;

private:
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    void initialize( const cpo::uno::Reference< css::text::XTextRange >& rStart, const cpo::uno::Reference< css::text::XTextRange >& rEnd );
    /// @throws cpo::uno::RuntimeException
    void GetStyleInfo(OUString& aStyleName, OUString& aStyleType );
public:
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    SwVbaRange( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent,
                const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext,
                rtl::Reference< SwXTextDocument > xTextDocument,
                const cpo::uno::Reference< css::text::XTextRange >& rStart);
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    SwVbaRange( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent,
                const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext,
                rtl::Reference< SwXTextDocument > xTextDocument,
                const cpo::uno::Reference< css::text::XTextRange >& rStart,
                const cpo::uno::Reference< css::text::XTextRange >& rEnd );
    /// @throws css::script::BasicErrorException
    /// @throws cpo::uno::RuntimeException
    SwVbaRange( const cpo::uno::Reference< ooo::vba::XHelperInterface >& rParent,
                const cpo::uno::Reference< cpo::uno::XComponentContext >& rContext,
                rtl::Reference< SwXTextDocument > xTextDocument,
                const cpo::uno::Reference< css::text::XTextRange >& rStart,
                const cpo::uno::Reference< css::text::XTextRange >& rEnd,
                cpo::uno::Reference< css::text::XText > xText);
    virtual ~SwVbaRange() override;
    const rtl::Reference< SwXTextDocument >& getDocument() const { return mxTextDocument; }

    virtual cpo::uno::Reference< css::text::XTextRange > getXTextRange() override;
    const cpo::uno::Reference< css::text::XText >& getXText() const { return mxText; }
    void setXTextCursor( const cpo::uno::Reference< css::text::XTextCursor >& xTextCursor ) { mxTextCursor = xTextCursor; }

    // Attribute
    virtual OUString getText() override;
    virtual void setText( const OUString& rText ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XParagraphFormat > getParagraphFormat() override;
    virtual void setParagraphFormat( const cpo::uno::Reference< ooo::vba::word::XParagraphFormat >& rParagraphFormat ) override;
    virtual cpo::uno::Any getStyle() override;
    virtual void setStyle( const cpo::uno::Any& _xStyle ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XFont > getFont() override;
    virtual cpo::uno::Reference< ooo::vba::word::XFind > getFind() override;
    virtual cpo::uno::Reference< ooo::vba::word::XListFormat > getListFormat() override;

    //XDefaultProperty
    virtual OUString getDefaultPropertyName() override { return u"Text"_ustr; }

    // Methods
    virtual void InsertBreak(const cpo::uno::Any& _breakType) override;
    virtual void Select() override;
    virtual void InsertParagraph() override;
    virtual void InsertParagraphBefore() override;
    virtual void InsertParagraphAfter() override;
    virtual ::sal_Int32 getLanguageID() override;
    virtual void setLanguageID( ::sal_Int32 _languageid ) override;
    virtual cpo::uno::Any PageSetup() override;
    virtual ::sal_Int32 getStart() override;
    virtual void setStart( ::sal_Int32 _start ) override;
    virtual ::sal_Int32 getEnd() override;
    virtual void setEnd( ::sal_Int32 _end ) override;
    virtual bool InRange( const cpo::uno::Reference< ::ooo::vba::word::XRange >& Range ) override;
    virtual cpo::uno::Any Revisions( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Sections( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Fields( const cpo::uno::Any& aIndex ) override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBARANGE_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
