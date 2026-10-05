/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBAAPPLICATION_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBAAPPLICATION_HXX

#include <vector>

#include <ooo/vba/XSink.hpp>
#include <ooo/vba/XSinkCaller.hpp>
#include <ooo/vba/word/XApplication.hpp>
#include <ooo/vba/word/XDocument.hpp>
#include <ooo/vba/word/XWindow.hpp>
#include <ooo/vba/word/XSystem.hpp>
#include <ooo/vba/word/XOptions.hpp>
#include <ooo/vba/word/XSelection.hpp>
#include <vbahelper/vbaapplicationbase.hxx>
#include <cppuhelper/implbase.hxx>
#include <rtl/ref.hxx>
#include <sfx2/sfxbasemodel.hxx>

#include "vbawindow.hxx"

class SwXTextDocument;

typedef cppu::ImplInheritanceHelper< VbaApplicationBase, ooo::vba::word::XApplication, ooo::vba::XSinkCaller > SwVbaApplication_BASE;

// This class is currently not a singleton. One instance is created per document with (potential?)
// StarBasic code in it, I think, and a shared one for all Automation clients connected to the
// ooo::vba::word::Application (Writer.Application) service. (Of course it probably is not common to
// have several Automation clients at once.)

// Should it be a true singleton? Hard to say. Anyway, it is actually the SwVbaGlobals class that
// should be a singleton in that case, I think.

class SwVbaApplication : public SwVbaApplication_BASE
{
    std::vector<cpo::uno::Reference< ooo::vba::XSink >> mvSinks;

public:
    explicit SwVbaApplication( cpo::uno::Reference< cpo::uno::XComponentContext >& xContext );
    virtual ~SwVbaApplication() override;

    sal_uInt32 AddSink( const cpo::uno::Reference< ooo::vba::XSink >& xSink );
    void RemoveSink( sal_uInt32 nNumber );

    rtl::Reference<SwVbaWindow> getActiveSwVbaWindow();
    cpo::uno::Reference< cpo::uno::XComponentContext > const & getContext() const;

    // XApplication
    virtual OUString getName() override;
    virtual cpo::uno::Reference< ooo::vba::word::XSystem > getSystem() override;
    virtual cpo::uno::Reference< ov::word::XDocument > getActiveDocument() override;
    virtual cpo::uno::Reference< ov::word::XWindow > getActiveWindow() override;
    virtual cpo::uno::Reference< ooo::vba::word::XOptions > getOptions() override;
    virtual cpo::uno::Reference< ooo::vba::word::XSelection > getSelection() override;
    virtual cpo::uno::Reference< ooo::vba::word::XWordBasic > getWordBasic() override;
    virtual cpo::uno::Any CommandBars( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Documents( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Addins( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any Dialogs( const cpo::uno::Any& aIndex ) override;
    virtual cpo::uno::Any ListGalleries( const cpo::uno::Any& aIndex ) override;
    virtual bool getDisplayAutoCompleteTips() override;
    virtual void setDisplayAutoCompleteTips( bool _displayAutoCompleteTips ) override;
    virtual sal_Int32 getEnableCancelKey() override;
    virtual void setEnableCancelKey( sal_Int32 _enableCancelKey ) override;
    virtual sal_Int32 getWindowState() override;
    virtual void setWindowState( sal_Int32 _windowstate ) override;
    virtual sal_Int32 getWidth() override;
    virtual void setWidth( sal_Int32 _width ) override;
    virtual sal_Int32 getHeight() override;
    virtual void setHeight( sal_Int32 _height ) override;
    virtual sal_Int32 getLeft() override;
    virtual void setLeft( sal_Int32 _left ) override;
    virtual sal_Int32 getTop() override;
    virtual void setTop( sal_Int32 _top ) override;
    virtual OUString getStatusBar() override;
    virtual void setStatusBar( const OUString& _statusbar ) override;
    virtual cpo::uno::Any getCustomizationContext() override;
    virtual void setCustomizationContext( const cpo::uno::Any& _customizationcontext ) override;
    virtual float CentimetersToPoints( float Centimeters ) override;
    virtual float PointsToCentimeters( float Points ) override;
    virtual float PixelsToPoints( float Pixels, bool fVertical ) override;
    virtual float PointsToPixels( float Pixels, bool fVertical ) override;
    virtual float InchesToPoints( float Inches ) override;
    virtual float PointsToInches( float Points ) override;
    virtual float MillimetersToPoints( float Millimeters ) override;
    virtual float PointsToMillimeters( float Points ) override;
    virtual float PicasToPoints( float Picas ) override;
    virtual float PointsToPicas( float Points ) override;



    virtual void ShowMe() override;
    virtual void Resize( sal_Int32 Width, sal_Int32 Height ) override;
    virtual void Move( sal_Int32 Left, sal_Int32 Top ) override;

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

    // this should be SwXTextDocument, but the inheritance hierarchy makes that impossible
    virtual SfxBaseModel* getCurrentDocument() override;

    rtl::Reference<SwXTextDocument> getCurrentSwDocument();
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBAAPPLICATION_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
