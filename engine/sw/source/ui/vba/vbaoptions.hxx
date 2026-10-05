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
#ifndef INCLUDED_SW_SOURCE_UI_VBA_VBAOPTIONS_HXX
#define INCLUDED_SW_SOURCE_UI_VBA_VBAOPTIONS_HXX

#include <ooo/vba/word/XOptions.hpp>
#include <vbahelper/vbahelperinterface.hxx>
#include <vbahelper/vbapropvalue.hxx>

typedef InheritedHelperInterfaceWeakImpl< ooo::vba::word::XOptions > SwVbaOptions_BASE;

class SwVbaOptions : public SwVbaOptions_BASE,
                    public PropListener
{
private:
    OUString msDefaultFilePath;
public:
    explicit SwVbaOptions( cpo::uno::Reference< cpo::uno::XComponentContext > const & m_xContext );
    virtual ~SwVbaOptions() override;

    // Attributes
    virtual ::sal_Int32 getDefaultBorderLineStyle() override;
    virtual void setDefaultBorderLineStyle( ::sal_Int32 _defaultborderlinestyle ) override;
    virtual ::sal_Int32 getDefaultBorderLineWidth() override;
    virtual void setDefaultBorderLineWidth( ::sal_Int32 _defaultborderlinewidth ) override;
    virtual ::sal_Int32 getDefaultBorderColorIndex() override;
    virtual void setDefaultBorderColorIndex( ::sal_Int32 _defaultbordercolorindex ) override;
    virtual bool getReplaceSelection() override;
    virtual void setReplaceSelection( bool _replaceselection ) override;
    virtual bool getMapPaperSize() override;
    virtual void setMapPaperSize( bool _mappapersize ) override;
    virtual bool getAutoFormatAsYouTypeApplyHeadings() override;
    virtual void setAutoFormatAsYouTypeApplyHeadings( bool _autoformatasyoutypeapplyheadings ) override;
    virtual bool getAutoFormatAsYouTypeApplyBulletedLists() override;
    virtual void setAutoFormatAsYouTypeApplyBulletedLists( bool _autoformatasyoutypeapplybulletedlists ) override;
    virtual bool getAutoFormatAsYouTypeApplyNumberedLists() override;
    virtual void setAutoFormatAsYouTypeApplyNumberedLists( bool _autoformatasyoutypeapplynumberedlists ) override;
    virtual bool getAutoFormatAsYouTypeFormatListItemBeginning() override;
    virtual void setAutoFormatAsYouTypeFormatListItemBeginning( bool _autoformatasyoutypeformatlistitembeginning ) override;
    virtual bool getAutoFormatAsYouTypeDefineStyles() override;
    virtual void setAutoFormatAsYouTypeDefineStyles( bool _autoformatasyoutypedefinestyles ) override;
    virtual bool getAutoFormatApplyHeadings() override;
    virtual void setAutoFormatApplyHeadings( bool _autoformatapplyheadings ) override;
    virtual bool getAutoFormatApplyLists() override;
    virtual void setAutoFormatApplyLists( bool _autoformatapplylists ) override;
    virtual bool getAutoFormatApplyBulletedLists() override;
    virtual void setAutoFormatApplyBulletedLists( bool _autoformatapplybulletedlists ) override;

    // Methods
    virtual cpo::uno::Any DefaultFilePath( sal_Int32 _path ) override;

    //PropListener
    virtual void setValueEvent( const cpo::uno::Any& value ) override;
    virtual cpo::uno::Any getValueEvent() override;

    // XHelperInterface
    virtual OUString getServiceImplName() override;
    virtual cpo::uno::Sequence<OUString> getServiceNames() override;
};
#endif // INCLUDED_SW_SOURCE_UI_VBA_VBAOPTIONS_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
