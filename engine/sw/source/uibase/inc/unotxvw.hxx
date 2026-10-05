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
#ifndef INCLUDED_SW_SOURCE_UIBASE_INC_UNOTXVW_HXX
#define INCLUDED_SW_SOURCE_UIBASE_INC_UNOTXVW_HXX

#include <sfx2/sfxbasecontroller.hxx>
#include <comphelper/interfacecontainer3.hxx>
#include <com/sun/star/text/XTextViewCursor.hpp>
#include <com/sun/star/text/XTextViewCursorSupplier.hpp>
#include <com/sun/star/text/XTextViewTextRangeSupplier.hpp>
#include <com/sun/star/text/XRubySelection.hpp>
#include <com/sun/star/view/XFormLayerAccess.hpp>
#include <com/sun/star/view/XScreenCursor.hpp>
#include <com/sun/star/view/XViewSettingsSupplier.hpp>
#include <com/sun/star/view/XSelectionSupplier.hpp>
#include <com/sun/star/view/XLineCursor.hpp>
#include <com/sun/star/view/XViewCursor.hpp>
#include <com/sun/star/text/XPageCursor.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/beans/XPropertySetInfo.hpp>
#include <com/sun/star/beans/XPropertyState.hpp>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/datatransfer/XTransferableSupplier.hpp>
#include <com/sun/star/datatransfer/XTransferableTextSupplier.hpp>
#include <com/sun/star/qa/XDumper.hpp>
#include <cppuhelper/implbase.hxx>
#include <svl/itemprop.hxx>
#include <TextCursorHelper.hxx>
#include <comphelper/uno3.hxx>

#include <sfx2/objsh.hxx>

class SdrObject;
class SwView;
class SwXViewSettings;
class SwXTextViewCursor;

typedef cppu::ImplInheritanceHelper<
            SfxBaseController,
            css::view::XSelectionSupplier,
            css::lang::XServiceInfo,
            css::view::XFormLayerAccess,
            css::text::XTextViewCursorSupplier,
            css::text::XTextViewTextRangeSupplier,
            css::text::XRubySelection,
            css::view::XViewSettingsSupplier,
            css::beans::XPropertySet,
            css::datatransfer::XTransferableSupplier,
            css::datatransfer::XTransferableTextSupplier,
            css::qa::XDumper> SwXTextView_Base;
class SwXTextView final : public SwXTextView_Base
{
    ::comphelper::OInterfaceContainerHelper3<css::view::XSelectionChangeListener> m_SelChangedListeners;

    SwView*                     m_pView;
    const SfxItemPropertySet*   m_pPropSet;   // property map for SwXTextView properties
                                        // (not related to mxViewSettings!)

    rtl::Reference< SwXViewSettings >     mxViewSettings;
    rtl::Reference< SwXTextViewCursor >   mxTextViewCursor;

    SdrObject* GetControl(
        const cpo::uno::Reference< css::awt::XControlModel > & Model,
        cpo::uno::Reference< css::awt::XControl >& xToFill  );

    virtual ~SwXTextView() override;
public:
    SwXTextView(SwView* pSwView);

    //XSelectionSupplier
    virtual cpo::uno::Any getSelection() override;
    virtual bool select(const cpo::uno::Any& rInterface) override;
    virtual void addSelectionChangeListener(const cpo::uno::Reference< css::view::XSelectionChangeListener > & xListener) override;
    virtual void removeSelectionChangeListener(const cpo::uno::Reference< css::view::XSelectionChangeListener > & xListener) override;

    // XFormLayerAccess
    virtual cpo::uno::Reference< css::form::runtime::XFormController > getFormController( const cpo::uno::Reference< css::form::XForm >& Form ) override;
    virtual bool isFormDesignMode(  ) override;
    virtual void setFormDesignMode( bool DesignMode ) override;

    // XControlAccess
    virtual cpo::uno::Reference< css::awt::XControl >  getControl(const cpo::uno::Reference< css::awt::XControlModel > & Model) override;

    //XTextViewCursorSupplier
    virtual cpo::uno::Reference< css::text::XTextViewCursor >  getViewCursor() override;

    // XTextViewTextRangeSupplier
    virtual cpo::uno::Reference<css::text::XTextRange>
        createTextRangeByPixelPosition(const css::awt::Point& rPixelPosition) override;

    //XViewSettings
    virtual cpo::uno::Reference< css::beans::XPropertySet >  getViewSettings() override;

    //XRubySelection
    virtual cpo::uno::Sequence<
            cpo::uno::Sequence< css::beans::PropertyValue > > getRubyList( bool bAutomatic ) override;

    virtual void setRubyList(
        const cpo::uno::Sequence<
        cpo::uno::Sequence< css::beans::PropertyValue > >& RubyList, bool bAutomatic ) override;

    //XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo > getPropertySetInfo(  ) override;
    virtual void setPropertyValue( const OUString& aPropertyName, const cpo::uno::Any& aValue ) override;
    virtual cpo::uno::Any getPropertyValue( const OUString& PropertyName ) override;
    virtual void addPropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener ) override;
    virtual void removePropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& aListener ) override;
    virtual void addVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;
    virtual void removeVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;

    //XTransferableSupplier
    virtual cpo::uno::Reference< css::datatransfer::XTransferable > getTransferable(  ) override;
    virtual void insertTransferable( const cpo::uno::Reference< css::datatransfer::XTransferable >& xTrans ) override;

    // XTransferableTextSupplier
    virtual cpo::uno::Reference<css::datatransfer::XTransferable> getTransferableForTextRange(cpo::uno::Reference<css::text::XTextRange> const& xTextRange) override;

    // XDumper
    OUString dump(const OUString& rKind) override;

    void                    NotifySelChanged();
    void                    NotifyDBChanged();

    SwView*                 GetView() {return m_pView;}
    void                    Invalidate();

    // temporary document used for PDF export of selections/multi-selections
    SfxObjectShellLock      BuildTmpSelectionDoc();
};

typedef cppu::ImplInheritanceHelper<
                            OTextCursorHelper,
                            css::text::XTextViewCursor,
                            css::lang::XServiceInfo,
                            css::text::XPageCursor,
                            css::view::XScreenCursor,
                            css::view::XViewCursor,
                            css::view::XLineCursor,
                            css::beans::XPropertyState
                            > SwXTextViewCursor_Base;

class SwXTextViewCursor final: public SwXTextViewCursor_Base
{
    SwView*                         m_pView;
    const SfxItemPropertySet*       m_pPropSet;
    bool        IsTextSelection( bool bAllowTables = true ) const;
    virtual     ~SwXTextViewCursor() override;

public:
    SwXTextViewCursor(SwView* pVw);

    //XTextViewCursor
    virtual bool isVisible() override;
    virtual void setVisible(bool bVisible) override;
    virtual css::awt::Point getPosition() override;

    //XTextCursor - new
    virtual void collapseToStart() override;
    virtual void collapseToEnd() override;
    virtual bool isCollapsed() override;
    virtual bool goLeft( sal_Int16 nCount, bool bExpand ) override;
    virtual bool goRight( sal_Int16 nCount, bool bExpand ) override;
    virtual void gotoStart( bool bExpand ) override;
    virtual void gotoEnd( bool bExpand ) override;
    virtual void gotoRange( const cpo::uno::Reference< css::text::XTextRange >& xRange, bool bExpand ) override;

    //XPageCursor
    virtual bool jumpToFirstPage() override;
    virtual bool jumpToLastPage() override;
    virtual bool jumpToPage(sal_Int16 nPage) override;
    virtual bool jumpToNextPage() override;
    virtual bool jumpToPreviousPage() override;
    virtual bool jumpToEndOfPage() override;
    virtual bool jumpToStartOfPage() override;
    virtual sal_Int16 getPage() override;

    //XTextRange
    virtual cpo::uno::Reference< css::text::XText >  getText() override;
    virtual cpo::uno::Reference< css::text::XTextRange >  getStart() override;
    virtual cpo::uno::Reference< css::text::XTextRange >   getEnd() override;
    virtual OUString  getString() override;
    virtual void  setString(const OUString& aString) override;

    //XScreenCursor
    virtual bool screenDown() override;
    virtual bool screenUp() override;

    //XViewCursor
    virtual bool goDown(sal_Int16 nCount, bool bExpand) override;
    virtual bool goUp(sal_Int16 nCount, bool bExpand) override;

    //XLineCursor
    virtual bool isAtStartOfLine() override;
    virtual bool isAtEndOfLine() override;
    virtual void gotoEndOfLine(bool bExpand) override;
    virtual void gotoStartOfLine(bool bExpand) override;

    //XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo > getPropertySetInfo(  ) override;
    virtual void setPropertyValue( const OUString& aPropertyName, const cpo::uno::Any& aValue ) override;
    virtual cpo::uno::Any getPropertyValue( const OUString& PropertyName ) override;
    virtual void addPropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener ) override;
    virtual void removePropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& aListener ) override;
    virtual void addVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;
    virtual void removeVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;

    //XPropertyState
    virtual css::beans::PropertyState getPropertyState( const OUString& PropertyName ) override;
    virtual cpo::uno::Sequence< css::beans::PropertyState > getPropertyStates( const cpo::uno::Sequence< OUString >& aPropertyName ) override;
    virtual void setPropertyToDefault( const OUString& PropertyName ) override;
    virtual cpo::uno::Any getPropertyDefault( const OUString& aPropertyName ) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;

    void    Invalidate(){m_pView = nullptr;}

    // ITextCursorHelper
    virtual const SwPaM*        GetPaM() const override;
    virtual SwPaM*              GetPaM() override;
    virtual const SwDoc*        GetDoc() const override;
    virtual SwDoc*              GetDoc() override;
};

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
