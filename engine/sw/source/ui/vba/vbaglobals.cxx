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
#include "vbaglobals.hxx"
#include "vbawordbasic.hxx"
#include <sal/log.hxx>

#include <com/sun/star/beans/PropertyValue.hpp>
#include <com/sun/star/frame/XModel.hpp>
#include <comphelper/sequence.hxx>

#include "vbaapplication.hxx"
using namespace ::com::sun::star;
using namespace ::cpo;
using namespace ::cpo::uno;
using namespace ::ooo::vba;

SwVbaGlobals::SwVbaGlobals(  cpo::uno::Sequence< cpo::uno::Any > const& aArgs, uno::Reference< cpo::uno::XComponentContext >const& rxContext ) : SwVbaGlobals_BASE( uno::Reference< XHelperInterface >(), rxContext, u"WordDocumentContext"_ustr )
{
    SAL_INFO("sw.vba", "SwVbaGlobals::SwVbaGlobals()");
    cpo::uno::Sequence< beans::PropertyValue > aInitArgs( aArgs.hasElements() ? 2 : 1 );
    auto pInitArgs = aInitArgs.getArray();
    pInitArgs[ 0 ].Name = u"Application"_ustr;
    pInitArgs[ 0 ].Value <<= getApplication();
    if ( aArgs.hasElements() )
    {
        pInitArgs[ 1 ].Name = u"WordDocumentContext"_ustr;
        pInitArgs[ 1 ].Value <<= getXSomethingFromArgs< frame::XModel >( aArgs, 0 );
    }
    init( aInitArgs );
}

SwVbaGlobals::~SwVbaGlobals()
{
    SAL_INFO("sw.vba", "SwVbaGlobals::~SwVbaGlobals");
}

// XGlobals

uno::Reference<word::XApplication > const &
SwVbaGlobals::getApplication()
{
    SAL_INFO("sw.vba", "In SwVbaGlobals::getApplication");
    if ( !mxApplication.is() )
         mxApplication.set( new SwVbaApplication( mxContext) );

    return mxApplication;
}

uno::Reference<word::XSystem >
SwVbaGlobals::getSystem()
{
    return getApplication()->getSystem();
}

uno::Reference< word::XDocument >
SwVbaGlobals::getActiveDocument()
{
    return getApplication()->getActiveDocument();
}

uno::Reference< word::XWindow >
SwVbaGlobals::getActiveWindow()
{
    return getApplication()->getActiveWindow();
}

OUString
SwVbaGlobals::getName()
{
    return getApplication()->getName();
}

uno::Reference<word::XOptions >
SwVbaGlobals::getOptions()
{
    return getApplication()->getOptions();
}

cpo::uno::Any
SwVbaGlobals::CommandBars( const cpo::uno::Any& aIndex )
{
    return getApplication()->CommandBars( aIndex );
}

cpo::uno::Any
SwVbaGlobals::Documents( const cpo::uno::Any& index )
{
    return getApplication()->Documents( index );
}

cpo::uno::Any
SwVbaGlobals::Addins( const cpo::uno::Any& index )
{
    return getApplication()->Addins( index );
}

cpo::uno::Any
SwVbaGlobals::Dialogs( const cpo::uno::Any& index )
{
    return getApplication()->Dialogs( index );
}

cpo::uno::Any
SwVbaGlobals::ListGalleries( const cpo::uno::Any& index )
{
    return getApplication()->ListGalleries( index );
}

uno::Reference<word::XSelection >
SwVbaGlobals::getSelection()
{
    return getApplication()->getSelection();
}

uno::Reference<word::XGlobals> SwVbaGlobals::getWord()
{
    return uno::Reference<word::XGlobals>(this);
}

uno::Reference<word::XWordBasic> SwVbaGlobals::getWordBasic()
{
    assert(dynamic_cast<SwVbaApplication*>(getApplication().get()));
    SwVbaApplication* pVbaApp = static_cast<SwVbaApplication*>(getApplication().get());
    uno::Reference<word::XWordBasic> xWB(new SwWordBasic(pVbaApp));
    return xWB;
}

float SwVbaGlobals::CentimetersToPoints( float Centimeters )
{
    return getApplication()->CentimetersToPoints( Centimeters );
}

float SwVbaGlobals::PointsToCentimeters( float Points )
{
    return getApplication()->PointsToCentimeters( Points );
}

float SwVbaGlobals::PixelsToPoints( float Pixels, bool fVertical )
{
    return getApplication()->PixelsToPoints( Pixels, fVertical );
}

float SwVbaGlobals::PointsToPixels( float Points, bool fVertical )
{
    return getApplication()->PointsToPixels( Points, fVertical );
}

float SwVbaGlobals::InchesToPoints( float Inches )
{
    return getApplication()->InchesToPoints( Inches );
}

float SwVbaGlobals::PointsToInches( float Points )
{
    return getApplication()->PointsToInches( Points );
}

float SwVbaGlobals::MillimetersToPoints( float Millimeters )
{
    return getApplication()->MillimetersToPoints( Millimeters );
}

float SwVbaGlobals::PointsToMillimeters( float Points )
{
    return getApplication()->PointsToMillimeters( Points );
}

float SwVbaGlobals::PicasToPoints( float Picas )
{
    return getApplication()->PicasToPoints( Picas );
}

float SwVbaGlobals::PointsToPicas( float Points )
{
    return getApplication()->PointsToPicas( Points );
}

OUString
SwVbaGlobals::getServiceImplName()
{
    return u"SwVbaGlobals"_ustr;
}

cpo::uno::Sequence< OUString >
SwVbaGlobals::getServiceNames()
{
    return { u"ooo.vba.word.Globals"_ustr };
}

cpo::uno::Sequence< OUString >
SwVbaGlobals::getAvailableServiceNames(  )
{
    static const cpo::uno::Sequence<OUString> serviceNames = comphelper::concatSequences(
        SwVbaGlobals_BASE::getAvailableServiceNames(),
        cpo::uno::Sequence<OUString>{ u"ooo.vba.word.Document"_ustr,
                                 // "ooo.vba.word.Globals",
                                 // "ooo.vba.word.WrapFormat",
                                 u"com.sun.star.script.vba.VBATextEventProcessor"_ustr });
    return serviceNames;
}

extern "C" SAL_DLLPUBLIC_EXPORT cpo::uno::XInterface*
Writer_SwVbaGlobals_get_implementation(
    cpo::uno::XComponentContext* context, cpo::uno::Sequence<cpo::uno::Any> const& args)
{
    return cppu::acquire(new SwVbaGlobals(args, context));
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
