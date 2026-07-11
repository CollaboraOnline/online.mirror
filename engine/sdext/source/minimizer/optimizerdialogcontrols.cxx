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


#include "optimizerdialog.hxx"
#include <sdextresid.hxx>
#include <strings.hrc>


#include "pppoptimizer.hxx"
#include "graphiccollector.hxx"
#include "pagecollector.hxx"
#include <com/sun/star/awt/PushButtonType.hpp>
#include <com/sun/star/awt/XSpinField.hpp>
#include <com/sun/star/awt/XTextComponent.hpp>
#include <com/sun/star/presentation/XCustomPresentationSupplier.hpp>
#include <com/sun/star/drawing/XMasterPagesSupplier.hpp>
#include <com/sun/star/drawing/XDrawPagesSupplier.hpp>
#include <com/sun/star/awt/FontDescriptor.hpp>
#include <com/sun/star/awt/FontWeight.hpp>
#include <com/sun/star/frame/XStorable.hpp>
#include <rtl/ustrbuf.hxx>
#include <sal/macros.h>
#include <o3tl/string_view.hxx>

using namespace ::com::sun::star::uno;
using namespace cpo::uno;
using namespace ::com::sun::star::frame;
using namespace ::com::sun::star::beans;
using namespace ::com::sun::star::drawing;
using namespace ::com::sun::star::container;
using namespace ::com::sun::star::presentation;

void OptimizerDialog::InitNavigationBar()
{
    m_xHelp->hide();

    // the wizard changes the current presentation rather than finishing a
    // series of steps, so the finish button reads as apply
    m_xFinish->set_label(SdextResId( STR_APPLY ));
}

void OptimizerDialog::UpdateControlStatesPage1()
{
    bool bDeleteUnusedMasterPages( GetConfigProperty( TK_DeleteUnusedMasterPages, false ) );
    bool bDeleteHiddenSlides( GetConfigProperty( TK_DeleteHiddenSlides, false ) );
    bool bDeleteNotesPages( GetConfigProperty( TK_DeleteNotesPages, false ) );
    mpPage1->UpdateControlStates(bDeleteUnusedMasterPages, bDeleteHiddenSlides, bDeleteNotesPages);
}

void OptimizerDialog::InitPage1()
{
    Sequence< OUString > aCustomShowList;
    Reference< XModel > xModel( mxController->getModel() );
    if ( xModel.is() )
    {
        Reference< XCustomPresentationSupplier > aXCPSup( xModel, UNO_QUERY_THROW );
        Reference< XNameContainer > aXCont( aXCPSup->getCustomPresentations() );
        if ( aXCont.is() )
            aCustomShowList = aXCont->getElementNames();
    }
    mpPage1->Init(aCustomShowList);

    UpdateControlStatesPage1();
}

void OptimizerDialog::UpdateControlStatesPage2()
{
    bool bJPEGCompression( GetConfigProperty( TK_JPEGCompression, false ) );
    bool bRemoveCropArea( GetConfigProperty( TK_RemoveCropArea, false ) );
    bool bEmbedLinkedGraphics( GetConfigProperty( TK_EmbedLinkedGraphics, true ) );
    sal_Int32 nJPEGQuality( GetConfigProperty( TK_JPEGQuality, sal_Int32(90) ) );
    sal_Int32 nImageResolution( GetConfigProperty( TK_ImageResolution, sal_Int32(0) ) );

    mpPage2->UpdateControlStates(bJPEGCompression, nJPEGQuality, bRemoveCropArea, nImageResolution, bEmbedLinkedGraphics);
}

void OptimizerDialog::InitPage2()
{
    UpdateControlStatesPage2();
}

void OptimizerDialog::UpdateControlStatesPage3()
{
    bool bConvertOLEObjects( GetConfigProperty( TK_OLEOptimization, false ) );
    sal_Int16 nOLEOptimizationType( GetConfigProperty( TK_OLEOptimizationType, sal_Int16(0) ) );

    mpPage3->UpdateControlStates(bConvertOLEObjects, nOLEOptimizationType);
}

void OptimizerDialog::InitPage3()
{
    int nOLECount = 0;
    Reference< XModel > xModel( mxController->getModel() );
    Reference< XDrawPagesSupplier > xDrawPagesSupplier( xModel, UNO_QUERY_THROW );
    Reference< XDrawPages > xDrawPages( xDrawPagesSupplier->getDrawPages(), UNO_SET_THROW );
    for ( sal_Int32 i = 0; i < xDrawPages->getCount(); i++ )
    {
        Reference< XShapes > xShapes( xDrawPages->getByIndex( i ), UNO_QUERY_THROW );
        for ( sal_Int32 j = 0; j < xShapes->getCount(); j++ )
        {
            Reference< XShape > xShape( xShapes->getByIndex( j ), UNO_QUERY_THROW );
            if ( xShape->getShapeType() == "com.sun.star.drawing.OLE2Shape" )
                nOLECount++;
        }
    }

    mpPage3->Init(SdextResId( STR_OLE_OBJECTS_DESC ), nOLECount != 0);

    UpdateControlStatesPage3();
}

static OUString ImpValueOfInMB( sal_Int64 rVal, sal_Unicode nSeparator )
{
    double fVal( static_cast<double>( rVal ) );
    fVal /= ( 1 << 20 );
    fVal += 0.05;
    OUStringBuffer aVal( OUString::number( fVal ) );
    sal_Int32 nX( aVal.indexOf( '.' ) );
    if ( nX >= 0 )
    {
        aVal.setLength( nX + 2 );
        aVal[nX] = nSeparator;
    }
    aVal.append( " MB" );
    return aVal.makeStringAndClear();
}

void OptimizerDialog::UpdateControlStatesPage4()
{
    // the changes the current settings would apply, each with the pass it
    // belongs to, so that its checkbox can disable that pass
    std::vector< std::pair< OptimizerPass, OUString > > aChanges;

    // taking care of deleted slides
    sal_Int32 nDeletedSlides = 0;
    OUString sTKCustomShowName(mpPage1->Get_TK_CustomShowName());
    if (!sTKCustomShowName.isEmpty())
        SetConfigProperty(TK_CustomShowName, Any(sTKCustomShowName));
    if ( GetConfigProperty( TK_DeleteHiddenSlides, false ) )
    {
        Reference< XDrawPagesSupplier > xDrawPagesSupplier( mxController->getModel(), UNO_QUERY_THROW );
        Reference< XDrawPages > xDrawPages( xDrawPagesSupplier->getDrawPages(), UNO_SET_THROW );
        for( sal_Int32 i = 0; i < xDrawPages->getCount(); i++ )
        {
            Reference< XDrawPage > xDrawPage( xDrawPages->getByIndex( i ), UNO_QUERY_THROW );
            Reference< XPropertySet > xPropSet( xDrawPage, UNO_QUERY_THROW );

            bool bVisible = true;
            if ( xPropSet->getPropertyValue( u"Visible"_ustr ) >>= bVisible )
            {
                if (!bVisible )
                    nDeletedSlides++;
            }
        }
    }
    if ( GetConfigProperty( TK_DeleteUnusedMasterPages, false ) )
    {
        std::vector< PageCollector::MasterPageEntity > aMasterPageList;
        PageCollector::CollectMasterPages( mxController->getModel(), aMasterPageList );
        Reference< XMasterPagesSupplier > xMasterPagesSupplier( mxController->getModel(), UNO_QUERY_THROW );
        Reference< XDrawPages > xMasterPages( xMasterPagesSupplier->getMasterPages(), UNO_SET_THROW );
        nDeletedSlides += std::count_if(aMasterPageList.begin(), aMasterPageList.end(),
            [](const PageCollector::MasterPageEntity& rEntity) { return !rEntity.bUsed; });
    }
    if ( nDeletedSlides > 1 )
    {
        OUString aStr( SdextResId( STR_DELETE_SLIDES ) );
        OUString aPlaceholder( u"%SLIDES"_ustr  );
        sal_Int32 i = aStr.indexOf( aPlaceholder );
        if ( i >= 0 )
            aStr = aStr.replaceAt( i, aPlaceholder.getLength(), OUString::number( nDeletedSlides ) );
        aChanges.emplace_back( OptimizerPass::DeleteSlides, aStr );
    }

// generating graphic compression info
    sal_Int32 nGraphics = 0;
    bool bJPEGCompression( GetConfigProperty( TK_JPEGCompression, false ) );
    sal_Int32 nJPEGQuality( GetConfigProperty( TK_JPEGQuality, sal_Int32(90) ) );
    sal_Int32 nImageResolution( GetConfigProperty( TK_ImageResolution, sal_Int32(0) ) );
    GraphicSettings aGraphicSettings( bJPEGCompression, nJPEGQuality, GetConfigProperty( TK_RemoveCropArea, false ),
                                        nImageResolution, GetConfigProperty( TK_EmbedLinkedGraphics, true ) );
    GraphicCollector::CountGraphics( mxContext, mxController->getModel(), aGraphicSettings, nGraphics );
    if ( nGraphics > 1 )
    {
        OUString aStr( SdextResId( STR_OPTIMIZE_IMAGES ) );
        OUString aImagePlaceholder( u"%IMAGES"_ustr  );
        OUString aQualityPlaceholder( u"%QUALITY"_ustr  );
        OUString aResolutionPlaceholder( u"%RESOLUTION"_ustr  );
        sal_Int32 i = aStr.indexOf( aImagePlaceholder );
        if ( i >= 0 )
            aStr = aStr.replaceAt( i, aImagePlaceholder.getLength(), OUString::number( nGraphics ) );

        sal_Int32 j = aStr.indexOf( aQualityPlaceholder );
        if ( j >= 0 )
            aStr = aStr.replaceAt( j, aQualityPlaceholder.getLength(), OUString::number( nJPEGQuality ) );

        sal_Int32 k = aStr.indexOf( aResolutionPlaceholder );
        if ( k >= 0 )
            aStr = aStr.replaceAt( k, aResolutionPlaceholder.getLength(), OUString::number( nImageResolution ) );

        aChanges.emplace_back( OptimizerPass::OptimizeImages, aStr );
    }

    if ( GetConfigProperty( TK_OLEOptimization, false ) )
    {
        sal_Int32 nOLEReplacements = 0;
        Reference< XDrawPagesSupplier > xDrawPagesSupplier( mxController->getModel(), UNO_QUERY_THROW );
        Reference< XDrawPages > xDrawPages( xDrawPagesSupplier->getDrawPages(), UNO_SET_THROW );
        for ( sal_Int32 i = 0; i < xDrawPages->getCount(); i++ )
        {
            Reference< XShapes > xShapes( xDrawPages->getByIndex( i ), UNO_QUERY_THROW );
            for ( sal_Int32 j = 0; j < xShapes->getCount(); j++ )
            {
                Reference< XShape > xShape( xShapes->getByIndex( j ), UNO_QUERY_THROW );
                if ( xShape->getShapeType() == "com.sun.star.drawing.OLE2Shape" )
                    nOLEReplacements++;
            }
        }
        if ( nOLEReplacements > 1 )
        {
            OUString aStr( SdextResId( STR_CREATE_REPLACEMENT ) );
            OUString aPlaceholder( u"%OLE"_ustr  );
            sal_Int32 i = aStr.indexOf( aPlaceholder );
            if ( i >= 0 )
                aStr = aStr.replaceAt( i, aPlaceholder.getLength(), OUString::number( nOLEReplacements ) );
            aChanges.emplace_back( OptimizerPass::ReplaceOLEObjects, aStr );
        }
    }

    sal_Int64 nCurrentFileSize = 0;
    sal_Int64 nEstimatedFileSize = 0;
    Reference< XStorable > xStorable( mxController->getModel(), UNO_QUERY );
    if ( xStorable.is() && xStorable->hasLocation() )
        nCurrentFileSize = PPPOptimizer::GetFileSize( xStorable->getLocation() );

    // The estimate covers the images only, so a cleared image checkbox leaves
    // the current size as the estimate.
    const bool bOptimizeImages = mpPage4->IsPassEnabled( OptimizerPass::OptimizeImages );
    if ( nCurrentFileSize )
    {
        double fE = static_cast< double >( nCurrentFileSize );
        if ( bOptimizeImages && nImageResolution )
        {
            double v = ( static_cast< double >( nImageResolution ) + 75.0 ) / 300.0;
            if ( v < 1.0 )
                fE *= v;
        }
        if ( bOptimizeImages && bJPEGCompression )
        {
            double v = 0.75 - ( ( 100.0 - static_cast< double >( nJPEGQuality ) ) / 400.0 ) ;
            fE *= v;
        }
        nEstimatedFileSize = static_cast< sal_Int64 >( fE );
    }
    sal_Unicode nSeparator = '.';
    OUString aStr( SdextResId( STR_FILESIZESEPARATOR ) );
    if ( !aStr.isEmpty() )
        nSeparator = aStr[ 0 ];
    mpPage4->UpdateControlStates(aChanges,
                                 ImpValueOfInMB(nCurrentFileSize, nSeparator),
                                 ImpValueOfInMB(nEstimatedFileSize, nSeparator));
    SetConfigProperty( TK_EstimatedFileSize, Any( nEstimatedFileSize ) );
}

void OptimizerDialog::InitPage4()
{
    UpdateControlStatesPage4();
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
