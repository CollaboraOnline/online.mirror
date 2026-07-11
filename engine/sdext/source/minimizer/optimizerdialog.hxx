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

#pragma once

#include <vector>
#include "optimizationstats.hxx"
#include "configurationaccess.hxx"
#include <cpo/uno/Sequence.h>
#include <com/sun/star/uno/XComponentContext.hpp>
#include <com/sun/star/frame/XDispatch.hpp>
#include <cppuhelper/implbase.hxx>
#include <vcl/roadmapwizardmachine.hxx>

#define ITEM_ID_INTRODUCTION            0
#define ITEM_ID_SLIDES                  1
#define ITEM_ID_GRAPHIC_OPTIMIZATION    2
#define ITEM_ID_OLE_OPTIMIZATION        3
#define ITEM_ID_SUMMARY                 4

class OptimizerDialog;

// The independent changes the wizard can apply to the presentation.
enum class OptimizerPass
{
    DeleteSlides,
    OptimizeImages,
    ReplaceOLEObjects
};

class OptimizedDialogPage : public vcl::OWizardPage
{
protected:
    OptimizerDialog& mrOptimizerDialog;
private:
    int m_nPageNum;
public:
    OptimizedDialogPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog,
                        const OUString& rUIXMLDescription, const OUString& rID,
                        int nPageNum);
    virtual void Activate() override;
};

class IntroPage : public OptimizedDialogPage
{
public:
    IntroPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog);
};

class SlidesPage : public OptimizedDialogPage
{
private:
    std::unique_ptr<weld::CheckButton> mxMasterSlides;
    std::unique_ptr<weld::CheckButton> mxHiddenSlides;
    std::unique_ptr<weld::CheckButton> mxUnusedSlides;
    std::unique_ptr<weld::ComboBox> mxComboBox;
    std::unique_ptr<weld::CheckButton> mxClearNodes;

    DECL_LINK(UnusedMasterPagesActionPerformed, weld::Toggleable&, void);
    DECL_LINK(UnusedHiddenSlidesActionPerformed, weld::Toggleable&, void);
    DECL_LINK(UnusedSlidesActionPerformed, weld::Toggleable&, void);
    DECL_LINK(DeleteNotesActionPerformed, weld::Toggleable&, void);

public:
    SlidesPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog);
    void Init(const cpo::uno::Sequence<OUString>& rCustomShowList);
    void UpdateControlStates(bool bDeleteUnusedMasterPages, bool bDeleteHiddenSlides, bool bDeleteNotesPages);
    OUString Get_TK_CustomShowName() const
    {
        if (!mxUnusedSlides->get_sensitive())
            return OUString();
        return mxComboBox->get_active_text();
    }
};

class ImagesPage : public OptimizedDialogPage
{
private:
    std::unique_ptr<weld::RadioButton> m_xLossLessCompression;
    std::unique_ptr<weld::Label> m_xQualityLabel;
    std::unique_ptr<weld::SpinButton> m_xQuality;
    std::unique_ptr<weld::RadioButton> m_xJpegCompression;
    // one button per offered resolution, in the order of maResolutions
    std::unique_ptr<weld::RadioButton> m_xResolutions[5];
    std::unique_ptr<weld::CheckButton> m_xRemoveCropArea;
    std::unique_ptr<weld::CheckButton> m_xEmbedLinkedGraphics;

    // the resolutions in dots per inch, where 0 keeps the images as they are
    static const int maResolutions[5];

    DECL_LINK(EmbedLinkedGraphicsActionPerformed, weld::Toggleable&, void);
    DECL_LINK(RemoveCropAreaActionPerformed, weld::Toggleable&, void);
    DECL_LINK(ResolutionActionPerformed, weld::Toggleable&, void);
    DECL_LINK(CompressionActionPerformed, weld::Toggleable&, void);
    DECL_LINK(SpinButtonActionPerformed, weld::SpinButton&, void);

public:
    ImagesPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog);

    void UpdateControlStates(bool bJPEGCompression, int nJPEGQuality, bool bRemoveCropArea,
                             int nResolution, bool bEmbedLinkedGraphics);
};

class ObjectsPage : public OptimizedDialogPage
{
private:
    std::unique_ptr<weld::CheckButton> m_xCreateStaticImage;
    std::unique_ptr<weld::RadioButton> m_xAllOLEObjects;
    std::unique_ptr<weld::RadioButton> m_xForeignOLEObjects;
    std::unique_ptr<weld::Label> m_xNoObjects;
    std::unique_ptr<weld::Label> m_xLabel;

    // true when the presentation holds at least one OLE object
    bool mbHasOLEObjects = false;

    DECL_LINK(OLEOptimizationActionPerformed, weld::Toggleable&, void);
    DECL_LINK(OLEActionPerformed, weld::Toggleable&, void);

public:
    ObjectsPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog);

    void Init(const OUString& rDesc, bool bHasOLEObjects);

    void UpdateControlStates(bool bConvertOLEObjects, int nOLEOptimizationType);
};

class SummaryPage : public OptimizedDialogPage
{
private:
    std::unique_ptr<weld::CheckButton> m_xChanges[3];
    std::unique_ptr<weld::Label> m_xCurrentSize;
    std::unique_ptr<weld::Label> m_xEstimatedSize;
    std::unique_ptr<weld::Label> m_xStatus;
    std::unique_ptr<weld::ProgressBar> m_xProgress;

    // the pass each visible checkbox stands for, in checkbox order
    std::vector<OptimizerPass> maListedPasses;

    DECL_LINK(ChangeToggled, weld::Toggleable&, void);

public:
    SummaryPage(weld::Container* pPage, OptimizerDialog& rOptimizerDialog);

    void UpdateControlStates(const std::vector<std::pair<OptimizerPass, OUString>>& rChanges,
                             const OUString& rCurrentFileSize,
                             const OUString& rEstimatedFileSize);

    void UpdateStatusLabel(const OUString& rStatus);
    void UpdateProgressValue(int nProgress);

    // A pass the summary page does not list has no checkbox and stays
    // enabled.
    bool IsPassEnabled(OptimizerPass ePass) const;
};

class OptimizerDialog : public vcl::RoadmapWizardMachine, public ConfigurationAccess
{
public:

    OptimizerDialog( const css::uno::Reference< css::uno::XComponentContext >& rxContext, css::uno::Reference< css::frame::XFrame > const & rxFrame,
        css::uno::Reference< css::frame::XDispatch > const & rxStatusDispatcher );
    std::unique_ptr<BuilderPage> createPage(vcl::WizardTypes::WizardState nState) override;
    ~OptimizerDialog();

    short               mnEndStatus;
    bool                mbIsReadonly;

private:
    css::uno::Reference< css::frame::XFrame >         mxFrame;
    css::uno::Reference< css::frame::XController >    mxController;

    css::uno::Reference< css::frame::XDispatch >      mxStatusDispatcher;

    SlidesPage* mpPage1 = nullptr;
    ImagesPage* mpPage2 = nullptr;
    ObjectsPage* mpPage3 = nullptr;
    SummaryPage* mpPage4 = nullptr;

    void InitDialog();
    void InitRoadmap();
    void InitNavigationBar();
    void InitPage1();
    void InitPage2();
    void InitPage3();
    void InitPage4();
    void UpdateControlStatesPage1();
    void UpdateControlStatesPage2();
    void UpdateControlStatesPage3();
    void UpdateControlStatesPage4();

    virtual OUString getStateDisplayName(vcl::WizardTypes::WizardState nState) const override;

    virtual void enterState(vcl::WizardTypes::WizardState nState) override;

    virtual bool onFinish() override;

    // runs the optimization and closes the wizard; on error the wizard
    // stays open with the navigation buttons restored
    bool implApplyOptimizationAndFinish();

public:

    OptimizationStats maStats;

    void UpdateStatus( const cpo::uno::Sequence< css::beans::PropertyValue >& rStatus );

    // the ConfigurationAccess is updated to actual control settings
    void UpdateConfiguration();

    void UpdateControlStates( sal_Int16 nStep = -1 );

    void SetSlidesPage(SlidesPage* pPage1) { mpPage1 = pPage1; }
    void SetImagesPage(ImagesPage* pPage2) { mpPage2 = pPage2; }
    void SetObjectsPage(ObjectsPage* pPage3) { mpPage3 = pPage3; }
    void SetSummaryPage(SummaryPage* pPage4) { mpPage4 = pPage4; }

    css::uno::Reference< css::frame::XDispatch >& GetStatusDispatcher() { return mxStatusDispatcher; };
    css::uno::Reference< css::frame::XFrame>& GetFrame() { return mxFrame; };
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
