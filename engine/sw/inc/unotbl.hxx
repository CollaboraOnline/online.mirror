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

#ifndef INCLUDED_SW_INC_UNOTBL_HXX
#define INCLUDED_SW_INC_UNOTBL_HXX

#include <com/sun/star/lang/XUnoTunnel.hpp>
#include <com/sun/star/container/XNamed.hpp>
#include <com/sun/star/container/XEnumerationAccess.hpp>
#include <com/sun/star/util/XSortable.hpp>
#include <com/sun/star/chart/XChartDataArray.hpp>
#include <com/sun/star/text/XTextTableCursor.hpp>
#include <com/sun/star/text/XTextTable.hpp>
#include <com/sun/star/table/XCellRange.hpp>
#include <com/sun/star/sheet/XCellRangeData.hpp>
#include <com/sun/star/table/XAutoFormattable.hpp>

#include <cppuhelper/implbase.hxx>

#include <comphelper/uno3.hxx>

#include <svl/listener.hxx>

#include "TextCursorHelper.hxx"
#include "unotext.hxx"
#include "frmfmt.hxx"
#include "unocrsr.hxx"

class SwTable;
class SwTableBox;
class SwTableLine;
class SwTableCursor;
class SwUnoInternalPaM;
struct SwXParagraphEnumeration;
class SwXTableRows;
class SfxItemPropertySet;

typedef
cppu::WeakImplHelper
<
    css::table::XCell,
    css::lang::XServiceInfo,
    css::beans::XPropertySet,
    css::container::XEnumerationAccess
>
SwXCellBaseClass;
class SW_DLLPUBLIC SwXCell final : public SwXCellBaseClass,
    public SwXText,
    public SvtListener
{
    friend void   sw_setString( SwXCell &rCell, const OUString &rText,
                                bool bKeepNumberFormat );
    friend void   sw_setValue( SwXCell &rCell, double nVal );

    const SfxItemPropertySet*   m_pPropSet;
    SwTableBox*                 m_pBox;       // only set in non-XML import
    const SwStartNode*      m_pStartNode; // only set in XML import
    SwFrameFormat* m_pTableFormat;

    // table position where pBox was found last
    size_t m_nFndPos;
    cpo::uno::Reference<SwXText> m_xParentText;
    static size_t const NOTFOUND = SAL_MAX_SIZE;

    virtual const SwStartNode *GetStartNode() const override;

    bool IsValid() const;

    virtual ~SwXCell() override;

    virtual void Notify(const SfxHint&) override;

public:
    SwXCell(SwFrameFormat* pTableFormat, SwTableBox* pBox, size_t nPos);
    SwXCell(SwFrameFormat* pTableFormat, const SwStartNode& rStartNode); // XML import interface

    virtual cpo::uno::Any queryInterface( const cpo::uno::Type& aType ) override;
    virtual void acquire(  ) noexcept override;
    virtual void release(  ) noexcept override;

    //XTypeProvider
    virtual cpo::uno::Sequence< cpo::uno::Type > getTypes(  ) override;
    virtual cpo::uno::Sequence< sal_Int8 > getImplementationId(  ) override;

    //XCell
    virtual OUString getFormula(  ) override;
    virtual void setFormula( const OUString& aFormula ) override;
    virtual double getValue(  ) override;
    /// @throws cpo::uno::RuntimeException
    double getValue(  ) const
        { return const_cast<SwXCell*>(this)->getValue(); };
    virtual void setValue( double nValue ) override;
    virtual css::table::CellContentType getType(  ) override;
    virtual sal_Int32 getError(  ) override;

    //XText
    virtual rtl::Reference< SwXTextCursor > createXTextCursor() override;
    virtual rtl::Reference< SwXTextCursor > createXTextCursorByRange(
            const ::cpo::uno::Reference< ::css::text::XTextRange >& aTextPosition ) override;
    virtual void  setString(const OUString& aString) override;

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

    //XEnumerationAccess - was: XParagraphEnumerationAccess
    virtual cpo::uno::Reference< css::container::XEnumeration >  createEnumeration() override;

    //XElementAccess
    virtual cpo::uno::Type getElementType(  ) override;
    virtual bool hasElements(  ) override;

    rtl::Reference< SwXParagraphEnumeration > createSwEnumeration();
    SwTableBox* GetTableBox() const { return m_pBox; }
    static rtl::Reference<SwXCell> CreateXCell(SwFrameFormat* pTableFormat, SwTableBox* pBox, SwTable *pTable = nullptr );
    SwTableBox* FindBox(SwTable* pTable, SwTableBox* pBox);
    SwFrameFormat* GetFrameFormat() const { return m_pTableFormat; }
    double GetForcedNumericalValue() const;
    cpo::uno::Any GetAny() const;
private:
    rtl::Reference< SwXTextCursor > createXTextCursorByRangeImpl(SwUnoInternalPaM& rPam);
};

class SwXTextTableRow final
    : public cppu::WeakImplHelper<css::beans::XPropertySet, css::lang::XServiceInfo>
    , public SvtListener
{
    SwFrameFormat* m_pFormat;
    SwTableLine* m_pLine;
    const SfxItemPropertySet* m_pPropSet;

    SwFrameFormat* GetFrameFormat() { return m_pFormat; }
    const SwFrameFormat* GetFrameFormat() const { return m_pFormat; }
    virtual ~SwXTextTableRow() override;

public:
    SwXTextTableRow(SwFrameFormat* pFormat, SwTableLine* pLine);


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

    static SwTableLine* FindLine(SwTable* pTable, SwTableLine const * pLine);

    void Notify(const SfxHint&) override;
};


typedef cppu::ImplInheritanceHelper<
    OTextCursorHelper,
    css::text::XTextTableCursor,
    css::lang::XServiceInfo> SwXTextTableCursor_Base;
class SW_DLLPUBLIC SwXTextTableCursor final
    : public SwXTextTableCursor_Base
    , public SvtListener
{
    SwFrameFormat* m_pFrameFormat;
    const SfxItemPropertySet* m_pPropSet;
    sw::UnoCursorPointer m_pUnoCursor;

public:
    SwXTextTableCursor(SwFrameFormat* pFormat, SwTableBox const* pBox);
    SwXTextTableCursor(SwFrameFormat& rTableFormat, const SwTableCursor* pTableSelection);
    virtual void release() noexcept override;

    //XTextTableCursor
    virtual OUString getRangeName() override;
    virtual bool gotoCellByName( const OUString& aCellName, bool bExpand ) override;
    virtual bool goLeft( sal_Int16 nCount, bool bExpand ) override;
    virtual bool goRight( sal_Int16 nCount, bool bExpand ) override;
    virtual bool goUp( sal_Int16 nCount, bool bExpand ) override;
    virtual bool goDown( sal_Int16 nCount, bool bExpand ) override;
    virtual void gotoStart( bool bExpand ) override;
    virtual void gotoEnd( bool bExpand ) override;
    virtual bool mergeRange() override;
    virtual bool splitRange( sal_Int16 Count, bool Horizontal ) override;

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


    // ITextCursorHelper
    virtual const SwPaM*        GetPaM() const override;
    virtual SwPaM*              GetPaM() override;
    virtual const SwDoc*        GetDoc() const override;
    virtual SwDoc*              GetDoc() override;

    virtual void Notify( const SfxHint& ) override;

    const SwUnoCursor&            GetCursor() const;
    SwUnoCursor&                  GetCursor();
    SwFrameFormat* GetFrameFormat() const { return m_pFrameFormat; }
};

struct SwRangeDescriptor
{
    sal_Int32 nTop;
    sal_Int32 nLeft;
    sal_Int32 nBottom;
    sal_Int32 nRight;

    void Normalize();
};

class SW_DLLPUBLIC SwXTextTable final : public cppu::WeakImplHelper
<
    css::text::XTextTable,
    css::lang::XServiceInfo,
    css::table::XCellRange,
    css::chart::XChartDataArray,
    css::beans::XPropertySet,
    css::container::XNamed,
    css::table::XAutoFormattable,
    css::util::XSortable,
    css::sheet::XCellRangeData
>
{
private:
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    SwXTextTable();
    SwXTextTable(SwFrameFormat& rFrameFormat);
    virtual ~SwXTextTable() override;

public:
    static rtl::Reference<SwXTextTable>
            CreateXTextTable(SwFrameFormat * pFrameFormat);

    static void GetCellPosition(std::u16string_view aCellName, sal_Int32& o_rColumn, sal_Int32& o_rRow);

    SwFrameFormat* GetFrameFormat();

    //XTextTable
    virtual void initialize( sal_Int32 nRows, sal_Int32 nColumns ) override;
    virtual cpo::uno::Reference< css::table::XTableRows > getRows(  ) override;
    virtual cpo::uno::Reference< css::table::XTableColumns > getColumns(  ) override;
    virtual cpo::uno::Reference< css::table::XCell > getCellByName( const OUString& aCellName ) override;
    virtual cpo::uno::Sequence< OUString > getCellNames(  ) override;
    virtual cpo::uno::Reference< css::text::XTextTableCursor > createCursorByCellName( const OUString& aCellName ) override;

    //XTextContent
    virtual void attach(const cpo::uno::Reference< css::text::XTextRange > & xTextRange) override;
    virtual cpo::uno::Reference< css::text::XTextRange > getAnchor(  ) override;

    //XComponent
    virtual void dispose() override;
    virtual void addEventListener(const cpo::uno::Reference< css::lang::XEventListener > & aListener) override;
    virtual void removeEventListener(const cpo::uno::Reference< css::lang::XEventListener > & aListener) override;

    //XCellRange
    virtual cpo::uno::Reference< css::table::XCell > getCellByPosition( sal_Int32 nColumn, sal_Int32 nRow ) override;
    virtual cpo::uno::Reference< css::table::XCellRange > getCellRangeByPosition( sal_Int32 nLeft, sal_Int32 nTop, sal_Int32 nRight, sal_Int32 nBottom ) override;
    virtual cpo::uno::Reference< css::table::XCellRange > getCellRangeByName( const OUString& aRange ) override;

    //XChartDataArray
    virtual cpo::uno::Sequence< cpo::uno::Sequence< double > > getData(  ) override;
    virtual void setData( const cpo::uno::Sequence< cpo::uno::Sequence< double > >& aData ) override;
    virtual cpo::uno::Sequence< OUString > getRowDescriptions(  ) override;
    virtual void setRowDescriptions( const cpo::uno::Sequence< OUString >& aRowDescriptions ) override;
    virtual cpo::uno::Sequence< OUString > getColumnDescriptions(  ) override;
    virtual void setColumnDescriptions( const cpo::uno::Sequence< OUString >& aColumnDescriptions ) override;

    //XChartData
    virtual void addChartDataChangeEventListener( const cpo::uno::Reference< css::chart::XChartDataChangeEventListener >& aListener ) override;
    virtual void removeChartDataChangeEventListener( const cpo::uno::Reference< css::chart::XChartDataChangeEventListener >& aListener ) override;
    virtual double getNotANumber(  ) override;
    virtual bool isNotANumber( double nNumber ) override;

    //XSortable
    virtual cpo::uno::Sequence< css::beans::PropertyValue > createSortDescriptor() override;
    virtual void sort(const cpo::uno::Sequence< css::beans::PropertyValue >& xDescriptor) override;

    //XAutoFormattable
    virtual void autoFormat(const OUString& aName) override;

    //XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo > getPropertySetInfo(  ) override;
    virtual void setPropertyValue( const OUString& aPropertyName, const cpo::uno::Any& aValue ) override;
    virtual cpo::uno::Any getPropertyValue( const OUString& PropertyName ) override;
    virtual void addPropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener ) override;
    virtual void removePropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& aListener ) override;
    virtual void addVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;
    virtual void removeVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;

    //XNamed
    virtual OUString getName() override;
    virtual void setName(const OUString& Name_) override;

    //XCellRangeData
    virtual cpo::uno::Sequence< cpo::uno::Sequence< cpo::uno::Any > > getDataArray(  ) override;
    virtual void setDataArray( const cpo::uno::Sequence< cpo::uno::Sequence< cpo::uno::Any > >& aArray ) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;

    rtl::Reference< SwXTableRows > getSwRows();
    rtl::Reference< SwXCell > getSwCellByPosition( sal_Int32 nColumn, sal_Int32 nRow );
    rtl::Reference< SwXCell > getSwCellByName( const OUString& aCellName );
};

class SwXCellRange final : public cppu::WeakImplHelper
<
    css::table::XCellRange,
    css::lang::XServiceInfo,
    css::beans::XPropertySet,
    css::chart::XChartDataArray,
    css::util::XSortable,
    css::sheet::XCellRangeData
>
{
private:
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;

    SwXCellRange(const sw::UnoCursorPointer& pCursor, SwFrameFormat& rFrameFormat, SwRangeDescriptor const & rDesc);
    virtual ~SwXCellRange() override;

public:
    static ::rtl::Reference<SwXCellRange> CreateXCellRange(
            const sw::UnoCursorPointer& pCursor, SwFrameFormat& rFrameFormat,
            SwRangeDescriptor const & rDesc);

    void SetLabels(bool bFirstRowAsLabel, bool bFirstColumnAsLabel);

    std::vector<cpo::uno::Reference<css::table::XCell>> GetCells();

    const SwUnoCursor* GetTableCursor() const;

    //XCellRange
    virtual cpo::uno::Reference< css::table::XCell > getCellByPosition( sal_Int32 nColumn, sal_Int32 nRow ) override;
    virtual cpo::uno::Reference< css::table::XCellRange > getCellRangeByPosition( sal_Int32 nLeft, sal_Int32 nTop, sal_Int32 nRight, sal_Int32 nBottom ) override;
    virtual cpo::uno::Reference< css::table::XCellRange > getCellRangeByName( const OUString& aRange ) override;

    //XPropertySet
    virtual cpo::uno::Reference< css::beans::XPropertySetInfo > getPropertySetInfo(  ) override;
    virtual void setPropertyValue(const OUString& aPropertyName, const cpo::uno::Any& aValue) override;
    virtual cpo::uno::Any getPropertyValue(const OUString& PropertyName) override;
    virtual void addPropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& xListener ) override;
    virtual void removePropertyChangeListener( const OUString& aPropertyName, const cpo::uno::Reference< css::beans::XPropertyChangeListener >& aListener ) override;
    virtual void addVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;
    virtual void removeVetoableChangeListener( const OUString& PropertyName, const cpo::uno::Reference< css::beans::XVetoableChangeListener >& aListener ) override;

    //XChartData
    virtual void addChartDataChangeEventListener( const cpo::uno::Reference< css::chart::XChartDataChangeEventListener >& aListener ) override;
    virtual void removeChartDataChangeEventListener( const cpo::uno::Reference< css::chart::XChartDataChangeEventListener >& aListener ) override;
    virtual double getNotANumber(  ) override;
    virtual bool isNotANumber( double nNumber ) override;

    //XChartDataArray
    virtual cpo::uno::Sequence< cpo::uno::Sequence< double > > getData(  ) override;
    virtual void setData( const cpo::uno::Sequence< cpo::uno::Sequence< double > >& aData ) override;
    virtual cpo::uno::Sequence< OUString > getRowDescriptions(  ) override;
    virtual void setRowDescriptions( const cpo::uno::Sequence< OUString >& aRowDescriptions ) override;
    virtual cpo::uno::Sequence< OUString > getColumnDescriptions(  ) override;
    virtual void setColumnDescriptions( const cpo::uno::Sequence< OUString >& aColumnDescriptions ) override;

    //XSortable
    virtual cpo::uno::Sequence< css::beans::PropertyValue > createSortDescriptor() override;
    virtual void sort(const cpo::uno::Sequence< css::beans::PropertyValue >& xDescriptor) override;

    //XCellRangeData
    virtual cpo::uno::Sequence< cpo::uno::Sequence< cpo::uno::Any > > getDataArray(  ) override;
    virtual void setDataArray( const cpo::uno::Sequence< cpo::uno::Sequence< cpo::uno::Any > >& aArray ) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;

};

/// UNO API wrapper for SwTableLines.
class SAL_DLLPUBLIC_RTTI SwXTableRows final : public cppu::WeakImplHelper
<
    css::table::XTableRows,
    css::lang::XServiceInfo
>
{
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;
    SwFrameFormat* GetFrameFormat();
    const SwFrameFormat* GetFrameFormat() const { return const_cast<SwXTableRows*>(this)->GetFrameFormat(); }
    virtual ~SwXTableRows() override;

public:
    SwXTableRows(SwFrameFormat& rFrameFormat);

    //XIndexAccess
    SW_DLLPUBLIC virtual sal_Int32 getCount() override;
    virtual cpo::uno::Any getByIndex(sal_Int32 nIndex) override;

    //XElementAccess
    virtual cpo::uno::Type getElementType(  ) override;
    virtual bool hasElements(  ) override;

    //XTableRows
    virtual void insertByIndex(sal_Int32 nIndex, sal_Int32 nCount) override;
    virtual void removeByIndex(sal_Int32 nIndex, sal_Int32 nCount) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;
};

class SwXTableColumns final : public cppu::WeakImplHelper
<
    css::table::XTableColumns,
    css::lang::XServiceInfo
>
{
private:
    class Impl;
    ::sw::UnoImplPtr<Impl> m_pImpl;
    SwFrameFormat* GetFrameFormat() const;

    virtual ~SwXTableColumns() override;
public:
    SwXTableColumns(SwFrameFormat& rFrameFormat);


    //XIndexAccess
    virtual sal_Int32 getCount() override;
    virtual cpo::uno::Any getByIndex(sal_Int32 nIndex) override;

    //XElementAccess
    virtual cpo::uno::Type getElementType(  ) override;
    virtual bool hasElements(  ) override;

    //XTableColumns
    virtual void insertByIndex(sal_Int32 nIndex, sal_Int32 nCount) override;
    virtual void removeByIndex(sal_Int32 nIndex, sal_Int32 nCount) override;

    //XServiceInfo
    virtual OUString getImplementationName() override;
    virtual bool supportsService(const OUString& ServiceName) override;
    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames() override;
};

int sw_CompareCellRanges(
        std::u16string_view aRange1StartCell, std::u16string_view aRange1EndCell,
        std::u16string_view aRange2StartCell, std::u16string_view aRange2EndCell,
        bool bCmpColsFirst );

void sw_NormalizeRange( OUString &rCell1, OUString &rCell2 );

OUString sw_GetCellName( sal_Int32 nColumn, sal_Int32 nRow );

int sw_CompareCellsByColFirst( std::u16string_view aCellName1, std::u16string_view aCellName2 );

int sw_CompareCellsByRowFirst( std::u16string_view aCellName1, std::u16string_view aCellName2 );

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
