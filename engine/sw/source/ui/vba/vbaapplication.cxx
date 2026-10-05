/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column:100 -*- */
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

#include <com/sun/star/task/XStatusIndicatorSupplier.hpp>
#include <com/sun/star/task/XStatusIndicator.hpp>
#include <com/sun/star/util/thePathSettings.hpp>
#include <com/sun/star/awt/XDevice.hpp>

#include "vbaapplication.hxx"
#include "vbadocument.hxx"
#include "vbafilterpropsfromformat.hxx"
#include <sal/log.hxx>
#include <osl/file.hxx>
#include <vcl/svapp.hxx>
#include <vbahelper/vbahelper.hxx>
#include "vbawindow.hxx"
#include "vbasystem.hxx"
#include "vbaoptions.hxx"
#include "vbaselection.hxx"
#include "vbadocuments.hxx"
#include "vbaaddins.hxx"
#include "vbamailmerge.hxx"
#include "vbadialogs.hxx"
#include "vbawordbasic.hxx"
#include <ooo/vba/XConnectionPoint.hpp>
#include <ooo/vba/word/WdEnableCancelKey.hpp>
#include <ooo/vba/word/WdWindowState.hpp>
#include <ooo/vba/word/XApplicationOutgoing.hpp>
#include <ooo/vba/word/XBookmarks.hpp>
#include <comphelper/processfactory.hxx>
#include <comphelper/propertyvalue.hxx>
#include <cppu/unotype.hxx>
#include <editeng/acorrcfg.hxx>
#include <swdll.hxx>
#include <swmodule.hxx>
#include <unotxdoc.hxx>
#include "vbalistgalleries.hxx"
#include <tools/urlobj.hxx>

using namespace ::ooo;
using namespace ::ooo::vba;
using namespace ::ooo::vba::word;
using namespace ::com::sun::star;
using namespace ::cpo;

namespace {

class SwVbaApplicationOutgoingConnectionPoint : public cppu::WeakImplHelper<XConnectionPoint>
{
private:
    SwVbaApplication* mpApp;

public:
    SwVbaApplicationOutgoingConnectionPoint( SwVbaApplication* pApp );

    // XConnectionPoint
    sal_uInt32 Advise(const uno::Reference< XSink >& Sink ) override;
    void Unadvise( sal_uInt32 Cookie ) override;
};

}

SwVbaApplication::SwVbaApplication( uno::Reference<cpo::uno::XComponentContext >& xContext ):
    SwVbaApplication_BASE( xContext )
{
}

SwVbaApplication::~SwVbaApplication()
{
}

sal_uInt32
SwVbaApplication::AddSink( const uno::Reference< XSink >& xSink )
{
    {
        SolarMutexGuard aGuard;
        SwGlobals::ensure();
    }
    // No harm in potentially calling this several times
    SwModule::get()->RegisterAutomationApplicationEventsCaller(uno::Reference<XSinkCaller>(this));
    mvSinks.push_back(xSink);
    return mvSinks.size();
}

void
SwVbaApplication::RemoveSink( sal_uInt32 nNumber )
{
    if (nNumber < 1 || nNumber > mvSinks.size())
        return;

    mvSinks[nNumber-1] = uno::Reference< XSink >();
}

OUString
SwVbaApplication::getName()
{
    return u"Microsoft Word"_ustr;
}

uno::Reference< word::XDocument >
SwVbaApplication::getActiveDocument()
{
    return new SwVbaDocument( this, mxContext, getCurrentSwDocument() );
}

rtl::Reference<SwVbaWindow>
SwVbaApplication::getActiveSwVbaWindow()
{
    // #FIXME so far can't determine Parent
    rtl::Reference< SwXTextDocument > xModel( getCurrentSwDocument() );
    uno::Reference< frame::XController > xController( xModel->getCurrentController(), uno::UNO_SET_THROW );
    return new SwVbaWindow( uno::Reference< XHelperInterface >(), mxContext, xModel, xController );
}

uno::Reference< cpo::uno::XComponentContext > const &
SwVbaApplication::getContext() const
{
    return mxContext;
}

uno::Reference< word::XWindow >
SwVbaApplication::getActiveWindow()
{
    return getActiveSwVbaWindow();
}

uno::Reference<word::XSystem >
SwVbaApplication::getSystem()
{
    return uno::Reference< word::XSystem >( new SwVbaSystem( mxContext ) );
}

uno::Reference<word::XOptions >
SwVbaApplication::getOptions()
{
    return uno::Reference< word::XOptions >( new SwVbaOptions( mxContext ) );
}

cpo::uno::Any
SwVbaApplication::CommandBars( const cpo::uno::Any& aIndex )
{
    try
    {
        return VbaApplicationBase::CommandBars( aIndex );
    }
    catch (const cpo::uno::RuntimeException&)
    {
        return cpo::uno::Any();
    }
}

uno::Reference< word::XSelection >
SwVbaApplication::getSelection()
{
    return new SwVbaSelection( this, mxContext, getCurrentSwDocument() );
}

uno::Reference< word::XWordBasic >
SwVbaApplication::getWordBasic()
{
    uno::Reference< word::XWordBasic > xWB( new SwWordBasic( this ) );
    return xWB;
}

cpo::uno::Any
SwVbaApplication::Documents( const cpo::uno::Any& index )
{
    uno::Reference< XCollection > xCol( new SwVbaDocuments( this, mxContext ) );
    if ( index.hasValue() )
        return xCol->Item( index, cpo::uno::Any() );
    return cpo::uno::Any( xCol );
}

cpo::uno::Any
SwVbaApplication::Addins( const cpo::uno::Any& index )
{
    static uno::Reference< XCollection > xCol( new SwVbaAddins( this, mxContext ) );
    if ( index.hasValue() )
        return xCol->Item( index, cpo::uno::Any() );
    return cpo::uno::Any( xCol );
}

cpo::uno::Any
SwVbaApplication::Dialogs( const cpo::uno::Any& index )
{
    uno::Reference< word::XDialogs > xCol( new SwVbaDialogs( this, mxContext, getCurrentSwDocument() ));
    if ( index.hasValue() )
        return xCol->Item( index );
    return cpo::uno::Any( xCol );
}

cpo::uno::Any
SwVbaApplication::ListGalleries( const cpo::uno::Any& index )
{
    rtl::Reference< SwXTextDocument > xTextDoc( getCurrentSwDocument() );
    uno::Reference< XCollection > xCol( new SwVbaListGalleries( this, mxContext, xTextDoc ) );
    if ( index.hasValue() )
        return xCol->Item( index, cpo::uno::Any() );
    return cpo::uno::Any( xCol );
}

bool SwVbaApplication::getDisplayAutoCompleteTips()
{
    return SvxAutoCorrCfg::Get().IsAutoTextTip();
}

void SwVbaApplication::setDisplayAutoCompleteTips( bool _displayAutoCompleteTips )
{
    SvxAutoCorrCfg::Get().SetAutoTextTip( _displayAutoCompleteTips );
}

sal_Int32 SwVbaApplication::getEnableCancelKey()
{
    // the default value is wdCancelInterrupt in Word
    return word::WdEnableCancelKey::wdCancelInterrupt;
}

void SwVbaApplication::setEnableCancelKey( sal_Int32/* _enableCancelKey */)
{
    // seems not supported in Writer
}

sal_Int32 SwVbaApplication::getWindowState()
{
    auto xWindow = getActiveWindow();
    if (xWindow.is())
    {
        cpo::uno::Any aState = xWindow->getWindowState();
        sal_Int32 nState;
        if (aState >>= nState)
            return nState;
    }

    return word::WdWindowState::wdWindowStateNormal; // ?
}

void SwVbaApplication::setWindowState( sal_Int32 _windowstate )
{
    try
    {
        auto xWindow = getActiveWindow();
        if (xWindow.is())
        {
            cpo::uno::Any aState;
            aState <<= _windowstate;
            xWindow->setWindowState( aState );
        }
    }
    catch (const cpo::uno::RuntimeException&)
    {
    }
}

sal_Int32 SwVbaApplication::getWidth()
{
    auto pWindow = getActiveSwVbaWindow();
    return pWindow->getWidth();
}

void SwVbaApplication::setWidth( sal_Int32 _width )
{
    auto pWindow = getActiveSwVbaWindow();
    pWindow->setWidth( _width );
}

sal_Int32 SwVbaApplication::getHeight()
{
    auto pWindow = getActiveSwVbaWindow();
    return pWindow->getHeight();
}

void SwVbaApplication::setHeight( sal_Int32 _height )
{
    auto pWindow = getActiveSwVbaWindow();
    pWindow->setHeight( _height );
}

sal_Int32 SwVbaApplication::getLeft()
{
    auto pWindow = getActiveSwVbaWindow();
    return pWindow->getLeft();
}

void SwVbaApplication::setLeft( sal_Int32 _left )
{
    auto pWindow = getActiveSwVbaWindow();
    pWindow->setLeft( _left );
}

sal_Int32 SwVbaApplication::getTop()
{
    auto pWindow = getActiveSwVbaWindow();
    return pWindow->getTop();
}

void SwVbaApplication::setTop( sal_Int32 _top )
{
    auto pWindow = getActiveSwVbaWindow();
    pWindow->setTop( _top );
}

OUString SwVbaApplication::getStatusBar()
{
    return u""_ustr;
}

cpo::uno::Any SwVbaApplication::getCustomizationContext()
{
    return cpo::uno::Any(); // ???
}

void SwVbaApplication::setCustomizationContext(const cpo::uno::Any& /*_customizationcontext*/)
{
    // ???
}

void SwVbaApplication::setStatusBar( const OUString& _statusbar )
{
    // ScVbaAppSettings::setStatusBar() also uses the XStatusIndicator to show this, so maybe that is OK?
    rtl::Reference< SwXTextDocument > xModel = getCurrentSwDocument();
    if (xModel.is())
    {
        uno::Reference< task::XStatusIndicatorSupplier > xStatusIndicatorSupplier( xModel->getCurrentController(), uno::UNO_QUERY );
        if (xStatusIndicatorSupplier.is())
        {
            uno::Reference< task::XStatusIndicator > xStatusIndicator = xStatusIndicatorSupplier->getStatusIndicator();
            if (xStatusIndicator.is())
                xStatusIndicator->start( _statusbar, 100 );
        }
    }

    // Yes, we intentionally use the "extensions.olebridge" tag here even if this is sw. We
    // interpret setting the StatusBar property as a request from an Automation client to display
    // the string in LibreOffice's debug output, and all other generic Automation support debug
    // output (in extensions/source/ole) uses that tag. If the check for "cross-module" or mixed log
    // areas in compilerplugins/clang/sallogareas.cxx is re-activated, this will have to be added as
    // a special case.

    SAL_INFO("extensions.olebridge", "Client debug output: " << _statusbar);
}

float SwVbaApplication::CentimetersToPoints( float Centimeters )
{
    return o3tl::convert(Centimeters, o3tl::Length::cm, o3tl::Length::pt);
}

float SwVbaApplication::PointsToCentimeters( float Points )
{
    return o3tl::convert(Points, o3tl::Length::pt, o3tl::Length::cm);
}

float SwVbaApplication::PixelsToPoints( float Pixels, bool fVertical )
{
    //Set up xDevice
    rtl::Reference< SwXTextDocument > xModel( getCurrentSwDocument() );
    uno::Reference< frame::XController > xController( xModel->getCurrentController(), uno::UNO_SET_THROW );
    uno::Reference< frame::XFrame > xFrame( xController->getFrame(), uno::UNO_SET_THROW );
    uno::Reference< awt::XWindow > xWindow( xFrame->getContainerWindow(), uno::UNO_SET_THROW );
    cpo::uno::Reference< css::awt::XDevice > xDevice( xWindow, cpo::uno::UNO_QUERY );

    return ooo::vba::PixelsToPoints(xDevice, Pixels, fVertical);
}

float SwVbaApplication::PointsToPixels( float Pixels, bool fVertical )
{
    rtl::Reference< SwXTextDocument > xModel( getCurrentSwDocument() );
    uno::Reference< frame::XController > xController( xModel->getCurrentController(), uno::UNO_SET_THROW );
    uno::Reference< frame::XFrame > xFrame( xController->getFrame(), uno::UNO_SET_THROW );
    uno::Reference< awt::XWindow > xWindow( xFrame->getContainerWindow(), uno::UNO_SET_THROW );
    cpo::uno::Reference< css::awt::XDevice > xDevice( xWindow, cpo::uno::UNO_QUERY );

    return ooo::vba::PointsToPixels(xDevice, Pixels, fVertical);
}

float SwVbaApplication::InchesToPoints( float Inches )
{
    return o3tl::convert(Inches, o3tl::Length::in, o3tl::Length::pt);
}

float SwVbaApplication::PointsToInches( float Points )
{
    return o3tl::convert(Points, o3tl::Length::pt, o3tl::Length::in);
}

float SwVbaApplication::MillimetersToPoints( float Millimeters )
{
    return o3tl::convert(Millimeters, o3tl::Length::mm, o3tl::Length::pt);
}

float SwVbaApplication::PointsToMillimeters( float Points )
{
    return o3tl::convert(Points, o3tl::Length::pt, o3tl::Length::mm);
}

float SwVbaApplication::PicasToPoints( float Picas )
{
    return o3tl::convert(Picas, o3tl::Length::pc, o3tl::Length::pt);
}

float SwVbaApplication::PointsToPicas( float Points )
{
    return o3tl::convert(Points, o3tl::Length::pt, o3tl::Length::pc);
}

void SwVbaApplication::ShowMe()
{
    // Method no longer supported in word - deprecated
}

void SwVbaApplication::Resize( sal_Int32 Width, sal_Int32 Height )
{
    // Have to do it like this as the Width and Height are hidden away in the ooo::vba::XWindowBase
    // which ooo::vba::word::XApplication does not inherit from. SwVbaWindow, however, does inherit
    // from XWindowBase. Ugh.
    auto pWindow = getActiveSwVbaWindow();
    pWindow->setWidth( Width );
    pWindow->setHeight( Height );
}

void SwVbaApplication::Move( sal_Int32 Left, sal_Int32 Top )
{
    // See comment in Resize().
    auto pWindow = getActiveSwVbaWindow();
    pWindow->setLeft( Left );
    pWindow->setTop( Top );
}

// XInterfaceWithIID

OUString
SwVbaApplication::getIID()
{
    return u"{82154421-0FBF-11d4-8313-005004526AB4}"_ustr;
}

// XConnectable

OUString
SwVbaApplication::GetIIDForClassItselfNotCoclass()
{
    return u"{82154423-0FBF-11D4-8313-005004526AB4}"_ustr;
}

TypeAndIID
SwVbaApplication::GetConnectionPoint()
{
    TypeAndIID aResult =
        { cppu::UnoType<word::XApplicationOutgoing>::get(),
          u"{82154422-0FBF-11D4-8313-005004526AB4}"_ustr
        };

    return aResult;
}

uno::Reference<XConnectionPoint>
SwVbaApplication::FindConnectionPoint()
{
    uno::Reference<XConnectionPoint> xCP(new SwVbaApplicationOutgoingConnectionPoint(this));
    return xCP;
}

OUString
SwVbaApplication::getServiceImplName()
{
    return u"SwVbaApplication"_ustr;
}

cpo::uno::Sequence< OUString >
SwVbaApplication::getServiceNames()
{
    static cpo::uno::Sequence< OUString > const aServiceNames
    {
        u"ooo.vba.word.Application"_ustr
    };
    return aServiceNames;
}

SfxBaseModel*
SwVbaApplication::getCurrentDocument()
{
    return getCurrentWordDoc( mxContext ).get();
}

rtl::Reference< SwXTextDocument >
SwVbaApplication::getCurrentSwDocument()
{
    return getCurrentWordDoc( mxContext );
}

// XSinkCaller

void
SwVbaApplication::CallSinks( const OUString& Method, cpo::uno::Sequence< cpo::uno::Any >& Arguments )
{
    for (auto& i : mvSinks)
    {
        if (i.is())
            i->Call(Method, Arguments);
    }
}

// SwVbaApplicationOutgoingConnectionPoint

SwVbaApplicationOutgoingConnectionPoint::SwVbaApplicationOutgoingConnectionPoint( SwVbaApplication* pApp ) :
    mpApp(pApp)
{
}

// XConnectionPoint
sal_uInt32
SwVbaApplicationOutgoingConnectionPoint::Advise( const uno::Reference< XSink >& Sink )
{
    return mpApp->AddSink(Sink);
}

void
SwVbaApplicationOutgoingConnectionPoint::Unadvise( sal_uInt32 Cookie )
{
    mpApp->RemoveSink( Cookie );
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
