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

#include <string_view>

#include <cppunit/TestAssert.h>
#include <cppunit/TestFixture.h>
#include <cppunit/extensions/HelperMacros.h>
#include <cppunit/plugin/TestPlugIn.h>
#include <test/bootstrapfixture.hxx>

#include <com/sun/star/datatransfer/DataFlavor.hpp>
#include <com/sun/star/datatransfer/XTransferable.hpp>
#include <cppu/unotype.hxx>
#include <vcl/remoteclipboard.hxx>

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

    void testOriginOfBrowserCopy();
    void testOriginOfInProcessCopy();
    void testOriginNeedsTheWholeShape();
    void testWireFormatIsRecognised();
    void testWireFormatParse();
    void testWireFormatTruncated();
    void testTransferableKeepsDescriptorMime();
    void testTransferableServesPlainTextAsString();

    CPPUNIT_TEST_SUITE(RemoteClipboardTest);
    CPPUNIT_TEST(testOriginOfBrowserCopy);
    CPPUNIT_TEST(testOriginOfInProcessCopy);
    CPPUNIT_TEST(testOriginNeedsTheWholeShape);
    CPPUNIT_TEST(testWireFormatIsRecognised);
    CPPUNIT_TEST(testWireFormatParse);
    CPPUNIT_TEST(testWireFormatTruncated);
    CPPUNIT_TEST(testTransferableKeepsDescriptorMime);
    CPPUNIT_TEST(testTransferableServesPlainTextAsString);
    CPPUNIT_TEST_SUITE_END();
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

CPPUNIT_TEST_SUITE_REGISTRATION(RemoteClipboardTest);
}

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
