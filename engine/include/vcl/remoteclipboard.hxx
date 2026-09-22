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

#include <vcl/dllapi.h>

#include <com/sun/star/datatransfer/DataFlavor.hpp>
#include <com/sun/star/datatransfer/XTransferable.hpp>
#include <rtl/string.hxx>
#include <rtl/ustring.hxx>

#include <string>
#include <string_view>
#include <vector>

/**
 * A clipboard whose full content lives on a Collabora Online server.
 *
 * When content is copied in a browser session of Collabora Online, the system clipboard only
 * receives HTML and plain text. The HTML carries a marker with the URL of the server's clipboard
 * endpoint, and a GET of that URL returns every format the engine offered for the copy, packed in
 * the clipboard wire format: "<mime type>\n<hex length>\n<bytes>\n" repeated. This module
 * recognises such a clipboard, downloads its full content and offers it as a transferable, so a
 * paste picks the rich format over the HTML.
 */
namespace vcl::remoteclipboard
{
/// One format of a clipboard in the wire format: the MIME type line and the raw bytes.
struct Item
{
    OString aMimeType;
    std::string aData;
};

/**
 * Fill a DataFlavor from a wire MIME type. Plain text and the markdown flavours carry a string,
 * everything else a byte sequence. The MIME string stays as it is, including parameters such as
 * an object descriptor's class name, because consumers read those from the flavour.
 */
VCL_DLLPUBLIC void initFlavourFromMime(css::datatransfer::DataFlavor& rFlavor, OUString aMimeType);

/**
 * True when rBody starts like the wire format: a MIME type line followed by a non-zero hex
 * length line.
 */
VCL_DLLPUBLIC bool isWireFormat(std::string_view rBody);

/**
 * Parse a wire format body into rItems. Returns false on a truncated or malformed body; rItems
 * then holds the tuples read before the problem.
 */
VCL_DLLPUBLIC bool parseWireFormat(std::string_view rBody, std::vector<Item>& rItems);

/// An in-memory transferable that serves the given items.
VCL_DLLPUBLIC cpo::uno::Reference<css::datatransfer::XTransferable>
createTransferable(std::vector<Item>&& rItems);

/**
 * The clipboard endpoint URL of the Collabora Online server the HTML was copied from, or an
 * empty string. The marker is the div the browser and the server wrap copied content in:
 *   <div id="meta-origin" data-coolorigin="<URL-encoded clipboard endpoint>">
 * Only an absolute http(s) URL of the expected shape counts; the in-process apps use a synthetic
 * base for their own copies, and that stays where it is.
 */
VCL_DLLPUBLIC OUString getOrigin(std::string_view rHtml);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
