/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <sal/types.h>

#include <cpo/uno/Sequence.hxx>
#include <cpo/uno/Reference.hxx>
#include <com/sun/star/security/XCertificate.hpp>

namespace xmlsecurity
{
/// Extension of css::xml::crypto::XXMLSignatureTemplate to transport data to lower-level library
class SAL_NO_VTABLE SAL_DLLPUBLIC_RTTI SAL_LOPLUGIN_ANNOTATE("crosscast")
ISignatureTemplateInternal
{
public:
    virtual cpo::uno::Reference<css::security::XCertificate> GetSigningCertificate() = 0;

    virtual void SetVerifiedCertificate(cpo::uno::Reference<css::security::XCertificate> const& rCertificate) = 0;

protected:
    ~ISignatureTemplateInternal() noexcept = default;
};
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
