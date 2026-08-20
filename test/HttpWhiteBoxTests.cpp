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

#include <config.h>

#include <string>

#include <common/Clipboard.hpp>
#include <net/HttpRequest.hpp>

#include <test/lokassert.hpp>

#include <cppunit/extensions/HelperMacros.h>

/// HTTP WhiteBox unit-tests.
class HttpWhiteBoxTests : public CPPUNIT_NS::TestFixture
{
    CPPUNIT_TEST_SUITE(HttpWhiteBoxTests);

    CPPUNIT_TEST(testStatusLineParserValidComplete);
    CPPUNIT_TEST(testStatusLineParserValidComplete_NoReason);
    CPPUNIT_TEST(testStatusLineParserValidIncomplete);
    CPPUNIT_TEST(testStatusLineSerialize);

    CPPUNIT_TEST(testHeader);
    CPPUNIT_TEST(testHeaderFieldWithControlCharacter);

    CPPUNIT_TEST(testRequestParserValidComplete);
    CPPUNIT_TEST(testRequestParserValidIncomplete);
    CPPUNIT_TEST(testClipboardIsOwnFormat);

    CPPUNIT_TEST_SUITE_END();

    void testStatusLineParserValidComplete();
    void testStatusLineParserValidComplete_NoReason();
    void testStatusLineParserValidIncomplete();
    void testStatusLineSerialize();
    void testHeader();
    void testHeaderFieldWithControlCharacter();
    void testRequestParserValidComplete();
    void testRequestParserValidIncomplete();
    void testClipboardIsOwnFormat();
};

void HttpWhiteBoxTests::testStatusLineParserValidComplete()
{
    constexpr auto testname = __func__;

    const unsigned expVersionMajor = 1;
    const unsigned expVersionMinor = 1;
    const std::string expVersion
        = "HTTP/" + std::to_string(expVersionMajor) + '.' + std::to_string(expVersionMinor);
    const http::StatusCode expStatusCode = http::StatusCode::SwitchingProtocols;
    const std::string expReasonPhrase = "Something Something";

    std::ostringstream oss;
    oss << expVersion << ' ' << static_cast<unsigned>(expStatusCode) << ' ' << expReasonPhrase
        << "\r\n";
    const std::string data = oss.str();

    http::StatusLine statusLine;

    int64_t len = data.size();
    LOK_ASSERT_EQUAL(http::FieldParseState::Valid, statusLine.parse(data.c_str(), len));
    LOK_ASSERT_EQUAL(expVersion, statusLine.httpVersion());
    LOK_ASSERT_EQUAL(expVersionMajor, statusLine.versionMajor());
    LOK_ASSERT_EQUAL(expVersionMinor, statusLine.versionMinor());
    LOK_ASSERT_EQUAL(expStatusCode, statusLine.statusCode());
    LOK_ASSERT_EQUAL(expReasonPhrase, statusLine.reasonPhrase());
}

void HttpWhiteBoxTests::testStatusLineParserValidComplete_NoReason()
{
    constexpr auto testname = __func__;

    const unsigned expVersionMajor = 1;
    const unsigned expVersionMinor = 1;
    const std::string expVersion
        = "HTTP/" + std::to_string(expVersionMajor) + '.' + std::to_string(expVersionMinor);
    const http::StatusCode expStatusCode = http::StatusCode::SwitchingProtocols;
    const std::string expReasonPhrase;

    std::ostringstream oss;
    oss << expVersion << ' ' << static_cast<unsigned>(expStatusCode) << ' ' << expReasonPhrase
        << "\r\n";
    const std::string data = oss.str();

    http::StatusLine statusLine;

    int64_t len = data.size();
    LOK_ASSERT_EQUAL(http::FieldParseState::Valid, statusLine.parse(data.c_str(), len));
    LOK_ASSERT_EQUAL(expVersion, statusLine.httpVersion());
    LOK_ASSERT_EQUAL(expVersionMajor, statusLine.versionMajor());
    LOK_ASSERT_EQUAL(expVersionMinor, statusLine.versionMinor());
    LOK_ASSERT_EQUAL(expStatusCode, statusLine.statusCode());
    LOK_ASSERT_EQUAL(expReasonPhrase, statusLine.reasonPhrase());
}

void HttpWhiteBoxTests::testStatusLineParserValidIncomplete()
{
    constexpr auto testname = __func__;

    const unsigned expVersionMajor = 1;
    const unsigned expVersionMinor = 1;
    const std::string expVersion
        = "HTTP/" + std::to_string(expVersionMajor) + '.' + std::to_string(expVersionMinor);
    const http::StatusCode expStatusCode = http::StatusCode::SwitchingProtocols;
    const std::string expReasonPhrase = "Something Something";

    std::ostringstream oss;
    oss << expVersion << ' ' << static_cast<unsigned>(expStatusCode) << ' ' << expReasonPhrase
        << "\r\n";
    const std::string data = oss.str();

    http::StatusLine statusLine;

    // Pass incomplete data to the reader.
    for (std::size_t i = 0; i < data.size(); ++i)
    {
        // Should return 0 to signify data is incomplete.
        int64_t len = i;
        LOK_ASSERT_EQUAL_MESSAGE("i = " + std::to_string(i), http::FieldParseState::Incomplete,
                                 statusLine.parse(data.c_str(), len));
    }

    int64_t len = data.size();
    LOK_ASSERT_EQUAL(http::FieldParseState::Valid, statusLine.parse(data.c_str(), len));
    LOK_ASSERT_EQUAL(expVersion, statusLine.httpVersion());
    LOK_ASSERT_EQUAL(expVersionMajor, statusLine.versionMajor());
    LOK_ASSERT_EQUAL(expVersionMinor, statusLine.versionMinor());
    LOK_ASSERT_EQUAL(expStatusCode, statusLine.statusCode());
    LOK_ASSERT_EQUAL(expReasonPhrase, statusLine.reasonPhrase());
}

void HttpWhiteBoxTests::testStatusLineSerialize()
{
    constexpr auto testname = __func__;

    http::StatusLine statusLine(200);
    Buffer buf;
    statusLine.writeData(buf);
    const std::string out(buf.getBlock(), buf.getBlockSize());
    LOK_ASSERT_EQUAL(std::string("HTTP/1.1 200 OK\r\n"), out);
}

void HttpWhiteBoxTests::testHeader()
{
    constexpr auto testname = __func__;

    http::Header header;

    const std::string data = "\r\na=\r\n\r\n";
    LOK_ASSERT_EQUAL(8L, header.parse(data.c_str(), data.size()));
}

void HttpWhiteBoxTests::testHeaderFieldWithControlCharacter()
{
    constexpr std::string_view testname = __func__;

    // A value that carries a carriage return and a newline does not become a second header,
    // and the caller is told the field was not set.
    http::Header header;
    LOK_ASSERT(!header.set("X-Sample", "one\r\nRange: bytes=0-1"));
    LOK_ASSERT(!header.has("X-Sample"));
    LOK_ASSERT(!header.has("Range"));
    LOK_ASSERT_EQUAL(0UL, header.size());

    // The same holds for a name, and for a lone newline.
    LOK_ASSERT(!header.add("X-Custom\r\nRange", "bytes=0-1"));
    LOK_ASSERT(!header.add("X-Custom", "value\nRange: bytes=0-1"));
    LOK_ASSERT_EQUAL(0UL, header.size());

    // A refused value takes the earlier one with it, so the field holds what the caller
    // passed or nothing at all.
    LOK_ASSERT(header.set("X-Replaced", "first"));
    LOK_ASSERT_EQUAL_STR("first", header.get("X-Replaced"));
    LOK_ASSERT(!header.set("X-Replaced", "second\r\nRange: bytes=0-1"));
    LOK_ASSERT(!header.has("X-Replaced"));
    LOK_ASSERT_EQUAL(0UL, header.size());

    // The other bytes RFC 9110 section 5.5 keeps out of a field value are refused too: NUL,
    // DEL, and the last control character below the printable range.
    LOK_ASSERT(!header.set("X-Nul", std::string("one\0two", 7)));
    LOK_ASSERT(!header.set("X-Del", "one\x7f" "two"));
    LOK_ASSERT(!header.set("X-UnitSeparator", "one\x1f" "two"));
    LOK_ASSERT_EQUAL(0UL, header.size());

    // The bytes at the edges of the allowed range are kept: HTAB, SP, 0x7e and 0x80.
    LOK_ASSERT(header.set("X-Tabbed", "one\ttwo"));
    LOK_ASSERT(header.set("X-Spaced", "one two"));
    LOK_ASSERT(header.set("X-Tilde", "one~two"));
    LOK_ASSERT(header.set("X-High", "one\x80" "two"));
    LOK_ASSERT(header.set("X-Accented", "caf\xc3\xa9"));
    LOK_ASSERT_EQUAL(5UL, header.size());
    LOK_ASSERT_EQUAL_STR("one\ttwo", header.get("X-Tabbed"));
    LOK_ASSERT_EQUAL_STR("one two", header.get("X-Spaced"));
    LOK_ASSERT_EQUAL_STR("one~two", header.get("X-Tilde"));
    LOK_ASSERT_EQUAL_STR("one\x80" "two", header.get("X-High"));
    LOK_ASSERT_EQUAL_STR("caf\xc3\xa9", header.get("X-Accented"));

    // A received field whose sender put in a byte a field cannot carry is skipped, and the
    // rest of the reply is kept.
    http::Header parsed;
    const std::string reply = "Host: localhost\r\nX-Bad: one\x01" "two\r\nX-Good: two\r\n\r\n";
    LOK_ASSERT(parsed.parse(reply.c_str(), reply.size()) > 0);
    LOK_ASSERT(!parsed.has("X-Bad"));
    LOK_ASSERT_EQUAL_STR("localhost", parsed.get("Host"));
    LOK_ASSERT_EQUAL_STR("two", parsed.get("X-Good"));

    // The request that goes out on the wire carries no injected field.
    http::Request request;
    LOK_ASSERT(!request.set("X-Sample", "one\r\nIf-Modified-Since: Thu, 01 Jan 1970 00:00:00 GMT"));
    Buffer out;
    request.writeData(out, INT_MAX);
    const std::string wire(out.data(), out.size());
    LOK_ASSERT(wire.find("If-Modified-Since") == std::string::npos);
    LOK_ASSERT(wire.find("X-Sample") == std::string::npos);
}

void HttpWhiteBoxTests::testRequestParserValidComplete()
{
    constexpr auto testname = __func__;

    const std::string expVerb = "GET";
    const std::string expUrl = "/path/to/data";
    const std::string expVersion = "HTTP/1.1";
    const std::string data = expVerb + ' ' + expUrl + ' ' + expVersion + "\r\n" + "EmptyKey:\r\n"
                             + "Host: localhost.com\r\n\r\n";

    http::Request req;

    LOK_ASSERT(req.readData(data.c_str(), data.size()) > 0);
    LOK_ASSERT_EQUAL(expVerb, req.getVerb());
    LOK_ASSERT_EQUAL(expUrl, req.getUrl());
    LOK_ASSERT_EQUAL(expVersion, req.getVersion());
    LOK_ASSERT_EQUAL(std::string(), req.get("emptykey"));
    LOK_ASSERT_EQUAL(std::string("localhost.com"), req.get("Host"));
}

void HttpWhiteBoxTests::testRequestParserValidIncomplete()
{
    constexpr auto testname = __func__;

    const std::string expVerb = "GET";
    const std::string expUrl = "/long/path/to/data";
    const std::string expVersion = "HTTP/1.1";
    const std::string expHost = "localhost.com";
    const std::string data
        = expVerb + ' ' + expUrl + ' ' + expVersion + "\r\n" + "Host: " + expHost + "\r\n\r\n";

    http::Request req;

    // Pass incomplete data to the reader.
    for (std::size_t i = 0; i < 33; ++i)
    {
        // Should return 0 to signify that data is incomplete.
        LOK_ASSERT_EQUAL_MESSAGE("i = " << i << " of " << data.size() - 1, 0L,
                                 req.readData(data.c_str(), i));
    }

    // Offset of the end of first line.
    const int64_t off = 33;

    // Parse the first line.
    LOK_ASSERT_EQUAL_MESSAGE("Parsing the first line failed.", off,
                             req.readData(data.c_str(), off));

    // Skip the first line and parse the header.
    for (std::size_t i = off; i < data.size(); ++i)
    {
        // Should return 0 to signify that data is incomplete.
        LOK_ASSERT_EQUAL_MESSAGE("i = " << i << " of " << data.size() - 1, 0L,
                                 req.readData(data.c_str() + off, i - off));
    }

    // Parse the header.
    LOK_ASSERT_EQUAL_MESSAGE("Parsing the header failed.",
                             static_cast<int64_t>(expHost.size() + 10),
                             req.readData(data.c_str() + off, data.size() - off));

    LOK_ASSERT_EQUAL(expVerb, req.getVerb());
    LOK_ASSERT_EQUAL(expUrl, req.getUrl());
    LOK_ASSERT_EQUAL(expVersion, req.getVersion());
    LOK_ASSERT_EQUAL(expHost, req.header().get("Host"));
}

void HttpWhiteBoxTests::testClipboardIsOwnFormat()
{
    constexpr auto testname = __func__;
    {
        std::string body = R"x(application/x-openoffice-embed-source-xml;windows_formatname="Star Embed Source (XML)"
1def
PK)x";
        std::istringstream stream(body);

        LOK_ASSERT_EQUAL(ClipboardData::isOwnFormat(stream), true);
    }
    {
        std::string body = R"(<!DOCTYPE html>
<html>
<head>)";
        std::istringstream stream(body);

        // This is expected to fail: format is mimetype-length-bytes tuples and here the second line
        // is not a hex size.
        LOK_ASSERT_EQUAL(ClipboardData::isOwnFormat(stream), false);
    }
}

CPPUNIT_TEST_SUITE_REGISTRATION(HttpWhiteBoxTests);

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
