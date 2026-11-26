/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <sstream>
#include <string>

#include <Poco/Exception.h>
#include <Poco/Net/HTMLForm.h>
#include <Poco/Net/HTTPRequest.h>

#include <common/Log.hpp>
#include <common/Uri.hpp>

// The form that the integrator posts into the editor frame for coolwsd's editor page:
namespace EditorFrameForm {

// The value of the named field of the form at the address. It is empty when the form has none.
inline std::string field(std::string const & formUrl, std::string const & form,
                         std::string const & name) {
    try {
        // The method is spelled out, as the CUPS header of the macOS SDK defines HTTP_POST as a
        // macro:
        Poco::Net::HTTPRequest request("POST", formUrl);
        request.setContentType("application/x-www-form-urlencoded");
        std::istringstream body(form);
        Poco::Net::HTMLForm fields(request, body);
        return fields.get(name, "");
    } catch (Poco::Exception const & e) {
        LOG_WRN("editor frame: cannot read the integrator's form: " << e.displayText());
        return "";
    }
}

// The access token that coolwsd puts into its editor page for the form at the address (read from
// the form and URI-encoded the same way coolwsd does it):
inline std::string accessToken(std::string const & formUrl, std::string const & form) {
    return Uri::encode(field(formUrl, form, "access_token"), "'");
}

}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
