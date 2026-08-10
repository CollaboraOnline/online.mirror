/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#ifndef INCLUDED_SW_INC_SECLABELAPPLY_HXX
#define INCLUDED_SW_INC_SECLABELAPPLY_HXX

#include "swdllapi.h"
#include <com/sun/star/uno/Reference.hxx>
#include <rtl/ustring.hxx>
#include <string_view>

namespace com::sun::star::frame
{
class XModel;
}

// Writer-specific placement of a security-label marking (header/footer, body,
// portion). The app-agnostic label storage + colour resolution live in
// <svx/seclabel/SecLabelStore.hxx>.
namespace sw::seclabel
{
/// Set the page style's header and footer to the marking text (bold, coloured,
/// centred), replacing any existing content (v1 pageTopBottom behaviour).
SW_DLLPUBLIC void applyMarking(const css::uno::Reference<css::frame::XModel>& xModel,
                               const OUString& rMarking, sal_Int32 nColor,
                               const OUString& rPageStyleName);

/// Place the marking as a cover (bStart) and/or end-page (bEnd) paragraph in the
/// document body, bookmarked so re-applying replaces rather than duplicates. A
/// placement not requested is cleared, so a re-label leaves no stale body marking.
SW_DLLPUBLIC void applyBodyMarkings(const css::uno::Reference<css::frame::XModel>& xModel,
                                    const OUString& rMarking, sal_Int32 nColor, bool bStart,
                                    bool bEnd);

/// Remove both body (cover/end-page) markings, if present.
SW_DLLPUBLIC void removeBodyMarkings(const css::uno::Reference<css::frame::XModel>& xModel);

/// Prefix the portion (the paragraph holding the view cursor) with the marking in
/// parentheses, formatted. Idempotent: a portion already carrying this prefix is
/// left unchanged. Unlike the document-level placements this acts on one portion,
/// so it is not undone by removeLabel.
SW_DLLPUBLIC void applyPortionMarking(const css::uno::Reference<css::frame::XModel>& xModel,
                                      std::u16string_view rMarking, sal_Int32 nColor);

/// Remove the document's STANAG label: strip its customXml part, clear the body
/// (cover/end-page) markings, and clear the page style's header and footer marking.
SW_DLLPUBLIC void removeLabel(const css::uno::Reference<css::frame::XModel>& xModel,
                              const OUString& rPageStyleName);

} // namespace sw::seclabel

#endif // INCLUDED_SW_INC_SECLABELAPPLY_HXX

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
