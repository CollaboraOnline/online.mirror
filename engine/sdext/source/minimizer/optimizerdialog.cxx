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
#include "impoptimizer.hxx"
#include <sdextresid.hxx>
#include <com/sun/star/awt/XItemEventBroadcaster.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/container/XIndexContainer.hpp>
#include <com/sun/star/drawing/XDrawPagesSupplier.hpp>
#include <com/sun/star/frame/XStorable.hpp>
#include <com/sun/star/lang/XSingleServiceFactory.hpp>
#include <com/sun/star/ucb/XSimpleFileAccess.hpp>
#include <com/sun/star/io/IOException.hpp>
#include <com/sun/star/util/XModifiable.hpp>

#include <comphelper/kit.hxx>
#include <comphelper/propertyvalue.hxx>
#include <sal/macros.h>
#include <vcl/errinf.hxx>
#include <vcl/svapp.hxx>
#include <vcl/weld.hxx>
#include <svtools/sfxecode.hxx>
#include <svtools/ehdl.hxx>
#include <o3tl/string_view.hxx>
#include <bitmaps.hlst>
#include <strings.hrc>

using namespace ::com::sun::star::io;
using namespace ::com::sun::star::awt;
using namespace ::com::sun::star::uno;
using namespace cpo::uno;
using namespace ::com::sun::star::util;
using namespace ::com::sun::star::drawing;
using namespace ::com::sun::star::frame;
using namespace ::com::sun::star::beans;

using vcl::RoadmapWizardTypes::PathId;

OptimizedDialogPage::OptimizedDialogPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog,
                                         const OUString& rUIXMLDescription, const OUString& rID,
                                         int nPageNum)
    : vcl::OWizardPage(pPage, &rOptimizerDialog, rUIXMLDescription, rID)
    , mrOptimizerDialog(rOptimizerDialog)
    , m_nPageNum(nPageNum)
{
}

void OptimizedDialogPage::Activate()
{
    vcl::OWizardPage::Activate();
    mrOptimizerDialog.UpdateControlStates(m_nPageNum);
}

IntroPage::IntroPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog)
    : OptimizedDialogPage(pPage, rOptimizerDialog, u"modules/simpress/ui/pmintropage.ui"_ustr, u"PMIntroPage"_ustr, 0)
{
}

SlidesPage::SlidesPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog)
    : OptimizedDialogPage(pPage, rOptimizerDialog, u"modules/simpress/ui/pmslidespage.ui"_ustr, u"PMSlidesPage"_ustr, 1)
    , mxMasterSlides(m_xBuilder->weld_check_button(u"STR_DELETE_MASTER_PAGES"_ustr))
    , mxHiddenSlides(m_xBuilder->weld_check_button(u"STR_DELETE_HIDDEN_SLIDES"_ustr))
    , mxUnusedSlides(m_xBuilder->weld_check_button(u"STR_CUSTOM_SHOW"_ustr))
    , mxComboBox(m_xBuilder->weld_combo_box(u"LB_SLIDES"_ustr))
    , mxClearNodes(m_xBuilder->weld_check_button(u"STR_DELETE_NOTES_PAGES"_ustr))
{
    rOptimizerDialog.SetSlidesPage(this);
    mxMasterSlides->connect_toggled(LINK(this, SlidesPage, UnusedMasterPagesActionPerformed));
    mxHiddenSlides->connect_toggled(LINK(this, SlidesPage, UnusedHiddenSlidesActionPerformed));
    mxUnusedSlides->connect_toggled(LINK(this, SlidesPage, UnusedSlidesActionPerformed));
    mxClearNodes->connect_toggled(LINK(this, SlidesPage, DeleteNotesActionPerformed));
}

void SlidesPage::Init(const cpo::uno::Sequence<OUString>& rCustomShowList)
{
    mxComboBox->clear();
    for (const auto& a : rCustomShowList)
        mxComboBox->append_text(a);
    mxUnusedSlides->set_sensitive(rCustomShowList.hasElements());
}

void SlidesPage::UpdateControlStates(bool bDeleteUnusedMasterPages, bool bDeleteHiddenSlides, bool bDeleteNotesPages)
{
    mxMasterSlides->set_active(bDeleteUnusedMasterPages);
    mxHiddenSlides->set_active(bDeleteHiddenSlides);
    mxClearNodes->set_active(bDeleteNotesPages);
    mxComboBox->set_sensitive(mxUnusedSlides->get_sensitive());
}

const int ImagesPage::maResolutions[5] = { 0, 96, 150, 300, 600 };

ImagesPage::ImagesPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog)
    : OptimizedDialogPage(pPage, rOptimizerDialog, u"modules/simpress/ui/pmimagespage.ui"_ustr, u"PMImagesPage"_ustr, 2)
    , m_xLossLessCompression(m_xBuilder->weld_radio_button(u"STR_LOSSLESS_COMPRESSION"_ustr))
    , m_xQualityLabel(m_xBuilder->weld_label(u"STR_QUALITY"_ustr))
    , m_xQuality(m_xBuilder->weld_spin_button(u"SB_QUALITY"_ustr))
    , m_xJpegCompression(m_xBuilder->weld_radio_button(u"STR_JPEG_COMPRESSION"_ustr))
    , m_xResolutions{ m_xBuilder->weld_radio_button(u"RB_RESOLUTION_0"_ustr),
                      m_xBuilder->weld_radio_button(u"RB_RESOLUTION_96"_ustr),
                      m_xBuilder->weld_radio_button(u"RB_RESOLUTION_150"_ustr),
                      m_xBuilder->weld_radio_button(u"RB_RESOLUTION_300"_ustr),
                      m_xBuilder->weld_radio_button(u"RB_RESOLUTION_600"_ustr) }
    , m_xRemoveCropArea(m_xBuilder->weld_check_button(u"STR_REMOVE_CROP_AREA"_ustr))
    , m_xEmbedLinkedGraphics(m_xBuilder->weld_check_button(u"STR_EMBED_LINKED_GRAPHICS"_ustr))
{
    rOptimizerDialog.SetImagesPage(this);
    m_xRemoveCropArea->connect_toggled(LINK(this, ImagesPage, RemoveCropAreaActionPerformed));
    m_xEmbedLinkedGraphics->connect_toggled(LINK(this, ImagesPage, EmbedLinkedGraphicsActionPerformed));
    for (auto& rResolution : m_xResolutions)
        rResolution->connect_toggled(LINK(this, ImagesPage, ResolutionActionPerformed));
    m_xQuality->connect_value_changed(LINK(this, ImagesPage, SpinButtonActionPerformed));

    m_xJpegCompression->connect_toggled(LINK(this, ImagesPage, CompressionActionPerformed));
    m_xLossLessCompression->connect_toggled(LINK(this, ImagesPage, CompressionActionPerformed));
}

void ImagesPage::UpdateControlStates(bool bJPEGCompression, int nJPEGQuality, bool bRemoveCropArea,
                                     int nResolution, bool bEmbedLinkedGraphics)
{
    m_xLossLessCompression->set_active(!bJPEGCompression);
    m_xJpegCompression->set_active(bJPEGCompression);
    m_xQualityLabel->set_sensitive(bJPEGCompression);
    m_xQuality->set_sensitive(bJPEGCompression);
    m_xQuality->set_value(nJPEGQuality);
    // a stored resolution that is not offered falls back to keeping the
    // images as they are
    size_t nActive = 0;
    for (size_t i = 0; i < std::size(maResolutions); ++i)
    {
        if (maResolutions[i] == nResolution)
            nActive = i;
    }
    m_xResolutions[nActive]->set_active(true);
    m_xRemoveCropArea->set_active(bRemoveCropArea);
    m_xEmbedLinkedGraphics->set_active(bEmbedLinkedGraphics);
}

ObjectsPage::ObjectsPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog)
    : OptimizedDialogPage(pPage, rOptimizerDialog, u"modules/simpress/ui/pmobjectspage.ui"_ustr, u"PMObjectsPage"_ustr, 3)
    , m_xCreateStaticImage(m_xBuilder->weld_check_button(u"STR_OLE_REPLACE"_ustr))
    , m_xAllOLEObjects(m_xBuilder->weld_radio_button(u"STR_ALL_OLE_OBJECTS"_ustr))
    , m_xForeignOLEObjects(m_xBuilder->weld_radio_button(u"STR_ALIEN_OLE_OBJECTS_ONLY"_ustr))
    , m_xNoObjects(m_xBuilder->weld_label(u"STR_NO_OLE_OBJECTS"_ustr))
    , m_xLabel(m_xBuilder->weld_label(u"STR_OLE_OBJECTS_DESC"_ustr))
{
    rOptimizerDialog.SetObjectsPage(this);
    m_xCreateStaticImage->connect_toggled(LINK(this, ObjectsPage, OLEOptimizationActionPerformed));
    m_xAllOLEObjects->connect_toggled(LINK(this, ObjectsPage, OLEActionPerformed));
    m_xForeignOLEObjects->connect_toggled(LINK(this, ObjectsPage, OLEActionPerformed));
}

void ObjectsPage::Init(const OUString& rDesc, bool bHasOLEObjects)
{
    m_xLabel->set_label(rDesc);

    // With nothing to replace the choice cannot be made, and the page says so
    // where the choice would have been.
    mbHasOLEObjects = bHasOLEObjects;
    m_xCreateStaticImage->set_sensitive(bHasOLEObjects);
    m_xNoObjects->set_visible(!bHasOLEObjects);
}

void ObjectsPage::UpdateControlStates(bool bConvertOLEObjects, int nOLEOptimizationType)
{
    m_xCreateStaticImage->set_active(bConvertOLEObjects);
    m_xAllOLEObjects->set_sensitive(mbHasOLEObjects && bConvertOLEObjects);
    m_xForeignOLEObjects->set_sensitive(mbHasOLEObjects && bConvertOLEObjects);
    m_xAllOLEObjects->set_active(nOLEOptimizationType == 0);
    m_xForeignOLEObjects->set_active(nOLEOptimizationType == 1);
}

SummaryPage::SummaryPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog)
    : OptimizedDialogPage(pPage, rOptimizerDialog, u"modules/simpress/ui/pmsummarypage.ui"_ustr, u"PMSummaryPage"_ustr, 4)
    , m_xChanges{ m_xBuilder->weld_check_button(u"CHECK1"_ustr),
                  m_xBuilder->weld_check_button(u"CHECK2"_ustr),
                  m_xBuilder->weld_check_button(u"CHECK3"_ustr) }
    , m_xCurrentSize(m_xBuilder->weld_label(u"CURRENT_FILESIZE"_ustr))
    , m_xEstimatedSize(m_xBuilder->weld_label(u"ESTIMATED_FILESIZE"_ustr))
    , m_xStatus(m_xBuilder->weld_label(u"STR_STATUS"_ustr))
    , m_xProgress(m_xBuilder->weld_progress_bar(u"PROGRESS"_ustr))
{
    rOptimizerDialog.SetSummaryPage(this);
    for (auto& rChange : m_xChanges)
        rChange->connect_toggled(LINK(this, SummaryPage, ChangeToggled));

    // The progress bar fills while the optimization runs. Until then it shows
    // as an empty bar across the page, so it stays hidden.
    m_xProgress->hide();
}

void SummaryPage::UpdateControlStates(const std::vector<std::pair<OptimizerPass, OUString>>& rChanges,
                                      const OUString& rCurrentFileSize,
                                      const OUString& rEstimatedFileSize)
{
    // Each listed change gets a checkbox. A change that was already listed
    // keeps the state the user gave it, a newly listed one starts enabled.
    // The spare checkboxes are hidden.
    // The states are read before any checkbox is written, because a change can
    // move to another checkbox between two calls.
    std::vector<std::pair<OptimizerPass, bool>> aPreviousStates;
    for (size_t i = 0; i < maListedPasses.size(); ++i)
        aPreviousStates.emplace_back(maListedPasses[i], m_xChanges[i]->get_active());

    maListedPasses.clear();
    size_t nIndex = 0;
    for (const auto& rChange : rChanges)
    {
        if (nIndex >= std::size(m_xChanges))
            break;
        const auto aPrevious = std::find_if(aPreviousStates.begin(), aPreviousStates.end(),
            [&rChange](const auto& rState) { return rState.first == rChange.first; });
        const bool bActive = aPrevious == aPreviousStates.end() || aPrevious->second;
        maListedPasses.push_back(rChange.first);
        m_xChanges[nIndex]->set_label(rChange.second);
        m_xChanges[nIndex]->set_active(bActive);
        m_xChanges[nIndex]->show();
        ++nIndex;
    }
    for (; nIndex < std::size(m_xChanges); ++nIndex)
        m_xChanges[nIndex]->hide();

    m_xCurrentSize->set_label(rCurrentFileSize);
    m_xEstimatedSize->set_label(rEstimatedFileSize);
}

IMPL_LINK_NOARG(SummaryPage, ChangeToggled, weld::Toggleable&, void)
{
    // the estimate and the listed changes follow the passes that are left
    // enabled
    mrOptimizerDialog.UpdateControlStates(ITEM_ID_SUMMARY);
}

bool SummaryPage::IsPassEnabled(OptimizerPass ePass) const
{
    for (size_t i = 0; i < maListedPasses.size(); ++i)
    {
        if (maListedPasses[i] == ePass)
            return m_xChanges[i]->get_active();
    }
    return true;
}

void SummaryPage::UpdateStatusLabel(const OUString& rStatus)
{
    m_xStatus->set_label(rStatus);
}

void SummaryPage::UpdateProgressValue(int nProgress)
{
    // the bar appears with the first reported progress and stays for the rest
    // of the run
    if (nProgress > 0)
        m_xProgress->show();
    m_xProgress->set_percentage(nProgress);
}

void OptimizerDialog::InitDialog()
{
    set_title(SdextResId( STR_SUN_OPTIMIZATION_WIZARD2 ));
}

void OptimizerDialog::InitRoadmap()
{
    declarePath(
        PathId::COMMON_FIRST_STATE,
        {ITEM_ID_INTRODUCTION,
         ITEM_ID_SLIDES,
         ITEM_ID_GRAPHIC_OPTIMIZATION,
         ITEM_ID_OLE_OPTIMIZATION,
         ITEM_ID_SUMMARY}
    );

    m_xAssistant->set_page_side_image(u"" BMP_PRESENTATION_MINIMIZER ""_ustr);
}

void OptimizerDialog::UpdateConfiguration()
{
    // page1
    OUString sTKCustomShowName(mpPage1->Get_TK_CustomShowName());
    if (!sTKCustomShowName.isEmpty())
        SetConfigProperty(TK_CustomShowName, Any(sTKCustomShowName));
}

OptimizerDialog::OptimizerDialog( const Reference< XComponentContext > &rxContext, Reference< XFrame > const & rxFrame, Reference< XDispatch > const & rxStatusDispatcher )
    : vcl::RoadmapWizardMachine(Application::GetFrameWeld(rxFrame->getComponentWindow()))
    , ConfigurationAccess(rxContext)
    , mnEndStatus(RET_CANCEL)
    , mxFrame(rxFrame)
    , mxController(rxFrame->getController())
    , mxStatusDispatcher(rxStatusDispatcher)
{
    Reference< XStorable > xStorable( mxController->getModel(), UNO_QUERY_THROW );
    mbIsReadonly = xStorable->isReadonly();

    InitDialog();
    InitRoadmap();
    InitNavigationBar();
    InitPage1();
    InitPage2();
    InitPage3();
    InitPage4();

    ActivatePage();
    m_xAssistant->set_current_page(0);

    OptimizationStats aStats;
    aStats.InitializeStatusValuesFromDocument( mxController->getModel() );
    Sequence< PropertyValue > aStatusSequence( aStats.GetStatusSequence() );
    UpdateStatus( aStatusSequence );
}

OUString OptimizerDialog::getStateDisplayName(vcl::WizardTypes::WizardState nState) const
{
    switch (nState)
    {
        case ITEM_ID_INTRODUCTION:
            return SdextResId( STR_INTRODUCTION );
        case ITEM_ID_SLIDES:
            return SdextResId( STR_SLIDES );
        case ITEM_ID_GRAPHIC_OPTIMIZATION:
            return SdextResId( STR_IMAGE_OPTIMIZATION );
        case ITEM_ID_OLE_OPTIMIZATION:
            return SdextResId( STR_OLE_OBJECTS );
        case ITEM_ID_SUMMARY:
            return SdextResId( STR_SUMMARY );
    }
    return OUString();
}

void OptimizerDialog::enterState(vcl::WizardTypes::WizardState nState)
{
    vcl::RoadmapWizardMachine::enterState(nState);

    // The summary page is where the changes to apply are chosen, so the apply
    // button waits for it. A read-only presentation cannot be changed at all.
    m_xFinish->set_sensitive(nState == ITEM_ID_SUMMARY && !mbIsReadonly);
}

std::unique_ptr<BuilderPage> OptimizerDialog::createPage(vcl::WizardTypes::WizardState nState)
{
    OUString sIdent(OUString::number(nState));
    weld::Container* pPageContainer = m_xAssistant->append_page(sIdent);

    std::unique_ptr<vcl::OWizardPage> xRet;

    switch (nState)
    {
        case ITEM_ID_INTRODUCTION:
            xRet.reset(new IntroPage(pPageContainer, *this));
            break;
        case ITEM_ID_SLIDES:
            xRet.reset(new SlidesPage(pPageContainer, *this));
            break;
        case ITEM_ID_GRAPHIC_OPTIMIZATION:
            xRet.reset(new ImagesPage(pPageContainer, *this));
            break;
        case ITEM_ID_OLE_OPTIMIZATION:
            xRet.reset(new ObjectsPage(pPageContainer, *this));
            break;
        case ITEM_ID_SUMMARY:
            xRet.reset(new SummaryPage(pPageContainer, *this));
            break;
    }

    m_xAssistant->set_page_title(sIdent, getStateDisplayName(nState));

    return xRet;
}

OptimizerDialog::~OptimizerDialog()
{
    // not saving configuration if the dialog has been finished via cancel or close window
    if (mnEndStatus == RET_OK)
        SaveConfiguration();
}

void OptimizerDialog::UpdateControlStates( sal_Int16 nPage )
{
    switch( nPage )
    {
        case 0 : break; // the introduction page has no controls
        case 1 : UpdateControlStatesPage1(); break;
        case 2 : UpdateControlStatesPage2(); break;
        case 3 : UpdateControlStatesPage3(); break;
        case 4 : UpdateControlStatesPage4(); break;
        default:
        {
            UpdateControlStatesPage1();
            UpdateControlStatesPage2();
            UpdateControlStatesPage3();
            UpdateControlStatesPage4();
        }
    }
}

void OptimizerDialog::UpdateStatus( const cpo::uno::Sequence< css::beans::PropertyValue >& rStatus )
{
    maStats.InitializeStatusValues( rStatus );
    const Any* pVal( maStats.GetStatusValue( TK_Status ) );
    if ( pVal )
    {
        OUString sStatus;
        if ( *pVal >>= sStatus )
        {
            mpPage4->UpdateStatusLabel( sStatus );
        }
    }
    pVal = maStats.GetStatusValue( TK_Progress );
    if ( pVal )
    {
        sal_Int32 nProgress = 0;
        if ( *pVal >>= nProgress )
            mpPage4->UpdateProgressValue(nProgress);
    }
    pVal = maStats.GetStatusValue( TK_OpenNewDocument );
    if ( pVal )
        SetConfigProperty( TK_OpenNewDocument, *pVal );

    // In a kit session the widget updates reach the client on their own;
    // processing events here would re-enter the kit poll.
    if (!comphelper::COKit::isActive())
        Application::Reschedule(true);
}

IMPL_LINK(ObjectsPage, OLEActionPerformed, weld::Toggleable&, rBox, void)
{
    if (!rBox.get_active())
        return;

    const bool bALLOles = &rBox == m_xAllOLEObjects.get();
    sal_Int16 nInt16 = bALLOles ? 0 : 1;
    mrOptimizerDialog.SetConfigProperty( TK_OLEOptimizationType, Any( nInt16 ) );
}

IMPL_LINK(ObjectsPage, OLEOptimizationActionPerformed, weld::Toggleable&, rBox, void)
{
    const bool bOLEOptimization = rBox.get_active();
    mrOptimizerDialog.SetConfigProperty( TK_OLEOptimization, Any(bOLEOptimization) );
    m_xAllOLEObjects->set_sensitive(mbHasOLEObjects && bOLEOptimization);
    m_xForeignOLEObjects->set_sensitive(mbHasOLEObjects && bOLEOptimization);
}

IMPL_LINK(ImagesPage, CompressionActionPerformed, weld::Toggleable&, rBox, void)
{
    if (!rBox.get_active())
        return;

    const bool bJPEGCompression = &rBox == m_xJpegCompression.get();
    mrOptimizerDialog.SetConfigProperty(TK_JPEGCompression, Any(bJPEGCompression));
    m_xQualityLabel->set_sensitive(bJPEGCompression);
    m_xQuality->set_sensitive(bJPEGCompression);
}

IMPL_LINK(ImagesPage, RemoveCropAreaActionPerformed, weld::Toggleable&, rBox, void)
{
    mrOptimizerDialog.SetConfigProperty(TK_RemoveCropArea, Any(rBox.get_active()));
}

IMPL_LINK(ImagesPage, EmbedLinkedGraphicsActionPerformed, weld::Toggleable&, rBox, void)
{
    mrOptimizerDialog.SetConfigProperty(TK_EmbedLinkedGraphics, Any(rBox.get_active()));
}

IMPL_LINK(SlidesPage, UnusedHiddenSlidesActionPerformed, weld::Toggleable&, rBox, void)
{
    mrOptimizerDialog.SetConfigProperty(TK_DeleteHiddenSlides, Any(rBox.get_active()));
}

IMPL_LINK(SlidesPage, UnusedMasterPagesActionPerformed, weld::Toggleable&, rBox, void)
{
    mrOptimizerDialog.SetConfigProperty(TK_DeleteUnusedMasterPages, Any(rBox.get_active()));
}

IMPL_LINK(SlidesPage, DeleteNotesActionPerformed, weld::Toggleable&, rBox, void)
{
    mrOptimizerDialog.SetConfigProperty(TK_DeleteNotesPages, Any(rBox.get_active()));
}

IMPL_LINK(SlidesPage, UnusedSlidesActionPerformed, weld::Toggleable&, rBox, void)
{
    mxComboBox->set_sensitive(rBox.get_active());
}

bool OptimizerDialog::onFinish()
{
    UpdateConfiguration();

    // a pass the user disabled on the summary page is turned off in the
    // working settings before they are handed to the optimizer
    if (!mpPage4->IsPassEnabled(OptimizerPass::DeleteSlides))
    {
        SetConfigProperty( TK_DeleteHiddenSlides, Any( false ) );
        SetConfigProperty( TK_DeleteUnusedMasterPages, Any( false ) );
    }
    if (!mpPage4->IsPassEnabled(OptimizerPass::OptimizeImages))
    {
        SetConfigProperty( TK_JPEGCompression, Any( false ) );
        SetConfigProperty( TK_ImageResolution, Any( sal_Int32( 0 ) ) );
        SetConfigProperty( TK_RemoveCropArea, Any( false ) );
        SetConfigProperty( TK_EmbedLinkedGraphics, Any( false ) );
    }
    if (!mpPage4->IsPassEnabled(OptimizerPass::ReplaceOLEObjects))
        SetConfigProperty( TK_OLEOptimization, Any( false ) );

    ShowPage(ITEM_ID_SUMMARY);
    m_xPrevPage->set_sensitive(false);
    m_xNextPage->set_sensitive(false);
    m_xFinish->set_sensitive(false);
    m_xCancel->set_sensitive(false);

    // The changes are applied to the current presentation, so unsaved
    // edits are confirmed before the content is replaced. A kit session
    // saves the document as it is edited and the introduction page
    // already says that the presentation itself changes, so there it
    // applies straight away.
    Reference<XModifiable> xModifiable(mxController->getModel(),
                                       UNO_QUERY_THROW );
    if ( !comphelper::COKit::isActive() && xModifiable->isModified() )
    {
        SolarMutexGuard aSolarGuard;
        std::shared_ptr<weld::MessageDialog> xPopupDlg(Application::CreateMessageDialog(
            m_xAssistant.get(), VclMessageType::Question, VclButtonsType::YesNo,
            SdextResId( STR_WARN_UNSAVED_PRESENTATION )));
        xPopupDlg->runAsync(xPopupDlg, [this](sal_Int32 nResult)
        {
            if (nResult == RET_YES)
                implApplyOptimizationAndFinish();
            else
            {
                // Selected not "yes" ("no" or dialog was cancelled) so return to previous step
                m_xPrevPage->set_sensitive(true);
                m_xNextPage->set_sensitive(true);
                m_xFinish->set_sensitive(true);
                m_xCancel->set_sensitive(true);
            }
        });
        // the confirmation dialog continues or cancels the finish from its callback
        return false;
    }
    return implApplyOptimizationAndFinish();
}

bool OptimizerDialog::implApplyOptimizationAndFinish()
{
    URL aURL;
    aURL.Protocol = u"vnd.com.sun.star.comp.PPPOptimizer:"_ustr;
    aURL.Path = u"optimize"_ustr;

    // The result dialog outlives the wizard, so it is parented to the
    // document window rather than to the wizard.
    Sequence< PropertyValue > lArguments{
        comphelper::makePropertyValue(u"Settings"_ustr, GetConfigurationSequence()),
        comphelper::makePropertyValue(u"StatusDispatcher"_ustr, GetStatusDispatcher()),
        comphelper::makePropertyValue(u"DocumentFrame"_ustr, GetFrame()),
        comphelper::makePropertyValue(u"DialogParentWindow"_ustr, GetFrame()->getContainerWindow())
    };

    ErrCode errorCode;
    try
    {
        auto pOptimizer = std::make_shared<ImpOptimizer>(mxContext, GetFrame()->getController()->getModel());
        pOptimizer->Optimize(lArguments);
    }
    catch (css::io::IOException&)
    {
        // We always receive just ERRCODE_IO_CANTWRITE in case of problems, so no need to bother
        // about extracting error code from exception text
        errorCode = ERRCODE_IO_CANTWRITE;
    }
    catch (css::uno::Exception&)
    {
        // Other general exception
        errorCode = ERRCODE_IO_GENERAL;
    }

    if (errorCode != ERRCODE_NONE)
    {
        // Restore wizard controls
        maStats.SetStatusValue(TK_Progress, Any(static_cast<sal_Int32>(0)));
        m_xPrevPage->set_sensitive(true);
        m_xNextPage->set_sensitive(false);
        m_xFinish->set_sensitive(true);
        m_xCancel->set_sensitive(true);

        OUString aFileName;
        GetConfigProperty(TK_SaveAsURL) >>= aFileName;
        SfxErrorContext aEc(ERRCTX_SFX_SAVEASDOC, aFileName);
        ErrorHandler::HandleError(errorCode);
        return false;
    }

    return vcl::RoadmapWizardMachine::onFinish();
}

IMPL_LINK(ImagesPage, SpinButtonActionPerformed, weld::SpinButton&, rBox, void)
{
    mrOptimizerDialog.SetConfigProperty( TK_JPEGQuality, Any( static_cast<sal_Int32>(rBox.get_value()) ) );
}

IMPL_LINK(ImagesPage, ResolutionActionPerformed, weld::Toggleable&, rButton, void)
{
    if (!rButton.get_active())
        return;

    for (size_t i = 0; i < std::size(maResolutions); ++i)
    {
        if (&rButton == m_xResolutions[i].get())
        {
            mrOptimizerDialog.SetConfigProperty( TK_ImageResolution,
                                                 Any( sal_Int32( maResolutions[i] ) ) );
            return;
        }
    }
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
