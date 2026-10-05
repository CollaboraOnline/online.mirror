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
#include <ooo/vba/word/XFormField.hpp>

#include <vbahelper/vbahelperinterface.hxx>
#include <rtl/ref.hxx>

#include <IDocumentMarkAccess.hxx>

class SwXTextDocument;

typedef InheritedHelperInterfaceWeakImpl<ooo::vba::word::XFormField> SwVbaFormField_BASE;

class SwVbaFormField : public SwVbaFormField_BASE
{
private:
    rtl::Reference<SwXTextDocument> m_xTextDocument;
    sw::mark::Fieldmark& m_rFormField;

public:
    /// @throws cpo::uno::RuntimeException
    SwVbaFormField(const cpo::uno::Reference<ooo::vba::XHelperInterface>& rParent,
                   const cpo::uno::Reference<cpo::uno::XComponentContext>& rContext,
                   const rtl::Reference<SwXTextDocument>& xTextDocument,
                   sw::mark::Fieldmark& rFormField);
    ~SwVbaFormField() override;

    // XFormField Methods
    OUString getDefaultPropertyName() override;

    cpo::uno::Any CheckBox() override;
    cpo::uno::Any DropDown() override;
    cpo::uno::Any TextInput() override;
    cpo::uno::Any Previous() override;
    cpo::uno::Any Next() override;
    cpo::uno::Reference<ooo::vba::word::XRange> Range() override;

    // Indicates which of the three form fields this is: oovbaapi/ooo/vba/word/WdFieldType.idl
    sal_Int32 getType() override;
    // True if references to the specified form field
    // are automatically updated whenever the field is exited
    bool getCalculateOnExit() override;
    void setCalculateOnExit(bool bSet) override;
    bool getEnabled() override;
    void setEnabled(bool bSet) override;
    OUString getEntryMacro() override;
    void setEntryMacro(const OUString& rSet) override;
    OUString getExitMacro() override;
    void setExitMacro(const OUString& rSet) override;
    /*
     * If the OwnHelp property is set to True,
     * HelpText specifies the text string value.
     * If OwnHelp is set to False, HelpText specifies the name of an AutoText entry
     * that contains help text for the form field.
     */
    OUString getHelpText() override;
    void setHelpText(const OUString& rSet) override;
    bool getOwnHelp() override;
    void setOwnHelp(bool bSet) override;

    OUString getName() override;
    void setName(const OUString& rSet) override;
    OUString getResult() override;
    void setResult(const OUString& rSet) override;
    /*
     * If the OwnStatus property is set to True,
     * StatusText specifies the status bar value.
     * If OwnStatus is set to False, StatusText specifies the name of an AutoText entry
     * that contains status bar text for the form field.
     */
    OUString getStatusText() override;
    void setStatusText(const OUString& rSet) override;
    bool getOwnStatus() override;
    void setOwnStatus(bool bSet) override;

    // XHelperInterface
    OUString getServiceImplName() override;
    cpo::uno::Sequence<OUString> getServiceNames() override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
