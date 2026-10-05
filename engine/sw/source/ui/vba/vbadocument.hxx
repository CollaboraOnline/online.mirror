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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBADOCUMENT_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBADOCUMENT_HXX

#include <ooo/vba/XSink.hpp>
#include <ooo/vba/XSinkCaller.hpp>
#include <ooo/vba/word/XDocument.hpp>
#include <vbahelper/vbadocumentbase.hxx>
#include <com/sun/star/text/XTextDocument.hpp>
#include <cppuhelper/implbase.hxx>
#include <rtl/ref.hxx>
#include <sfx2/sfxbasemodel.hxx>

#include <vector>

class SwXTextDocument;

typedef cppu::ImplInheritanceHelper< VbaDocumentBase, ooo::vba::word::XDocument, ooo::vba::XSinkCaller > SwVbaDocument_BASE;

class SwVbaDocument : public SwVbaDocument_BASE
{
private:
    rtl::Reference< SwXTextDocument > mxTextDocument;

    std::vector<cpo::uno::Reference< ooo::vba::XSink >> mvSinks;

    void Initialize();
    cpo::uno::Any getControlShape( std::u16string_view sName );
    cpo::uno::Reference< css::container::XNameAccess > getFormControls() const;

protected:
    // this should be SwXTextDocument, but the inheritance hierarchy makes that impossible
    virtual SfxBaseModel* getModel() const override;

public:
    SwVbaDocument( const cpo::uno::Reference< ooo::vba::XHelperInterface >& xParent, const cpo::uno::Reference< cpo::uno::XComponentContext >& m_xContext, rtl::Reference< SwXTextDocument > const & xModel );
    SwVbaDocument(  cpo::uno::Sequence< cpo::uno::Any > const& aArgs, cpo::uno::Reference< cpo::uno::XComponentContext >const& xContext );
    virtual ~SwVbaDocument() override;

    sal_uInt32 AddSink( const cpo::uno::Reference< ooo::vba::XSink >& xSink );
    void RemoveSink( sal_uInt32 nNumber );

    // XDocument
    virtual cpo::uno::Reference< ooo::vba::word::XRange > getContent() override;
    virtual cpo::uno::Reference< ooo::vba::word::XRange > Range( const cpo::uno::Any& rStart, const cpo::uno::Any& rEnd ) override;
    virtual cpo::uno::Any BuiltInDocumentProperties( const cpo::uno::Any& index ) override;
    virtual cpo::uno::Any CustomDocumentProperties( const cpo::uno::Any& index ) override;
    virtual cpo::uno::Any Bookmarks( const cpo::uno::Any& rIndex ) override;
    cpo::uno::Any ContentControls(const cpo::uno::Any& index) override;
    cpo::uno::Any SelectContentControlsByTag(const cpo::uno::Any& index) override;
    cpo::uno::Any SelectContentControlsByTitle(const cpo::uno::Any& index) override;
    cpo::uno::Reference<ov::word::XWindow> getActiveWindow() override;
    virtual cpo::uno::Any Variables( const cpo::uno::Any& rIndex ) override;
    virtual cpo::uno::Any getAttachedTemplate() override;
    virtual void setAttachedTemplate( const cpo::uno::Any& _attachedtemplate ) override;
    virtual cpo::uno::Any Paragraphs( const cpo::uno::Any& rIndex ) override;
    virtual cpo::uno::Any Styles( const cpo::uno::Any& rIndex ) override;
    virtual cpo::uno::Any Tables( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Fields( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Shapes( const cpo::uno::Any& aIndex ) override;
    virtual void Select() override;
    virtual cpo::uno::Any Sections( const cpo::uno::Any& aIndex ) override;
    virtual void Activate() override;
    virtual cpo::uno::Any PageSetup() override;
    virtual cpo::uno::Any TablesOfContents( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any FormFields( const cpo::uno::Any& aIndex ) override;
    virtual ::sal_Int32 getProtectionType() override;
    virtual void setProtectionType( ::sal_Int32 _protectiontype ) override;
    virtual bool getUpdateStylesOnOpen() override;
    virtual void setUpdateStylesOnOpen( bool _updatestylesonopen ) override;
    virtual bool getAutoHyphenation() override;
    virtual void setAutoHyphenation( bool _autohyphenation ) override;
    virtual ::sal_Int32 getHyphenationZone() override;
    virtual void setHyphenationZone( ::sal_Int32 _hyphenationzone ) override;
    virtual ::sal_Int32 getConsecutiveHyphensLimit() override;
    virtual void setConsecutiveHyphensLimit( ::sal_Int32 _consecutivehyphenslimit ) override;
    virtual cpo::uno::Reference< ooo::vba::word::XMailMerge > getMailMerge() override;

    using VbaDocumentBase::Protect;
    virtual void Protect( ::sal_Int32 Type, const cpo::uno::Any& NOReset, const cpo::uno::Any& Password, const cpo::uno::Any& UseIRM, const cpo::uno::Any& EnforceStyleLock ) override;
    virtual void PrintOut( const cpo::uno::Any& Background, const cpo::uno::Any& Append, const cpo::uno::Any& Range, const cpo::uno::Any& OutputFileName, const cpo::uno::Any& From, const cpo::uno::Any& To, const cpo::uno::Any& Item, const cpo::uno::Any& Copies, const cpo::uno::Any& Pages, const cpo::uno::Any& PageType, const cpo::uno::Any& PrintToFile, const cpo::uno::Any& Collate, const cpo::uno::Any& FileName, const cpo::uno::Any& ActivePrinterMacGX, const cpo::uno::Any& ManualDuplexPrint, const cpo::uno::Any& PrintZoomColumn, const cpo::uno::Any& PrintZoomRow, const cpo::uno::Any& PrintZoomPaperWidth, const cpo::uno::Any& PrintZoomPaperHeight ) override;
    virtual void PrintPreview(  ) override;
    virtual void ClosePrintPreview(  ) override;
    virtual cpo::uno::Any Revisions( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Frames( const cpo::uno::Any& aIndex ) override;
    virtual void SaveAs2000( const cpo::uno::Any& FileName, const cpo::uno::Any& FileFormat, const cpo::uno::Any& LockComments, const cpo::uno::Any& Password, const cpo::uno::Any& AddToRecentFiles, const cpo::uno::Any& WritePassword, const cpo::uno::Any& ReadOnlyRecommended, const cpo::uno::Any& EmbedTrueTypeFonts, const cpo::uno::Any& SaveNativePictureFormat, const cpo::uno::Any& SaveFormsData, const cpo::uno::Any& SaveAsAOCELetter ) override;
    virtual void SaveAs( const cpo::uno::Any& FileName, const cpo::uno::Any& FileFormat, const cpo::uno::Any& LockComments, const cpo::uno::Any& Password, const cpo::uno::Any& AddToRecentFiles, const cpo::uno::Any& WritePassword, const cpo::uno::Any& ReadOnlyRecommended, const cpo::uno::Any& EmbedTrueTypeFonts, const cpo::uno::Any& SaveNativePictureFormat, const cpo::uno::Any& SaveFormsData, const cpo::uno::Any& SaveAsAOCELetter, const cpo::uno::Any& Encoding, const cpo::uno::Any& InsertLineBreaks, const cpo::uno::Any& AllowSubstitutions, const cpo::uno::Any& LineEnding, const cpo::uno::Any& AddBiDiMarks ) override;
    virtual void Close( const cpo::uno::Any& SaveChanges, const cpo::uno::Any& OriginalFormat, const cpo::uno::Any& RouteDocument ) override;
    virtual void SavePreviewPngAs( const cpo::uno::Any& FileName ) override;

    // XInvocation
    virtual cpo::uno::Reference< css::beans::XIntrospectionAccess > getIntrospection(  ) override;
    virtual cpo::uno::Any invoke( const OUString& aFunctionName, const cpo::uno::Sequence< cpo::uno::Any >& aParams, cpo::uno::Sequence< ::sal_Int16 >& aOutParamIndex, cpo::uno::Sequence< cpo::uno::Any >& aOutParam ) override;
    virtual void setValue( const OUString& aPropertyName, const cpo::uno::Any& aValue ) override;
    virtual cpo::uno::Any getValue( const OUString& aPropertyName ) override;
    virtual bool hasMethod( const OUString& aName ) override;
    virtual bool hasProperty( const OUString& aName ) override;

    // XInterfaceWithIID
    virtual OUString getIID() override;

    // XConnectable
    virtual OUString GetIIDForClassItselfNotCoclass() override;
    virtual ov::TypeAndIID GetConnectionPoint() override;
    virtual cpo::uno::Reference<ov::XConnectionPoint> FindConnectionPoint() override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;

    // XSinkCaller
    virtual void CallSinks( const OUString& Method, cpo::uno::Sequence< cpo::uno::Any >& Arguments ) override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBADOCUMENT_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
