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

#include <wsd/RequestDetails.hpp>
#include <wsd/ServerURL.hpp>

#include <test/lokassert.hpp>
#include <test/testlog.hpp>

#include <cppunit/TestAssert.h>
#include <cppunit/extensions/HelperMacros.h>

#include <string>

#include <Poco/Net/HTTPRequest.h>

/// Unit tests for ClientRequestDispatcher.
class ClientRequestDispatcherTests : public CPPUNIT_NS::TestFixture
{
    CPPUNIT_TEST_SUITE(ClientRequestDispatcherTests);

    CPPUNIT_TEST(testServerURL_ProxyPrefixNegativePort);
    CPPUNIT_TEST(testServerURL_ProxyPrefixValidPort);

    CPPUNIT_TEST_SUITE_END();

    // Verify that a ProxyPrefix containing port -1 (produced by some reverse
    // proxies when the Host header omits the port for a default HTTPS
    // connection) does not appear in the URLs served to the browser.
    void testServerURL_ProxyPrefixNegativePort()
    {
        constexpr std::string_view testname = __func__;
        const std::string saved = COOLWSD::ServerName;
        COOLWSD::ServerName.clear();

        Poco::Net::HTTPRequest request(Poco::Net::HTTPRequest::HTTP_GET,
                                       "/cool/ws?WOPISrc=http%3A%2F%2Fexample.com%2Fdoc",
                                       Poco::Net::HTTPMessage::HTTP_1_1);
        request.setHost("example.com");
        request.set("ProxyPrefix", "https://example.com:-1/wf");
        const RequestDetails details(request, "");
        const ServerURL url(details);

        LOK_ASSERT(url.getWebSocketUrl().find(":-1") == std::string::npos);
        LOK_ASSERT(url.getWebServerUrl().find(":-1") == std::string::npos);
        LOK_ASSERT_EQUAL(std::string("https://example.com"), url.getWebSocketUrl());
        LOK_ASSERT_EQUAL(std::string("https://example.com"), url.getWebServerUrl());

        COOLWSD::ServerName = saved;
    }

    // Verify that a ProxyPrefix with a valid explicit port is preserved.
    void testServerURL_ProxyPrefixValidPort()
    {
        constexpr std::string_view testname = __func__;
        const std::string saved = COOLWSD::ServerName;
        COOLWSD::ServerName.clear();

        Poco::Net::HTTPRequest request(Poco::Net::HTTPRequest::HTTP_GET,
                                       "/cool/ws?WOPISrc=http%3A%2F%2Fexample.com%2Fdoc",
                                       Poco::Net::HTTPMessage::HTTP_1_1);
        request.setHost("example.com:8443");
        request.set("ProxyPrefix", "https://example.com:8443/wf");
        const RequestDetails details(request, "");
        const ServerURL url(details);

        LOK_ASSERT_EQUAL(std::string("https://example.com:8443"), url.getWebSocketUrl());
        LOK_ASSERT_EQUAL(std::string("https://example.com:8443"), url.getWebServerUrl());

        COOLWSD::ServerName = saved;
    }
};

CPPUNIT_TEST_SUITE_REGISTRATION(ClientRequestDispatcherTests);

/* vim:set shiftwidth=4 expandtab: */
