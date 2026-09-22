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

#include <vcl/remoteclipboard.hxx>

#include <algorithm>
#include <optional>
#include <utility>

#include <com/sun/star/datatransfer/UnsupportedFlavorException.hpp>
#include <cppuhelper/implbase.hxx>
#include <cppuhelper/typeprovider.hxx>
#include <rtl/uri.hxx>
#include <sal/log.hxx>

using namespace cpo::uno;

namespace vcl::remoteclipboard
{
namespace
{
/// The value of a wire format length line: lower or upper case hex digits, nothing else.
std::optional<sal_uInt64> parseHexLength(std::string_view rLine)
{
    if (rLine.empty() || rLine.size() > 16)
        return std::nullopt;

    sal_uInt64 nLength = 0;
    for (const char c : rLine)
    {
        int nDigit;
        if (c >= '0' && c <= '9')
            nDigit = c - '0';
        else if (c >= 'a' && c <= 'f')
            nDigit = c - 'a' + 10;
        else if (c >= 'A' && c <= 'F')
            nDigit = c - 'A' + 10;
        else
            return std::nullopt;
        nLength = nLength * 16 + nDigit;
    }
    return nLength;
}

/// Serves the formats of a downloaded clipboard from memory.
class WireTransferable : public cppu::WeakImplHelper<css::datatransfer::XTransferable>
{
    Sequence<css::datatransfer::DataFlavor> m_aFlavors;
    std::vector<Any> m_aContent;

public:
    explicit WireTransferable(std::vector<Item>&& rItems)
    {
        std::vector<css::datatransfer::DataFlavor> aFlavors;
        aFlavors.reserve(rItems.size());
        m_aContent.reserve(rItems.size());
        for (Item& rItem : rItems)
        {
            css::datatransfer::DataFlavor aFlavor;
            initFlavourFromMime(aFlavor, OUString::fromUtf8(rItem.aMimeType));

            // Several wire types can map to one flavour, the plain text variants for
            // example; the first one wins.
            const bool bKnown = std::any_of(aFlavors.begin(), aFlavors.end(),
                                            [&aFlavor](const css::datatransfer::DataFlavor& rOther)
                                            { return rOther.MimeType == aFlavor.MimeType; });
            if (bKnown)
                continue;

            const sal_Int32 nSize = static_cast<sal_Int32>(rItem.aData.size());
            Any aContent;
            if (aFlavor.DataType == cppu::UnoType<OUString>::get())
                aContent <<= OUString(rItem.aData.data(), nSize, RTL_TEXTENCODING_UTF8);
            else
                aContent <<= Sequence<sal_Int8>(
                    reinterpret_cast<const sal_Int8*>(rItem.aData.data()), nSize);
            aFlavors.push_back(std::move(aFlavor));
            m_aContent.push_back(std::move(aContent));
        }
        m_aFlavors = Sequence<css::datatransfer::DataFlavor>(aFlavors.data(), aFlavors.size());
    }

    Any getTransferData(const css::datatransfer::DataFlavor& rFlavor) override
    {
        for (sal_Int32 i = 0; i < m_aFlavors.getLength(); ++i)
        {
            if (m_aFlavors[i].MimeType == rFlavor.MimeType)
                return m_aContent[i];
        }
        throw css::datatransfer::UnsupportedFlavorException(rFlavor.MimeType,
                                                            static_cast<XTransferable*>(this));
    }

    Sequence<css::datatransfer::DataFlavor> getTransferDataFlavors() override { return m_aFlavors; }

    bool isDataFlavorSupported(const css::datatransfer::DataFlavor& rFlavor) override
    {
        return std::any_of(std::cbegin(m_aFlavors), std::cend(m_aFlavors),
                           [&rFlavor](const css::datatransfer::DataFlavor& rOther) {
                               return rOther.MimeType == rFlavor.MimeType
                                      && rOther.DataType == rFlavor.DataType;
                           });
    }
};
}

// cf. sot/source/base/exchange.cxx for the string typed exceptions.
void initFlavourFromMime(css::datatransfer::DataFlavor& rFlavor, OUString aMimeType)
{
    if (aMimeType.startsWith("text/plain"))
    {
        aMimeType = u"text/plain;charset=utf-16"_ustr;
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    }
    else if (aMimeType.startsWith("text/markdown"))
    {
        aMimeType = u"text/markdown"_ustr;
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    }
    else if (aMimeType == "application/x-libreoffice-markdown-annotated")
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    else if (aMimeType == "application/x-libreoffice-tsvc")
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    else
        rFlavor.DataType = cppu::UnoType<Sequence<sal_Int8>>::get();
    rFlavor.MimeType = aMimeType;
    rFlavor.HumanPresentableName = aMimeType;
}

bool isWireFormat(std::string_view rBody)
{
    const size_t nMimeEnd = rBody.find('\n');
    if (nMimeEnd == std::string_view::npos || nMimeEnd == 0)
        return false;

    const size_t nLengthEnd = rBody.find('\n', nMimeEnd + 1);
    if (nLengthEnd == std::string_view::npos)
        return false;

    const std::optional<sal_uInt64> oLength
        = parseHexLength(rBody.substr(nMimeEnd + 1, nLengthEnd - nMimeEnd - 1));
    return oLength && *oLength > 0;
}

// The same tuple layout is read by common/ClipboardData.hpp on the online side. The engine cannot
// link that header, so the format is parsed again here.
bool parseWireFormat(std::string_view rBody, std::vector<Item>& rItems)
{
    size_t nPos = 0;
    while (nPos < rBody.size())
    {
        const size_t nMimeEnd = rBody.find('\n', nPos);
        if (nMimeEnd == std::string_view::npos)
            return false;

        const size_t nLengthEnd = rBody.find('\n', nMimeEnd + 1);
        if (nLengthEnd == std::string_view::npos)
            return false;

        const std::optional<sal_uInt64> oLength
            = parseHexLength(rBody.substr(nMimeEnd + 1, nLengthEnd - nMimeEnd - 1));
        if (!oLength)
            return false;

        const size_t nDataStart = nLengthEnd + 1;
        if (*oLength > rBody.size() - nDataStart)
            return false;

        const std::string_view aMimeType = rBody.substr(nPos, nMimeEnd - nPos);
        if (!aMimeType.empty())
        {
            Item aItem;
            aItem.aMimeType = OString(aMimeType.data(), static_cast<sal_Int32>(aMimeType.size()));
            aItem.aData = std::string(rBody.substr(nDataStart, *oLength));
            rItems.push_back(std::move(aItem));
        }

        // Each tuple closes with a newline after its bytes.
        nPos = nDataStart + *oLength;
        if (nPos < rBody.size() && rBody[nPos] == '\n')
            ++nPos;
    }
    return true;
}

Reference<css::datatransfer::XTransferable> createTransferable(std::vector<Item>&& rItems)
{
    return new WireTransferable(std::move(rItems));
}

OUString getOrigin(std::string_view rHtml)
{
    static constexpr std::string_view aPrefix = "<div id=\"meta-origin\" data-coolorigin=\"";
    const size_t nStart = rHtml.find(aPrefix);
    if (nStart == std::string_view::npos)
        return OUString();

    const size_t nValue = nStart + aPrefix.size();
    const size_t nEnd = rHtml.find('"', nValue);
    if (nEnd == std::string_view::npos)
        return OUString();

    // The shape checks the browser makes on the still-encoded value: the path of a clipboard
    // endpoint with the document, the server, the view and the access tag.
    const std::string_view aEncoded = rHtml.substr(nValue, nEnd - nValue);
    if (aEncoded.find("%2Fclipboard%3FWOPISrc%3D") == std::string_view::npos
        || aEncoded.find("%26ServerId%3D") == std::string_view::npos
        || aEncoded.find("%26ViewId%3D") == std::string_view::npos
        || aEncoded.find("%26Tag%3D") == std::string_view::npos)
        return OUString();

    const OUString aDecoded = rtl::Uri::decode(OUString::fromUtf8(aEncoded),
                                               rtl_UriDecodeWithCharset, RTL_TEXTENCODING_UTF8);
    if (aDecoded.startsWithIgnoreAsciiCase("http://")
        || aDecoded.startsWithIgnoreAsciiCase("https://"))
        return aDecoded;

    return OUString();
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
