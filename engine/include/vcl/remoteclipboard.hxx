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

#include <functional>
#include <string>
#include <string_view>
#include <vector>

class TransferableDataHelper;
namespace weld
{
class Window;
}

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

/// What resolveForPaste did with the data helper.
enum class Outcome
{
    /// The data helper still serves what the system clipboard holds: the clipboard is not a
    /// remote one, its content could not be downloaded, or the user cancelled the download.
    Untouched,
    /// The data helper now serves the full content downloaded from the server.
    Resolved
};

/**
 * Give a paste the full content of a remote clipboard.
 *
 * Reads the HTML the clipboard offers, and when it carries a remote origin, downloads the full
 * content from that server and rebinds rData to it. The download runs on a worker thread while
 * the main loop keeps running; a download that takes longer than a moment shows a modal progress
 * dialog, parented to pParent, whose Cancel button stops the download and lets the paste go
 * ahead with the reduced copy on the system clipboard. The downloaded content is kept while the
 * system clipboard holds the same HTML, so the reads one paste makes and repeated pastes of one
 * copy share a download, while a new copy in the browser, which writes new HTML, downloads
 * again. A failed download holds back pastes of the same HTML for a short while.
 *
 * This is for pastes only. A check whether a paste is possible must not call it, since it reads
 * the clipboard and may go to the network.
 */
VCL_DLLPUBLIC Outcome resolveForPaste(TransferableDataHelper& rData, weld::Window* pParent);

/**
 * Downloads a URL into rBody and returns whether that worked. Tests install one to stand in for
 * the network.
 */
using Fetcher = std::function<bool(const OUString& rUrl, std::string& rBody)>;

/// Use aFetcher instead of the network for the following downloads. An empty one restores the
/// network.
VCL_DLLPUBLIC void setFetcherForTesting(Fetcher aFetcher);

/// Forget the last download, whether in flight, finished or failed.
VCL_DLLPUBLIC void clearCache();
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
