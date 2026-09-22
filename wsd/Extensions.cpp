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

#include <algorithm>
#include <cstdio>
#include <regex>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include <Poco/DirectoryIterator.h>
#include <Poco/Exception.h>
#include <Poco/File.h>
#include <Poco/FileStream.h>
#include <Poco/Path.h>
#include <Poco/StreamCopier.h>

#include <config.h>

#include <common/Log.hpp>
#include <wsd/Extensions.hpp>

std::vector<std::pair<std::string, std::string>> Extensions::enumerateGasScripts(
    Poco::Path const & dir)
{
    std::vector<std::pair<std::string, std::string>> scripts;
    for (Poco::DirectoryIterator it(dir), end; it != end; ++it) {
        if (!it->isFile()) {
            continue;
        }
        std::string const & name = it.name();
        if (name.starts_with('.') || !(name.ends_with(".gs") || name.ends_with(".js"))) {
            continue;
        }
        Poco::FileInputStream stream(it->path());
        std::string src;
        Poco::StreamCopier::copyToString(stream, src);
        scripts.emplace_back(name, std::move(src));
    }
    std::sort(scripts.begin(), scripts.end());
    return scripts;
}

static std::string jsonQuote(std::string const & s) {
    std::string out;
    out.reserve(s.size() + 2);
    out.push_back('"');
    for (char c : s) {
        switch (c) {
        case '"': out.append("\\\""); break;
        case '\\': out.append("\\\\"); break;
        case '\b': out.append("\\b"); break;
        case '\f': out.append("\\f"); break;
        case '\n': out.append("\\n"); break;
        case '\r': out.append("\\r"); break;
        case '\t': out.append("\\t"); break;
        default:
            if (static_cast<unsigned char>(c) < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
                out.append(buf);
            } else {
                out.push_back(c);
            }
            break;
        }
    }
    out.push_back('"');
    return out;
}

std::string Extensions::synthesizeGasSidecar(
    std::vector<std::pair<std::string, std::string>> const & scripts)
{
    // Guess the add-on's target document types from the DocumentApp/SpreadsheetApp/SlidesApp
    // mentions:
    std::vector<std::string> supports;
    auto containsAnySource = [&scripts](std::string_view needle) {
        for (auto const & [name, src]: scripts) {
            if (src.find(needle) != std::string::npos) {
                return true;
            }
        }
        return false;
    };
    if (containsAnySource("DocumentApp")) {
        supports.push_back("text");
    }
    if (containsAnySource("SpreadsheetApp")) {
        supports.push_back("spreadsheet");
    }
    if (containsAnySource("SlidesApp")) {
        supports.push_back("presentation");
    }

    // Guess a display name from setTitle("..."), a NAME_TITLE = "..." constant, or the name an
    // addMenu("...", ...) call gives its own menu:
    std::string displayName;
    static const std::regex reSetTitle(R"RE(setTitle\s*\(\s*(?:'([^']+)'|"([^"]+)"))RE");
    static const std::regex reTitleConst(
        R"RE([A-Za-z_][A-Za-z0-9_]*_TITLE\s*=\s*(?:'([^']+)'|"([^"]+)"))RE");
    static const std::regex reMenuName(R"RE(addMenu\s*\(\s*(?:'([^']+)'|"([^"]+)"))RE");
    auto tryMatch = [&scripts](std::regex const & re) -> std::string {
        for (auto const & [name, src]: scripts) {
            std::smatch m;
            if (std::regex_search(src, m, re)) {
                return m[1].matched ? m[1].str() : m[2].str();
            }
        }
        return std::string();
    };
    displayName = tryMatch(reSetTitle);
    if (displayName.empty()) {
        displayName = tryMatch(reTitleConst);
    }
    if (displayName.empty()) {
        displayName = tryMatch(reMenuName);
    }

    std::string body = "{\"scripts\":[";
    bool firstScript = true;
    for (auto const & [name, src]: scripts) {
        if (!firstScript) {
            body.push_back(',');
        }
        firstScript = false;
        body.append(jsonQuote(name));
    }
    body.push_back(']');
    if (!displayName.empty()) {
        body.append(",\"name\":");
        body.append(jsonQuote(displayName));
    }
    if (!supports.empty()) {
        body.append(",\"supports\":[");
        bool firstSupport = true;
        for (auto const & s: supports) {
            if (!firstSupport) {
                body.push_back(',');
            }
            firstSupport = false;
            body.append(jsonQuote(s));
        }
        body.push_back(']');
    }
    body.push_back('}');
    return body;
}

#if ENABLE_DEBUG

void Extensions::synthesizeBuiltinExtensionsIndex(std::string const & distExtensionsDir) {
    Poco::File extDir(distExtensionsDir);
    if (!extDir.exists() || !extDir.isDirectory()) {
        return;
    }

    std::set<std::string> nativeIds;
    std::set<std::string> gasIds;
    try {
        for (Poco::DirectoryIterator it(distExtensionsDir), end; it != end; ++it) {
            if (!it->isDirectory()) {
                continue;
            }
            std::string const & id = it.name();
            if (id.empty() || id.front() == '.') {
                continue;
            }
            Poco::Path subdir(it->path());
            Poco::Path native(subdir, "manifest.json");
            Poco::Path gas(subdir, "appsscript.json");
            if (Poco::File(native).exists()) {
                nativeIds.insert(id);
            } else if (Poco::File(gas).exists()) {
                gasIds.insert(id);
            }
        }
    } catch (Poco::Exception const & e) {
        LOG_WRN(
            "Extensions: failed to enumerate [" << distExtensionsDir
            << "]: " << e.displayText());
        return;
    }

    std::vector<std::string> allIds;
    allIds.reserve(nativeIds.size() + gasIds.size());
    allIds.insert(allIds.end(), nativeIds.begin(), nativeIds.end());
    allIds.insert(allIds.end(), gasIds.begin(), gasIds.end());
    std::sort(allIds.begin(), allIds.end());

    std::string indexJson = "[";
    bool first = true;
    for (auto const & id: allIds) {
        if (!first) {
            indexJson.push_back(',');
        }
        first = false;
        indexJson.append(jsonQuote(id));
    }
    indexJson.push_back(']');
    Poco::Path indexPath(distExtensionsDir);
    indexPath.append("index.json");
    try {
        Poco::FileOutputStream out(indexPath.toString());
        out.write(indexJson.data(), indexJson.size());
    } catch (Poco::Exception const & e) {
        LOG_WRN(
            "Extensions: failed to write [" << indexPath.toString()
            << "]: " << e.displayText());
    }

    // Stash a <id>/_cool-gas.json sidecar listing each Apps Script directory's scripts:
    for (auto const & id: gasIds) {
        Poco::Path dir = Poco::Path::forDirectory(distExtensionsDir);
        dir.pushDirectory(id);
        std::vector<std::pair<std::string, std::string>> scripts;
        try {
            scripts = enumerateGasScripts(dir);
        } catch (Poco::Exception const & e) {
            LOG_WRN(
                "Extensions: failed to enumerate [" << dir.toString()
                << "]: " << e.displayText());
            continue;
        }
        Poco::Path sidecarPath(dir);
        sidecarPath.append("_cool-gas.json");
        try {
            Poco::FileOutputStream out(sidecarPath.toString());
            std::string const body = synthesizeGasSidecar(scripts);
            out.write(body.data(), body.size());
        } catch (Poco::Exception const & e) {
            LOG_WRN(
                "Extensions: failed to write [" << sidecarPath.toString()
                << "]: " << e.displayText());
        }
    }
}

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
