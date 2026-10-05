/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
#pragma once

#include <com/sun/star/text/XTextDocument.hpp>
#include <ooo/vba/word/XContentControl.hpp>

#include <vbahelper/vbahelperinterface.hxx>

#include <textcontentcontrol.hxx>
#include <rtl/ref.hxx>

class SwXTextDocument;

typedef InheritedHelperInterfaceWeakImpl<ooo::vba::word::XContentControl> SwVbaContentControl_BASE;

class SwVbaContentControl : public SwVbaContentControl_BASE
{
private:
    rtl::Reference<SwXTextDocument> mxTextDocument;
    std::shared_ptr<SwContentControl> m_pCC;

public:
    /// @throws cpo::uno::RuntimeException
    SwVbaContentControl(const cpo::uno::Reference<ooo::vba::XHelperInterface>& rParent,
                        const cpo::uno::Reference<cpo::uno::XComponentContext>& rContext,
                        const rtl::Reference<SwXTextDocument>& xTextDocument,
                        std::shared_ptr<SwContentControl> pContentControl);
    ~SwVbaContentControl() override;

    // XContentControl Properties
    bool getAllowInsertDeleteSection() override;
    void setAllowInsertDeleteSection(bool bSet) override;

    sal_Int32 getAppearance() override;
    void setAppearance(sal_Int32 nSet) override;

    OUString getBuildingBlockCategory() override;
    void setBuildingBlockCategory(const OUString& sSet) override;

    sal_Int32 getBuildingBlockType() override;
    void setBuildingBlockType(sal_Int32 nSet) override;

    bool getChecked() override;
    void setChecked(bool bSet) override;

    // returns or sets a WdColor (@since after 2010 I assume)
    sal_Int32 getColor() override;
    void setColor(sal_Int32 nSet) override;

    sal_Int32 getDateCalendarType() override;
    void setDateCalendarType(sal_Int32 nSet) override;

    OUString getDateDisplayFormat() override;
    void setDateDisplayFormat(const OUString& sSet) override;

    sal_Int32 getDateDisplayLocale() override;

    sal_Int32 getDateStorageFormat() override;
    void setDateStorageFormat(sal_Int32 nSet) override;

    cpo::uno::Any getDropdownListEntries() override;

    // This is an integer used as a unique identifier string
    OUString getID() override;

    sal_Int32 getLevel() override;

    // returns or sets if the user can delete the control
    bool getLockContentControl() override;
    void setLockContentControl(bool bSet) override;

    // returns or sets if the user can edit the contents (i.e. read-only flag)
    bool getLockContents() override;
    void setLockContents(bool bSet) override;

    bool getMultiLine() override;
    void setMultiLine(bool bSet) override;

    // WRONG- THIS SHOULD RETURN XBUILDINGBLOCK
    OUString getPlaceholderText() override;

    bool getShowingPlaceholderText() override;

    OUString getRepeatingSectionItemTitle() override;
    void setRepeatingSectionItemTitle(const OUString& rSet) override;

    cpo::uno::Reference<ooo::vba::word::XRange> getRange() override;

    OUString getTag() override;
    void setTag(const OUString& rSet) override;

    // returns or sets if the control is removed after accepting user change (i.e. control -> text)
    bool getTemporary() override;
    void setTemporary(bool bSet) override;

    OUString getTitle() override;
    void setTitle(const OUString& rSet) override;

    // returns or sets a WdContentControlType that represents the type for a content control.
    sal_Int32 getType() override;
    void setType(sal_Int32 nSet) override;

    // XContentControl Methods

    // Copies the content control from the active document to the Clipboard.
    // Retrieve from the clipboard using the Paste method of the Selection object
    // or of the Range object, or use the Paste function from within Microsoft Word.
    void Copy() override;

    // Removes the control from the active document and moves it to the Clipboard.
    void Cut() override;

    // Specifies whether to delete the contents of the content control. The default value is False.
    // True removes both the content control and its contents.
    // False removes the control but leaves the contents of the content control in the document.
    void Delete(const cpo::uno::Any& bDeleteContents) override;

    // Set the Unicode character used to display the checked state.
    void SetCheckedSymbol(sal_Int32 Character, const cpo::uno::Any& sFont) override;

    // Set the Unicode character used to display the unchecked state.
    void SetUnCheckedSymbol(sal_Int32 Character, const cpo::uno::Any& sFont) override;

    // Sets the placeholder text that displays until a user enters their own text.
    // Only one of the parameters is used when specifying placeholder text.
    // If more than one parameter is provided, use the text specified in the first parameter.
    // If all parameters are omitted, the placeholder text is blank.
    void SetPlaceholderText(const cpo::uno::Any& BuildingBlock, const cpo::uno::Any& Range,
                                     const cpo::uno::Any& sText) override;

    void Ungroup() override;

    // XHelperInterface
    OUString getServiceImplName() override;
    cpo::uno::Sequence<OUString> getServiceNames() override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
