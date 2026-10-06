/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <linguistic/translate.hxx>
#include <sal/log.hxx>
#include <curl/curl.h>
#include <rtl/string.h>
#include <boost/property_tree/ptree.hpp>
#include <boost/property_tree/json_parser.hpp>
#include <systools/curlinit.hxx>
#include <tools/long.hxx>

#include <functional>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>

namespace linguistic
{
namespace
{
/// Percent-encodes rValue for use as a form field value.
OString escape(CURL* pCurl, const OString& rValue)
{
    std::unique_ptr<char, std::function<void(char*)>> pEscaped(
        curl_easy_escape(pCurl, rValue.getStr(), rValue.getLength()),
        [](char* p) { curl_free(p); });
    return pEscaped ? OString(pEscaped.get()) : OString();
}

/// Picks the "message" out of a DeepL error response, if there is one.
OString getErrorMessage(const std::string& rResponseBody)
{
    try
    {
        boost::property_tree::ptree aRoot;
        std::stringstream aStream(rResponseBody);
        boost::property_tree::read_json(aStream, aRoot);
        return OString(aRoot.get<std::string>("message", std::string()));
    }
    catch (const boost::property_tree::ptree_error&)
    {
        return {};
    }
}
}

TranslateResult Translate(const OString& rTargetLang, const OString& rAPIUrl,
                          std::string_view rAuthKey, const OString& rData)
{
    constexpr tools::Long CURL_TIMEOUT = 10L;

    std::unique_ptr<CURL, std::function<void(CURL*)>> curl(curl_easy_init(),
                                                           [](CURL* p) { curl_easy_cleanup(p); });
    if (!curl)
    {
        SAL_WARN("linguistic", "Translate: CURL initialization failed");
        return { {}, "CURL initialization failed"_ostr };
    }

    ::InitCurl_easy(curl.get());

    (void)curl_easy_setopt(curl.get(), CURLOPT_URL, rAPIUrl.getStr());
    (void)curl_easy_setopt(curl.get(), CURLOPT_TIMEOUT, CURL_TIMEOUT);

    // DeepL only accepts the key in the Authorization header; the former
    // auth_key form field is rejected with 403 since January 2026.
    const OString aAuthHeader(OString::Concat("Authorization: DeepL-Auth-Key ") + rAuthKey);
    std::unique_ptr<curl_slist, std::function<void(curl_slist*)>> pHeaders(
        curl_slist_append(nullptr, aAuthHeader.getStr()),
        [](curl_slist* p) { curl_slist_free_all(p); });
    (void)curl_easy_setopt(curl.get(), CURLOPT_HTTPHEADER, pHeaders.get());

    std::string response_body;
    (void)curl_easy_setopt(curl.get(), CURLOPT_WRITEFUNCTION,
                           +[](void* buffer, size_t size, size_t nmemb, void* userp) -> size_t {
                               if (!userp)
                                   return 0;
                               std::string* response = static_cast<std::string*>(userp);
                               size_t real_size = size * nmemb;
                               response->append(static_cast<char*>(buffer), real_size);
                               return real_size;
                           });
    (void)curl_easy_setopt(curl.get(), CURLOPT_WRITEDATA, static_cast<void*>(&response_body));

    // rData is HTML: tag_handling keeps the markup intact across the translation.
    const OString aPostData("target_lang=" + escape(curl.get(), rTargetLang)
                            + "&tag_handling=html&text=" + escape(curl.get(), rData));
    (void)curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDS, aPostData.getStr());

    CURLcode cc = curl_easy_perform(curl.get());
    if (cc != CURLE_OK)
    {
        SAL_WARN("linguistic", "Translate: CURL perform returned with error: "
                                   << static_cast<sal_Int32>(cc) << " " << curl_easy_strerror(cc));
        return { {}, OString(curl_easy_strerror(cc)) };
    }
    tools::Long nStatusCode = 0;
    curl_easy_getinfo(curl.get(), CURLINFO_RESPONSE_CODE, &nStatusCode);
    if (nStatusCode != 200)
    {
        // The error body says why, e.g. "Authorization failure, check auth_key".
        OString aError("HTTP " + OString::number(nStatusCode));
        const OString aMessage = getErrorMessage(response_body);
        if (!aMessage.isEmpty())
            aError += ": " + aMessage;
        SAL_WARN("linguistic", "Translate: request to " << rAPIUrl << " failed: " << aError);
        return { {}, aError };
    }

    // parse the response
    try
    {
        boost::property_tree::ptree root;
        std::stringstream aStream(response_body);
        boost::property_tree::read_json(aStream, root);
        const boost::property_tree::ptree& translations = root.get_child("translations");
        if (translations.empty())
        {
            SAL_WARN("linguistic", "Translate: API did not return any translations");
            return { {}, "The service did not return any translations"_ostr };
        }
        // take the first one
        const boost::property_tree::ptree& translation = translations.begin()->second;
        return { OString(translation.get<std::string>("text")), {} };
    }
    catch (const boost::property_tree::ptree_error& rException)
    {
        SAL_WARN("linguistic", "Translate: unexpected response: " << rException.what());
        return { {}, "Unexpected response from the service"_ostr };
    }
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
