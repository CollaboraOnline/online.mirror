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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBAGLOBALS_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBAGLOBALS_HXX

#include <cpo/uno/XComponentContext.hpp>
#include <ooo/vba/word/XGlobals.hpp>
#include <ooo/vba/word/XApplication.hpp>
#include <ooo/vba/word/XSystem.hpp>
#include <ooo/vba/word/XOptions.hpp>
#include <ooo/vba/word/XSelection.hpp>
#include <cppuhelper/implbase.hxx>
#include <vbahelper/vbaglobalbase.hxx>

typedef ::cppu::ImplInheritanceHelper<VbaGlobalsBase, ov::word::XGlobals> SwVbaGlobals_BASE;

class SwVbaGlobals : public SwVbaGlobals_BASE
{
private:
    cpo::uno::Reference<ooo::vba::word::XApplication> mxApplication;

    /// @throws cpo::uno::RuntimeException
    cpo::uno::Reference<ooo::vba::word::XApplication> const& getApplication();

public:
    SwVbaGlobals(cpo::uno::Sequence<cpo::uno::Any> const& aArgs,
                 cpo::uno::Reference<cpo::uno::XComponentContext> const& rxContext);
    virtual ~SwVbaGlobals() override;

    // XGlobals
    virtual OUString getName() override;
    virtual cpo::uno::Reference<ooo::vba::word::XSystem> getSystem() override;
    virtual cpo::uno::Reference<ov::word::XDocument> getActiveDocument() override;
    virtual cpo::uno::Reference<ov::word::XWindow> getActiveWindow() override;
    virtual cpo::uno::Reference<ooo::vba::word::XOptions> getOptions() override;
    virtual cpo::uno::Reference<ooo::vba::word::XSelection> getSelection() override;
    virtual cpo::uno::Reference<ooo::vba::word::XGlobals> getWord() override;
    virtual cpo::uno::Reference<ooo::vba::word::XWordBasic> getWordBasic() override;
    virtual cpo::uno::Any CommandBars(const cpo::uno::Any& aIndex) override;
    virtual cpo::uno::Any Documents(const cpo::uno::Any& aIndex) override;
    virtual cpo::uno::Any Addins(const cpo::uno::Any& aIndex) override;
    virtual cpo::uno::Any Dialogs(const cpo::uno::Any& aIndex) override;
    virtual cpo::uno::Any ListGalleries(const cpo::uno::Any& aIndex) override;
    virtual float CentimetersToPoints(float Centimeters) override;
    virtual float PointsToCentimeters(float Points) override;
    virtual float PixelsToPoints(float Pixels, bool fVertical) override;
    virtual float PointsToPixels(float Pixels, bool fVertical) override;
    virtual float InchesToPoints(float Inches) override;
    virtual float PointsToInches(float Points) override;
    virtual float MillimetersToPoints(float Millimeters) override;
    virtual float PointsToMillimeters(float Points) override;
    virtual float PicasToPoints(float Picas) override;
    virtual float PointsToPicas(float Points) override;

    // XMultiServiceFactory
    virtual cpo::uno::Sequence<OUString> getAvailableServiceNames() override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBAGLOBALS_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
