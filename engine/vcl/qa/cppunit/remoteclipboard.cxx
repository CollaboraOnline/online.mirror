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

#include <sal/config.h>

#include <regex>
#include <string>
#include <string_view>

#include <cppunit/TestAssert.h>
#include <cppunit/TestFixture.h>
#include <cppunit/extensions/HelperMacros.h>
#include <cppunit/plugin/TestPlugIn.h>
#include <test/bootstrapfixture.hxx>

#include <com/sun/star/datatransfer/DataFlavor.hpp>
#include <com/sun/star/datatransfer/XTransferable.hpp>
#include <cppu/unotype.hxx>
#include <sot/formats.hxx>
#include <vcl/remoteclipboard.hxx>
#include <vcl/transfer.hxx>

using namespace cpo::uno;
using namespace vcl::remoteclipboard;

namespace
{
// The HTML a browser session of Collabora Online puts on the system clipboard: the copied
// content wrapped in the marker div, whose value is the percent-encoded clipboard endpoint.
constexpr std::string_view aBrowserHtml
    = "<!DOCTYPE HTML><html><body lang=\"en-US\"><div id=\"meta-origin\" data-coolorigin=\""
      "https%3A%2F%2Fcool.example.com%2Fcool%2Fclipboard%3FWOPISrc%3D"
      "https%253A%252F%252Fwopi.example.com%252Ffiles%252F42"
      "%26ServerId%3D0123abcd%26ViewId%3D7%26Tag%3D00112233445566778899aabbccddeeff\">\n"
      "<p>Hello</p></div></body></html>";

constexpr OUString aBrowserOrigin
    = u"https://cool.example.com/cool/clipboard?WOPISrc=https%3A%2F%2Fwopi.example.com%2Ffiles%2F42"
      "&ServerId=0123abcd&ViewId=7&Tag=00112233445566778899aabbccddeeff"_ustr;

constexpr std::string_view aDescriptorMime
    = "application/x-openoffice-objectdescriptor-xml;classname=\"47BBB4CB-CE4C-4E80-A591-"
      "42D9AE74950F\";typename=\"Spreadsheet\";viewaspect=\"1\";width=\"1000\";height=\"500\"";

class RemoteClipboardTest : public test::BootstrapFixture
{
public:
    RemoteClipboardTest()
        : BootstrapFixture(true, false)
    {
    }

    void tearDown() override
    {
        setFetcherForTesting({});
        clearCache();
        BootstrapFixture::tearDown();
    }

    void testOriginOfBrowserCopy();
    void testOriginOfInProcessCopy();
    void testOriginNeedsTheWholeShape();
    void testWireFormatIsRecognised();
    void testWireFormatParse();
    void testWireFormatTruncated();
    void testTransferableKeepsDescriptorMime();
    void testTransferableServesPlainTextAsString();
    void testPasteGetsTheDownloadedContent();
    void testPasteDoesNotRetryAFailedDownloadAtOnce();
    void testPasteLeavesOtherClipboardsAlone();
    void testNewCopyUnderTheSameUrlIsDownloadedAgain();
    void testLargeSelectionStubIsDownloadedEveryTime();

    CPPUNIT_TEST_SUITE(RemoteClipboardTest);
    CPPUNIT_TEST(testOriginOfBrowserCopy);
    CPPUNIT_TEST(testOriginOfInProcessCopy);
    CPPUNIT_TEST(testOriginNeedsTheWholeShape);
    CPPUNIT_TEST(testWireFormatIsRecognised);
    CPPUNIT_TEST(testWireFormatParse);
    CPPUNIT_TEST(testWireFormatTruncated);
    CPPUNIT_TEST(testTransferableKeepsDescriptorMime);
    CPPUNIT_TEST(testTransferableServesPlainTextAsString);
    CPPUNIT_TEST(testPasteGetsTheDownloadedContent);
    CPPUNIT_TEST(testPasteDoesNotRetryAFailedDownloadAtOnce);
    CPPUNIT_TEST(testPasteLeavesOtherClipboardsAlone);
    CPPUNIT_TEST(testNewCopyUnderTheSameUrlIsDownloadedAgain);
    CPPUNIT_TEST(testLargeSelectionStubIsDownloadedEveryTime);
    CPPUNIT_TEST_SUITE_END();

private:
    /// What a browser session leaves on the system clipboard: the marked HTML and plain text.
    static Reference<css::datatransfer::XTransferable>
    createBrowserClipboard(std::string_view rHtml)
    {
        std::vector<Item> aItems;
        aItems.push_back({ "text/html"_ostr, std::string(rHtml) });
        aItems.push_back({ "text/plain;charset=utf-8"_ostr, "Hello" });
        return createTransferable(std::move(aItems));
    }

    /// A fetcher that answers every URL with the same full clipboard and counts the calls.
    static Fetcher createRichFetcher(int& rCalls, OUString& rLastUrl)
    {
        return [&rCalls, &rLastUrl](const OUString& rUrl, std::string& rBody) {
            ++rCalls;
            rLastUrl = rUrl;
            rBody = "text/plain;charset=utf-8\n4\nrich\n"
                    "application/x-openoffice-embed-source-xml;windows_formatname=\"Star Embed "
                    "Source (XML)\"\n3\nxml\n";
            return true;
        };
    }
};

void RemoteClipboardTest::testOriginOfBrowserCopy()
{
    // The value is decoded once; the WOPISrc inside it keeps its own encoding.
    CPPUNIT_ASSERT_EQUAL(aBrowserOrigin, getOrigin(aBrowserHtml));
}

void RemoteClipboardTest::testOriginOfInProcessCopy()
{
    // An in-process app writes a synthetic base instead of a server address, so its own copies
    // are not a remote clipboard.
    static constexpr std::string_view aHtml
        = "<html><body><div id=\"meta-origin\" data-coolorigin=\""
          "collabora-online-mobile%2Fcool%2Fclipboard%3FWOPISrc%3Dfile%253A%252F%252F%252Ftmp"
          "%252Fa.odt%26ServerId%3D0123abcd%26ViewId%3D0%26Tag%3D00112233445566778899aabbccddeeff"
          "\">x</div></body></html>";
    CPPUNIT_ASSERT_EQUAL(OUString(), getOrigin(aHtml));
}

void RemoteClipboardTest::testOriginNeedsTheWholeShape()
{
    CPPUNIT_ASSERT_EQUAL(OUString(), getOrigin("<html><body><p>Hello</p></body></html>"));

    // The tag is the access key of the endpoint; a marker without it is not one of ours.
    static constexpr std::string_view aWithoutTag
        = "<div id=\"meta-origin\" data-coolorigin=\"https%3A%2F%2Fcool.example.com%2Fcool"
          "%2Fclipboard%3FWOPISrc%3Dx%26ServerId%3D0123abcd%26ViewId%3D7\">";
    CPPUNIT_ASSERT_EQUAL(OUString(), getOrigin(aWithoutTag));

    static constexpr std::string_view aUnterminated
        = "<div id=\"meta-origin\" data-coolorigin=\"https%3A%2F%2Fcool.example.com";
    CPPUNIT_ASSERT_EQUAL(OUString(), getOrigin(aUnterminated));
}

void RemoteClipboardTest::testWireFormatIsRecognised()
{
    CPPUNIT_ASSERT(isWireFormat("text/html\n5\nhello\n"));
    CPPUNIT_ASSERT(isWireFormat("text/html\n1F\n"));
    CPPUNIT_ASSERT(!isWireFormat(""));
    CPPUNIT_ASSERT(!isWireFormat("<!DOCTYPE html>\n<html><body>a</body></html>"));
    // A zero length in the first tuple is what an empty error reply looks like.
    CPPUNIT_ASSERT(!isWireFormat("text/html\n0\n"));
}

void RemoteClipboardTest::testWireFormatParse()
{
    // The bytes of a tuple may contain newlines; only the declared length delimits them.
    const std::string aBody = "text/plain;charset=utf-8\n5\nhello\n" + std::string(aDescriptorMime)
                              + "\n3\na\nb\n";

    std::vector<Item> aItems;
    CPPUNIT_ASSERT(parseWireFormat(aBody, aItems));
    CPPUNIT_ASSERT_EQUAL(size_t(2), aItems.size());
    CPPUNIT_ASSERT_EQUAL("text/plain;charset=utf-8"_ostr, aItems[0].aMimeType);
    CPPUNIT_ASSERT_EQUAL(std::string("hello"), aItems[0].aData);
    CPPUNIT_ASSERT_EQUAL(OString(aDescriptorMime.data(), aDescriptorMime.size()),
                         aItems[1].aMimeType);
    CPPUNIT_ASSERT_EQUAL(std::string("a\nb"), aItems[1].aData);
}

void RemoteClipboardTest::testWireFormatTruncated()
{
    // A length that runs past the end of the body is a malformed body.
    std::vector<Item> aItems;
    CPPUNIT_ASSERT(!parseWireFormat("text/html\nff\nshort\n", aItems));
    CPPUNIT_ASSERT(aItems.empty());

    // A length line that is not hex is malformed too.
    CPPUNIT_ASSERT(!parseWireFormat("text/html\nfive\nhello\n", aItems));

    // The newline after the last tuple's bytes is optional.
    CPPUNIT_ASSERT(parseWireFormat("text/html\n5\nhello", aItems));
    CPPUNIT_ASSERT_EQUAL(size_t(1), aItems.size());
    CPPUNIT_ASSERT_EQUAL(std::string("hello"), aItems[0].aData);
}

void RemoteClipboardTest::testTransferableKeepsDescriptorMime()
{
    std::vector<Item> aItems;
    aItems.push_back({ OString(aDescriptorMime.data(), aDescriptorMime.size()), "<xml/>" });
    aItems.push_back({ "text/html"_ostr, "<p>x</p>" });

    Reference<css::datatransfer::XTransferable> xTransferable
        = createTransferable(std::move(aItems));
    const Sequence<css::datatransfer::DataFlavor> aFlavors
        = xTransferable->getTransferDataFlavors();
    CPPUNIT_ASSERT_EQUAL(sal_Int32(2), aFlavors.getLength());

    // The class name and the other parameters of the descriptor are read from the flavour, so
    // the MIME string has to survive as it came.
    CPPUNIT_ASSERT_EQUAL(OUString::fromUtf8(aDescriptorMime), aFlavors[0].MimeType);
    CPPUNIT_ASSERT_EQUAL(cppu::UnoType<Sequence<sal_Int8>>::get(), aFlavors[0].DataType);
    CPPUNIT_ASSERT(xTransferable->isDataFlavorSupported(aFlavors[0]));

    Sequence<sal_Int8> aBytes;
    CPPUNIT_ASSERT(xTransferable->getTransferData(aFlavors[0]) >>= aBytes);
    CPPUNIT_ASSERT_EQUAL(sal_Int32(6), aBytes.getLength());
    CPPUNIT_ASSERT_EQUAL('<', static_cast<char>(aBytes[0]));
}

void RemoteClipboardTest::testTransferableServesPlainTextAsString()
{
    std::vector<Item> aItems;
    aItems.push_back({ "text/plain;charset=utf-8"_ostr, "h\xC3\xA9llo" });
    // A second plain text variant maps to the same flavour and is dropped.
    aItems.push_back({ "text/plain"_ostr, "other" });

    Reference<css::datatransfer::XTransferable> xTransferable
        = createTransferable(std::move(aItems));
    const Sequence<css::datatransfer::DataFlavor> aFlavors
        = xTransferable->getTransferDataFlavors();
    CPPUNIT_ASSERT_EQUAL(sal_Int32(1), aFlavors.getLength());
    CPPUNIT_ASSERT_EQUAL(u"text/plain;charset=utf-16"_ustr, aFlavors[0].MimeType);
    CPPUNIT_ASSERT_EQUAL(cppu::UnoType<OUString>::get(), aFlavors[0].DataType);

    OUString aText;
    CPPUNIT_ASSERT(xTransferable->getTransferData(aFlavors[0]) >>= aText);
    CPPUNIT_ASSERT_EQUAL(u"h\u00E9llo"_ustr, aText);
}

void RemoteClipboardTest::testPasteGetsTheDownloadedContent()
{
    int nCalls = 0;
    OUString aLastUrl;
    setFetcherForTesting(createRichFetcher(nCalls, aLastUrl));

    TransferableDataHelper aData(createBrowserClipboard(aBrowserHtml));
    CPPUNIT_ASSERT(!aData.HasFormat(SotClipboardFormatId::EMBED_SOURCE));

    // The paste reads the marker and downloads the full clipboard from that URL.
    CPPUNIT_ASSERT_EQUAL(Outcome::Resolved, resolveForPaste(aData, nullptr));
    CPPUNIT_ASSERT_EQUAL(1, nCalls);
    CPPUNIT_ASSERT_EQUAL(aBrowserOrigin, aLastUrl);
    CPPUNIT_ASSERT(aData.HasFormat(SotClipboardFormatId::EMBED_SOURCE));
    OUString aText;
    CPPUNIT_ASSERT(aData.GetString(SotClipboardFormatId::STRING, aText));
    CPPUNIT_ASSERT_EQUAL(u"rich"_ustr, aText);

    // A second paste of the same clipboard, and the reads one paste makes, are served from what
    // was downloaded.
    TransferableDataHelper aAgain(createBrowserClipboard(aBrowserHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Resolved, resolveForPaste(aAgain, nullptr));
    CPPUNIT_ASSERT_EQUAL(1, nCalls);
    CPPUNIT_ASSERT(aAgain.HasFormat(SotClipboardFormatId::EMBED_SOURCE));
}

void RemoteClipboardTest::testPasteDoesNotRetryAFailedDownloadAtOnce()
{
    int nCalls = 0;
    setFetcherForTesting([&nCalls](const OUString&, std::string&) {
        ++nCalls;
        return false;
    });

    // The paste goes ahead with what the system clipboard has.
    TransferableDataHelper aData(createBrowserClipboard(aBrowserHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Untouched, resolveForPaste(aData, nullptr));
    CPPUNIT_ASSERT_EQUAL(1, nCalls);
    CPPUNIT_ASSERT(aData.HasFormat(SotClipboardFormatId::HTML));
    CPPUNIT_ASSERT(!aData.HasFormat(SotClipboardFormatId::EMBED_SOURCE));

    // A paste right after the failure does not try the server again.
    TransferableDataHelper aAgain(createBrowserClipboard(aBrowserHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Untouched, resolveForPaste(aAgain, nullptr));
    CPPUNIT_ASSERT_EQUAL(1, nCalls);
}

void RemoteClipboardTest::testPasteLeavesOtherClipboardsAlone()
{
    int nCalls = 0;
    OUString aLastUrl;
    setFetcherForTesting(createRichFetcher(nCalls, aLastUrl));

    // HTML from anywhere else has no marker, so nothing is downloaded.
    TransferableDataHelper aData(createBrowserClipboard("<html><body><p>Hello</p></body></html>"));
    CPPUNIT_ASSERT_EQUAL(Outcome::Untouched, resolveForPaste(aData, nullptr));
    CPPUNIT_ASSERT_EQUAL(0, nCalls);

    TransferableDataHelper aEmpty;
    CPPUNIT_ASSERT_EQUAL(Outcome::Untouched, resolveForPaste(aEmpty, nullptr));
    CPPUNIT_ASSERT_EQUAL(0, nCalls);
}

void RemoteClipboardTest::testNewCopyUnderTheSameUrlIsDownloadedAgain()
{
    // The browser session keeps one clipboard URL for minutes, so a second copy made there
    // carries the same marker while the server already holds the new content. The HTML around
    // the marker is the copy's own, though.
    int nCalls = 0;
    setFetcherForTesting([&nCalls](const OUString&, std::string& rBody) {
        ++nCalls;
        rBody = nCalls == 1 ? "text/plain;charset=utf-8\n5\nfirst\n"
                            : "text/plain;charset=utf-8\n6\nsecond\n";
        return true;
    });

    TransferableDataHelper aFirst(createBrowserClipboard(aBrowserHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Resolved, resolveForPaste(aFirst, nullptr));
    OUString aText;
    CPPUNIT_ASSERT(aFirst.GetString(SotClipboardFormatId::STRING, aText));
    CPPUNIT_ASSERT_EQUAL(u"first"_ustr, aText);

    // The paste after the second copy gets the second copy, not the first download.
    const std::string aSecondHtml = std::regex_replace(std::string(aBrowserHtml),
                                                       std::regex("<p>Hello</p>"), "<p>Other</p>");
    CPPUNIT_ASSERT(aSecondHtml != aBrowserHtml);
    TransferableDataHelper aSecond(createBrowserClipboard(aSecondHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Resolved, resolveForPaste(aSecond, nullptr));
    CPPUNIT_ASSERT(aSecond.GetString(SotClipboardFormatId::STRING, aText));
    CPPUNIT_ASSERT_EQUAL(u"second"_ustr, aText);
    CPPUNIT_ASSERT_EQUAL(2, nCalls);
}

void RemoteClipboardTest::testLargeSelectionStubIsDownloadedEveryTime()
{
    // For a selection too large to put on the clipboard the browser writes a fixed stub around
    // the marker, so two different copies are indistinguishable and each paste downloads.
    int nCalls = 0;
    OUString aLastUrl;
    setFetcherForTesting(createRichFetcher(nCalls, aLastUrl));
    const std::string aStubHtml = std::regex_replace(
        std::string(aBrowserHtml), std::regex("<body"),
        "<head><title>Stub HTML Message</title></head><body");

    TransferableDataHelper aFirst(createBrowserClipboard(aStubHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Resolved, resolveForPaste(aFirst, nullptr));
    TransferableDataHelper aSecond(createBrowserClipboard(aStubHtml));
    CPPUNIT_ASSERT_EQUAL(Outcome::Resolved, resolveForPaste(aSecond, nullptr));
    CPPUNIT_ASSERT_EQUAL(2, nCalls);
}

CPPUNIT_TEST_SUITE_REGISTRATION(RemoteClipboardTest);
}

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
