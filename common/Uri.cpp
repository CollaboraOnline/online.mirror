/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * URI encoding and decoding utilities.
 * Classes: Uri - Functions: encode(), decode(), needsEncoding()
 */

#include <config.h>

#include "Uri.hpp"

#include <common/JsonUtil.hpp>
#include <common/Log.hpp>
#include <common/Util.hpp>

#include <Poco/Exception.h>
#include <Poco/JSON/Array.h>
#include <Poco/URI.h>



const std::string Uri::Reserved = ",/?:@&=+$#";

std::string Uri::encode(const std::string& uri, const std::string& reserved)
{
    std::string encoded;
    Poco::URI::encode(uri, reserved, encoded);
    return encoded;
}

std::string Uri::decode(const std::string& uri)
{
    std::string decoded;
    Poco::URI::decode(uri, decoded);
    return decoded;
}

std::string Uri::encodePercentHashQuestionmark(const std::string_view path)
{
    std::string result;
    result.reserve(path.size());
    for (const char c : path)
    {
        if (c == '%')
            result += "%25";
        else if (Util::isMobileApp())
        {
            // FIXME: Having this conditional on Uti::isMobileApp() is idiotic, yes, but needed to
            // make CODA able to open documents with # or ? in their name. Doing this also for COOL
            // breaks COOL unit tests. Go figure. No idea whether it should actually be done on iOS
            // and Android.
            if (c == '#')
                result += "%23";
            else if (c == '?')
                result += "%3F";
            else
                result += c;
        }
        else
            result += c;
    }
    return result;
}

bool Uri::needsEncoding(const std::string& uri, const std::string& reserved)
{
    const std::string decoded = decode(uri);
    if (decoded != uri)
    {
        // We could decode it; must have been encoded already.
        return false;
    }

    // Identical when decoded, might need encoding.
    const std::string encoded = encode(uri, reserved);

    // If identical, then doesn't need encoding.
    return encoded != uri;
}

std::string Uri::getFilenameFromURL(const std::string& url)
{
    auto [base, filename, ext, params] = Util::splitUrl(url);
    return filename;
}

std::string Uri::getFilenameWithExtFromURL(const std::string& url)
{
    auto [base, filename, ext, params] = Util::splitUrl(url);
    // The url carries the name percent-encoded. The file name is the decoded
    // form, so a name with spaces comes back with real spaces rather than %20.
    if (ext.empty())
        return decode(filename);
    return decode(filename + ext);
}

bool Uri::hasReadonlyPermission(const std::string& url)
{
    //FIXME: Replace with our own implementation.
    for (const auto& param : Poco::URI(url).getQueryParameters())
    {
        if (!param.first.empty())
        {
            LOG_TRC("Query param: [" << param.first << "], value: [" << param.second << ']');
            if (param.first == "permission" && param.second == "readonly")
            {
                return true;
            }
        }
    }

    return false;
}

std::string Uri::siteHost(const std::string& url)
{
    const std::string host = Util::toLower(Poco::URI(url).getHost());
    return host.starts_with("www.") ? host.substr(4) : host;
}

int Uri::originPort(const std::string& url)
{
    const Poco::URI uri(url);
    const bool isDefaultHttpsPort = uri.getScheme() == "https" && uri.getPort() == 443;
    const bool isDefaultHttpPort = uri.getScheme() == "http" && uri.getPort() == 80;
    return isDefaultHttpsPort || isDefaultHttpPort ? -1 : uri.getPort();
}

bool Uri::isWithinSite(const std::string& from, const std::string& to)
{
    try
    {
        const std::string fromScheme = Poco::URI(from).getScheme();
        const std::string toScheme = Poco::URI(to).getScheme();

        const bool isSameHost = siteHost(to) == siteHost(from);
        const bool isSamePort = originPort(to) == originPort(from);
        const bool isSameScheme = toScheme == fromScheme;
        const bool isFromHttp = fromScheme == "http";
        const bool isHttpToHttps = isFromHttp && toScheme == "https";
        const bool isAllowedScheme = isSameScheme || isHttpToHttps;

        return isSameHost && isSamePort && isAllowedScheme;
    }
    catch (const Poco::SyntaxException&)
    {
        return false;
    }
}

bool Uri::isSignInRequest(const std::string& url, const std::string& accountOrigin)
{
    try
    {
        for (const auto& [name, value] : Poco::URI(url).getQueryParameters())
        {
            if (name == SamlRequestParameter)
                return true;

            const bool isOpenIdReturn = name == OpenIdReturnParameter;
            const bool isCasReturn = name == CasReturnParameter;
            const bool isReturnAddress = isOpenIdReturn || isCasReturn;
            if (isReturnAddress && isWithinSite(accountOrigin, value))
                return true;
        }
    }
    catch (const Poco::SyntaxException&)
    {
        LOG_WRN("Uri: isSignInRequest: the address is not a valid URI");
    }

    return false;
}

std::vector<std::string> Uri::signInProviderLookups(const std::string& accountOrigin)
{
    try
    {
        Poco::URI webFinger(accountOrigin);
        webFinger.setPath(std::string(WebFingerPath));
        webFinger.addQueryParameter("resource", accountOrigin);
        webFinger.addQueryParameter("rel", std::string(IssuerRelation));

        Poco::URI discovery(accountOrigin);
        discovery.setPath(std::string(DiscoveryPath));

        return { webFinger.toString(), discovery.toString() };
    }
    catch (const Poco::SyntaxException&)
    {
        LOG_WRN("Uri: signInProviderLookups: the account origin is not a valid URI");
        return {};
    }
}

std::string Uri::signInProviderOrigin(const std::string& reply)
{
    Poco::JSON::Object::Ptr object;
    if (!JsonUtil::parseJSON(reply, object))
        return std::string();

    std::string issuer = object->optValue<std::string>("issuer", std::string());

    const Poco::JSON::Array::Ptr links = object->getArray("links");
    const std::size_t linkCount = links ? links->size() : 0;
    for (std::size_t i = 0; i < linkCount; ++i)
    {
        const Poco::JSON::Object::Ptr link = links->getObject(i);
        const std::string relation = link ? link->optValue<std::string>("rel", std::string()) : "";
        if (relation == IssuerRelation)
        {
            issuer = link->optValue<std::string>("href", std::string());
            break;
        }
    }

    if (issuer.empty())
    {
        LOG_DBG("Uri: signInProviderOrigin: the reply names no provider");
        return std::string();
    }

    try
    {
        const Poco::URI uri(issuer);
        if (uri.getScheme() != "https" || uri.getHost().empty())
        {
            LOG_WRN("Uri: signInProviderOrigin: the provider is not an https address");
            return std::string();
        }

        const bool hasDefaultPort = originPort(issuer) == -1;
        const std::string port = hasDefaultPort ? "" : ':' + std::to_string(uri.getPort());
        const std::string origin = "https://" + Util::toLower(uri.getHost()) + port;
        LOG_DBG("Uri: signInProviderOrigin: the provider is " << origin);
        return origin;
    }
    catch (const Poco::SyntaxException&)
    {
        LOG_WRN("Uri: signInProviderOrigin: the provider is not a valid URI");
        return std::string();
    }
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
