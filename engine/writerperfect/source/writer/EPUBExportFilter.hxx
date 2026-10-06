/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <vector>

#include <cppuhelper/implbase.hxx>

#include <com/sun/star/document/XFilter.hpp>
#include <com/sun/star/document/XExporter.hpp>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <com/sun/star/task/XStatusIndicator.hpp>

namespace cpo::uno { class XComponentContext; }

namespace writerperfect
{
namespace exp
{
struct FixedLayoutPage;
}

/// EPUB export XFilter implementation.
class EPUBExportFilter
    : public cppu::WeakImplHelper<css::document::XFilter, css::document::XExporter,
                                  css::lang::XServiceInfo>
{
    cpo::uno::Reference<cpo::uno::XComponentContext> mxContext;
    cpo::uno::Reference<css::lang::XComponent> mxSourceDocument;
    cpo::uno::Reference<css::task::XStatusIndicator> mxStatusIndicator;

public:
    EPUBExportFilter(cpo::uno::Reference<cpo::uno::XComponentContext> xContext);

    // XFilter
    bool filter(const cpo::uno::Sequence<css::beans::PropertyValue>& rDescriptor) override;
    void cancel() override;

    // XExporter
    void
    setSourceDocument(const cpo::uno::Reference<css::lang::XComponent>& xDocument) override;

    // XServiceInfo
    OUString getImplementationName() override;
    bool supportsService(const OUString& rServiceName) override;
    cpo::uno::Sequence<OUString> getSupportedServiceNames() override;

    /// Gives the default EPUB version.
    static sal_Int32 GetDefaultVersion();
    /// Gives the default split method.
    static sal_Int32 GetDefaultSplitMethod();
    /// Gives the default layout method.
    static sal_Int32 GetDefaultLayoutMethod();

private:
    /// Create page metafiles in case of fixed layout.
    void CreateMetafiles(std::vector<exp::FixedLayoutPage>& rPageMetafiles);
};

} // namespace writerperfect

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
