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

#include <config.h>

#include "CollabFileProxy.hpp"

#include <Anonymizer.hpp>
#include <wsd/COOLWSD.hpp>
#include <wsd/ClientRequestDispatcher.hpp>
#include <Common.hpp>
#include <common/SettingsSecrets.hpp>
#include <wsd/DocumentBroker.hpp>
#include <HttpHelper.hpp>
#include <JsonUtil.hpp>
#include <Log.hpp>
#include <Protocol.hpp>
#include <wsd/RequestDetails.hpp>
#include <SigUtil.hpp>
#include <wsd/Storage.hpp>
#include <Util.hpp>
#include <wsd/wopi/CheckFileInfo.hpp>
#include <wsd/wopi/StorageConnectionManager.hpp>

#include <algorithm>
#include <string_view>

#include <Poco/Exception.h>
#include <Poco/JSON/Parser.h>
#include <Poco/SHA2Engine.h>
#include <Poco/URI.h>

namespace {

// How often a download is tried again after a temporary error or no answer from the host:
constexpr int DownloadRetries = 2;

// How often an UNLOCK is tried again after a temporary error or no answer from the host:
constexpr int UnlockRetries = 2;

// How long an UNLOCK waits for its answer, the same as DocumentBroker:
constexpr std::chrono::seconds UnlockTimeout(3);

// The handler that answers the client with 502 when no connection to the host comes about (as when
// its name does not resolve, or when none of its addresses is allowed):
http::Session::ConnectFailCallback badGatewayOnConnectFail(
    std::weak_ptr<StreamSocket> const & socket, std::string const & uriAnonym)
{
    return [socket, uriAnonym](std::shared_ptr<http::Session> const &) {
        LOG_ERR("CollabFileProxy: no connection to [" << uriAnonym << ']');
        if (std::shared_ptr<StreamSocket> const client = socket.lock()) {
            HttpHelper::sendErrorAndShutdown(http::StatusCode::BadGateway, client);
        }
    };
}

// The type of a fetched body for the client, an upstream image type (which an avatar needs) without
// its parameters, or else application/octet-stream (so that a browser takes the body neither as a
// script nor as a page):
std::string clientContentType(std::string const & upstream) {
    std::string const type = Util::toLower(Util::trimmed(upstream.substr(0, upstream.find(';'))));
    static constexpr std::string_view image = "image/";
    if (type.size() > image.size() && type.starts_with(image)
        && std::all_of(type.begin() + image.size(), type.end(), [](char c) {
               return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                   || std::string_view("!#$&-^_.+").find(c) != std::string_view::npos;
           }))
    {
        return type;
    } else {
        return "application/octet-stream";
    }
}

Poco::URI fileUriOf(Poco::URI const & uploadUri)
{
    // The address of the upload is that of the file with "/contents" appended:
    Poco::URI fileUri(uploadUri);
    std::string path = fileUri.getPath();
    path.erase(path.size() - std::string_view("/contents").size());
    fileUri.setPath(path);

    return fileUri;
}

http::Request createLockRequest(Poco::URI const & fileUri, std::string const & override,
                                std::string const & lockToken)
{
    http::Request httpRequest
        = StorageConnectionManager::createHttpRequest(fileUri, Authorization::create(fileUri));
    httpRequest.setVerb(http::Request::VERB_POST);
    httpRequest.set("X-WOPI-Override", override);
    httpRequest.set("X-WOPI-Lock", lockToken);
    httpRequest.setContentLength(0);

    return httpRequest;
}

void sendUnlock(Poco::URI const & fileUri, std::string const & docKey,
                std::shared_ptr<SocketPoll> const & poll, std::function<void()> const & afterUnlock,
                int retriesLeft = UnlockRetries)
{
    const std::string lockToken = LockContext::lockTokenFor(docKey);
    std::shared_ptr<http::Session> const httpSession = StorageConnectionManager::getWopiHttpSession(fileUri);
    httpSession->setTimeout(UnlockTimeout);
    http::Request const httpRequest = createLockRequest(fileUri, "UNLOCK", lockToken);

    // A failed UNLOCK is tried again at once, while tries are left:
    const std::function<void(bool)> finish = [fileUri, docKey, poll, afterUnlock, retriesLeft](bool failed) {
        if (failed && retriesLeft > 0)
        {
            LOG_WRN_S("CollabFileProxy: trying UNLOCK again");
            sendUnlock(fileUri, docKey, poll, afterUnlock, retriesLeft - 1);
            return;
        }

        if (failed)
            LOG_WRN_S("CollabFileProxy: UNLOCK failed, the host keeps the lock until it expires");

        if (afterUnlock)
            afterUnlock();
    };

    // After a failed TLS handshake both handlers run, and the connect-fail one decides:
    const http::Session::FinishedCallback handleResult = [finish](std::shared_ptr<http::Session> const & session) {
        if (session->connectionResult() != net::AsyncConnectResult::Connected)
            return;

        const http::StatusLine & statusLine = session->response()->statusLine();
        const http::StatusCode statusCode = statusLine.statusCode();
        LOG_INF_S("CollabFileProxy: UNLOCK returned " << statusCode);

        // A 429 asks for a pause, which an immediate retry would not give:
        const bool answered = statusLine.statusCategory() != http::StatusLine::StatusCodeClass::Invalid;
        const bool busy = statusCode == http::StatusCode::TooManyRequests;
        const bool transient = !answered || (http::isTransientStatusCode(statusCode) && !busy);
        finish(transient);
    };

    const http::Session::ConnectFailCallback handleConnectFail = [finish](std::shared_ptr<http::Session> const &) {
        LOG_WRN_S("CollabFileProxy: no connection for the UNLOCK");
        finish(true);
    };

    httpSession->setFinishedHandler(handleResult);
    httpSession->setConnectFailHandler(handleConnectFail);
    httpSession->asyncRequest(httpRequest, poll);
}

void sendUnlockAndWait(Poco::URI const & fileUri, std::string const & docKey)
{
    const std::string lockToken = LockContext::lockTokenFor(docKey);
    std::shared_ptr<http::Session> const httpSession = StorageConnectionManager::getWopiHttpSession(fileUri);
    http::Request const httpRequest = createLockRequest(fileUri, "UNLOCK", lockToken);

    std::shared_ptr<const http::Response> const httpResponse = httpSession->syncRequest(httpRequest, UnlockTimeout);
    LOG_INF_S("CollabFileProxy: UNLOCK returned " << httpResponse->statusLine().statusCode());
}

std::shared_ptr<DocumentBroker> findDocBroker(std::string const & docKey)
{
    std::lock_guard<std::mutex> const docBrokersLock(DocBrokersMutex);
    const auto it = DocBrokers.find(docKey);

    return it != DocBrokers.end() ? it->second : nullptr;
}

}

CollabFileProxy::CollabFileProxy(std::string id, const RequestDetails& requestDetails,
                                 const std::shared_ptr<StreamSocket>& socket,
                                 const std::string& wopiSrc, const std::string& accessToken)
    : _id(std::move(id))
    , _requestDetails(requestDetails)
    , _socket(socket)
    , _wopiSrc(wopiSrc)
    , _accessToken(accessToken)
    , _logFD(socket->getFD())
{
}

CollabFileProxy::~CollabFileProxy()
{
    if (!_locked)
        return;

    // At shutdown the web server poll stops running, so we send this UNLOCK synchronously:
    if (SigUtil::getShutdownRequestFlag())
    {
        // An editor on /cool/ws may hold this lock, as it has the same token,
        // so we leave the unlock to its broker, which unlocks when it unloads.
        const std::string docKey = RequestDetails::getDocKey(_wopiSrc);
        if (findDocBroker(docKey))
        {
            LOG_WRN("CollabFileProxy: not unlocking at shutdown, the document is open on /cool/ws");
            return;
        }

        sendUnlockAndWait(_lockUri, docKey);
        return;
    }

    releaseLock(COOLWSD::getWebServerPoll(), {});
}

void CollabFileProxy::releaseLock(std::shared_ptr<SocketPoll> const & poll,
                                  std::function<void()> const & afterUnlock)
{
    const std::string docKey = RequestDetails::getDocKey(_wopiSrc);
    std::shared_ptr<DocumentBroker> const docBroker = findDocBroker(docKey);
    if (!docBroker)
    {
        LOG_DBG("CollabFileProxy: unlocking, the document is not open on /cool/ws");
        sendUnlock(_lockUri, docKey, poll, afterUnlock);
        return;
    }

    // An editor on /cool/ws holds the lock with the same token and still needs it. Only viewers
    // there hold none. The UNLOCK finishes on this thread before a /cool/ws editor can LOCK here.
    docBroker->addCallback([docBroker, lockUri = _lockUri, docKey]() {
        if (docBroker->isLockedInStorage())
        {
            LOG_DBG_S("CollabFileProxy: not unlocking, an editor on /cool/ws holds the lock");
            return;
        }

        sendUnlockAndWait(lockUri, docKey);
    });

    // Only the broker's thread can tell whether an editor holds the lock, so we go on at once:
    if (afterUnlock)
        afterUnlock();
}

void CollabFileProxy::handleFetchRequest(const std::string& streamUrl, bool wopiContents,
                                         const std::shared_ptr<TerminatingPoll>& poll,
                                         SocketDisposition& disposition,
                                         std::span<const std::string_view> secretFields)
{
    _secretFields = secretFields;

    LOG_INF("CollabFileProxy: handling fetch request for stream ["
            << Anonymizer::anonymizeUrl(streamUrl) << ']');

    std::shared_ptr<StreamSocket> socket = _socket.lock();
    if (!socket)
    {
        LOG_ERR("CollabFileProxy: invalid socket for fetch request");
        return;
    }

    // Parse the stream URL and add access token; the URL may already
    // contain query parameters, so use Poco::URI to add it properly.
    // A request that has no access token fetches the URL as it is.
    Poco::URI uri(streamUrl);
    if (!_accessToken.empty() && wopiContents)
        uri.addQueryParameter("access_token", _accessToken);
    // A URL other than /contents gets the access token only in the Authorization header (as for a
    // FileUrl on /cool/ws):
    Authorization auth = _accessToken.empty() || wopiContents
        ? Authorization::create(uri)
        : Authorization(Authorization::Type::Token, _accessToken, false);

    // Transfer to poll and start download directly (bypassing CheckFileInfo)
    disposition.setTransfer(*poll,
        [this, poll, uri = std::move(uri), auth = std::move(auth),
         keepalive = shared_from_this()](
            const std::shared_ptr<Socket>& moveSocket)
        {
            LOG_TRC('#' << moveSocket->getFD()
                        << ": CollabFileProxy: starting direct fetch for ["
                        << Anonymizer::anonymizeUrl(uri.toString()) << ']');

            doDownload(poll, uri, auth, HTTP_REDIRECTION_LIMIT, DownloadRetries);
        });
}

void CollabFileProxy::handleUploadRequest(const std::string& targetUrl,
                                          std::string const & lastModifiedTime,
                                          bool supportsLocks, std::istream& message,
                                          const std::shared_ptr<TerminatingPoll>& poll,
                                          SocketDisposition& disposition)
{
    LOG_INF("CollabFileProxy: handling upload request to ["
            << Anonymizer::anonymizeUrl(targetUrl) << ']');

    std::shared_ptr<StreamSocket> socket = _socket.lock();
    if (!socket)
    {
        LOG_ERR("CollabFileProxy: invalid socket for upload request");
        return;
    }

    // Read the POST body
    _uploadBody = std::string(std::istreambuf_iterator<char>(message), {});
    _uploadLastModifiedTime = lastModifiedTime;

    // Parse the target URL and add access token; the URL may already
    // contain query parameters, so use Poco::URI to add it properly.
    Poco::URI uri(targetUrl);
    uri.addQueryParameter("access_token", _accessToken);

    // Transfer to poll and start upload directly (bypassing CheckFileInfo)
    disposition.setTransfer(*poll,
        [this, poll, uri = std::move(uri), supportsLocks, keepalive = shared_from_this()](
            const std::shared_ptr<Socket>& moveSocket)
        {
            LOG_TRC('#' << moveSocket->getFD()
                        << ": CollabFileProxy: starting direct upload to ["
                        << Anonymizer::anonymizeUrl(uri.toString()) << ']');

            if (supportsLocks)
                doLock(poll, uri);
            else
                doUpload(poll, uri, _uploadBody);
        });
}

void CollabFileProxy::doLock(const std::shared_ptr<TerminatingPoll>& poll, const Poco::URI& uri)
{
    _lockUri = fileUriOf(uri);

    const std::string lockToken = LockContext::lockTokenFor(RequestDetails::getDocKey(_wopiSrc));
    const std::string uriAnonym = Anonymizer::anonymizeUrl(_lockUri.toString());
    std::shared_ptr<http::Session> const httpSession = StorageConnectionManager::getWopiHttpSession(_lockUri);
    http::Request const httpRequest = createLockRequest(_lockUri, "LOCK", lockToken);

    http::Session::FinishedCallback finishedCallback =
        [this, poll, uri, keepalive = shared_from_this()](
            const std::shared_ptr<http::Session>& session) {
            handleLockResponse(poll, uri, session);
        };

    httpSession->setFinishedHandler(std::move(finishedCallback));
    httpSession->setConnectFailHandler(badGatewayOnConnectFail(_socket, uriAnonym));
    httpSession->asyncRequest(httpRequest, poll);
}

void CollabFileProxy::handleLockResponse(const std::shared_ptr<TerminatingPoll>& poll,
                                         const Poco::URI& uri,
                                         const std::shared_ptr<http::Session>& session)
{
    if (SigUtil::getShutdownRequestFlag())
    {
        // The destructor unlocks a LOCK that went through.
        _locked = session->response()->statusLine().statusCode() == http::StatusCode::OK;
        LOG_DBG("CollabFileProxy: shutdown flagged, aborting upload");
        return;
    }

    // A failed connection got its answer from the connect-fail handler.
    if (session->connectionResult() != net::AsyncConnectResult::Connected)
        return;

    const http::StatusCode statusCode = session->response()->statusLine().statusCode();
    if (statusCode == http::StatusCode::Conflict)
    {
        LOG_WRN("CollabFileProxy: another editor holds the lock, refusing the upload");
        if (std::shared_ptr<StreamSocket> const socket = _socket.lock())
            HttpHelper::sendErrorAndShutdown(http::StatusCode::Locked, socket);
        return;
    }

    _locked = (statusCode == http::StatusCode::OK);
    if (!_locked)
    {
        // A host without locks, for example, takes the upload as before.
        LOG_WRN("CollabFileProxy: LOCK returned " << statusCode << ", uploading unlocked");
    }

    doUpload(poll, uri, _uploadBody);
}

void CollabFileProxy::doDownload(const std::shared_ptr<TerminatingPoll>& poll,
                                 const Poco::URI& uri, Authorization const & auth,
                                 int redirectLimit, int retriesLeft)
{
    const std::string uriAnonym = Anonymizer::anonymizeUrl(uri.toString());
    LOG_DBG("CollabFileProxy: downloading from [" << uriAnonym << ']');

    // The poll keeps the session alive until it finishes, and the session's callback keeps this
    // proxy alive:
    std::shared_ptr<http::Session> const httpSession
        = StorageConnectionManager::getWopiHttpSession(uri);
    http::Request httpRequest = StorageConnectionManager::createHttpRequest(uri, auth);

    const auto startTime = std::chrono::steady_clock::now();

    http::Session::FinishedCallback finishedCallback =
        [this, poll, uri, auth, startTime, uriAnonym, redirectLimit, retriesLeft,
         keepalive = shared_from_this()](const std::shared_ptr<http::Session>& session)
    {
        if (SigUtil::getShutdownRequestFlag())
        {
            LOG_DBG("CollabFileProxy: shutdown flagged, aborting download");
            return;
        }

        // A failed connection got its answer from the connect-fail handler, which runs before this
        // one (as after a failed TLS handshake):
        if (session->connectionResult() != net::AsyncConnectResult::Connected) {
            return;
        }

        std::shared_ptr<StreamSocket> socket = _socket.lock();
        if (!socket)
        {
            LOG_ERR("CollabFileProxy: invalid socket while downloading ["
                    << uriAnonym << ']');
            return;
        }

        const std::shared_ptr<const http::Response> httpResponse = session->response();
        const http::StatusCode statusCode = httpResponse->statusLine().statusCode();

        LOG_TRC("CollabFileProxy: GetFile returned " << statusCode);

        // Handle redirects
        if (statusCode == http::StatusCode::MovedPermanently ||
            statusCode == http::StatusCode::Found ||
            statusCode == http::StatusCode::TemporaryRedirect ||
            statusCode == http::StatusCode::PermanentRedirect)
        {
            if (redirectLimit > 0)
            {
                const std::string location = httpResponse->get("Location");
                LOG_TRC("CollabFileProxy: redirect to ["
                        << Anonymizer::anonymizeUrl(location) << ']');
                Poco::URI target(uri);
                try {
                    target.resolve(location);
                } catch (Poco::Exception const & exc) {
                    LOG_WRN(
                        "CollabFileProxy: the redirect from [" << uriAnonym << "] is malformed: "
                        << exc.displayText());
                    HttpHelper::sendErrorAndShutdown(http::StatusCode::BadGateway, socket);
                    return;
                }
                doDownload(
                    poll, target, Authorization::create(target), redirectLimit - 1, retriesLeft);
                return;
            }
            else
            {
                LOG_WRN("CollabFileProxy: too many redirects for ["
                        << uriAnonym << ']');
                HttpHelper::sendErrorAndShutdown(http::StatusCode::BadGateway, socket);
                return;
            }
        }

        // A temporary error or no answer from the host leads to another try (as a GET changes
        // nothing in storage):
        bool const answered = httpResponse->statusLine().statusCategory()
            != http::StatusLine::StatusCodeClass::Invalid;
        if ((!answered || http::isTransientStatusCode(statusCode)) && retriesLeft > 0) {
            LOG_WRN("CollabFileProxy: trying GetFile from [" << uriAnonym << "] again after "
                    << (answered ? "a temporary error" : "no answer") << " (" << statusCode
                    << ')');
            doDownload(poll, uri, auth, redirectLimit, retriesLeft - 1);
            return;
        }

        const auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - startTime);

        if (statusCode != http::StatusCode::OK)
        {
            LOG_ERR("CollabFileProxy: GetFile failed with " << statusCode
                    << " for [" << uriAnonym << ']');
            HttpHelper::sendErrorAndShutdown(
                statusCode == http::StatusCode::Forbidden
                    ? http::StatusCode::Forbidden
                    : http::StatusCode::BadGateway,
                socket);
            return;
        }

        LOG_INF("CollabFileProxy: downloaded " << httpResponse->getBody().size()
                << " bytes from [" << uriAnonym << "] in " << duration);

        // Send the file to the client.
        http::Response response(http::StatusCode::OK);
        response.setBody(_secretFields.empty()
                             ? httpResponse->getBody()
                             : SettingsSecrets::redactSettingSecrets(httpResponse->getBody(),
                                                                     _secretFields),
                         clientContentType(httpResponse->header().get("Content-Type")));
        response.set("X-Content-Type-Options", "nosniff");
        response.set("Content-Security-Policy", "sandbox");
        response.set("Content-Disposition", "attachment");
        socket->sendAndShutdown(response);
    };

    httpSession->setFinishedHandler(std::move(finishedCallback));
    httpSession->setConnectFailHandler(badGatewayOnConnectFail(_socket, uriAnonym));
    httpSession->asyncRequest(httpRequest, poll);
}

void CollabFileProxy::doUpload(const std::shared_ptr<TerminatingPoll>& poll,
                               const Poco::URI& uri, const std::string& body)
{
    const std::string uriAnonym = Anonymizer::anonymizeUrl(uri.toString());
    LOG_DBG("CollabFileProxy: uploading " << body.size()
            << " bytes to [" << uriAnonym << ']');

    // The poll keeps the session alive until it finishes, and the session's callback keeps this
    // proxy alive:
    std::shared_ptr<http::Session> const httpSession
        = StorageConnectionManager::getWopiHttpSession(uri);
    Authorization auth = Authorization::create(uri);
    http::Request httpRequest = StorageConnectionManager::createHttpRequest(uri, auth);

    httpRequest.setVerb(http::Request::VERB_POST);
    httpRequest.set("X-WOPI-Override", "PUT");
    httpRequest.setContentType("application/octet-stream");
    httpRequest.setContentLength(body.size());
    httpRequest.setBody(body);
    // Have the WOPI host refuse the upload if storage no longer has the version that the client
    // edited:
    if (!_uploadLastModifiedTime.empty()) {
        httpRequest.set("X-COOL-WOPI-Timestamp", _uploadLastModifiedTime);
    }
    if (_locked) {
        const std::string docKey = RequestDetails::getDocKey(_wopiSrc);
        httpRequest.set("X-WOPI-Lock", LockContext::lockTokenFor(docKey));
    }

    const auto startTime = std::chrono::steady_clock::now();

    http::Session::FinishedCallback finishedCallback =
        [this, poll, uri, startTime, uriAnonym, bodySize = body.size(),
         keepalive = shared_from_this()](const std::shared_ptr<http::Session>& session)
    {
        if (SigUtil::getShutdownRequestFlag())
        {
            LOG_DBG("CollabFileProxy: shutdown flagged, aborting upload");
            return;
        }

        // A failed connection got its answer from the connect-fail handler, which runs before this
        // one (as after a failed TLS handshake):
        if (session->connectionResult() != net::AsyncConnectResult::Connected) {
            return;
        }

        std::shared_ptr<StreamSocket> socket = _socket.lock();
        if (!socket)
        {
            LOG_ERR("CollabFileProxy: invalid socket while uploading ["
                    << uriAnonym << ']');
            return;
        }

        const std::shared_ptr<const http::Response> httpResponse = session->response();
        const http::StatusCode statusCode = httpResponse->statusLine().statusCode();

        const auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - startTime);

        LOG_INF("CollabFileProxy: PutFile returned " << statusCode
                << " for " << bodySize << " bytes to [" << uriAnonym
                << "] in " << duration);

        if (statusCode == http::StatusCode::OK)
        {
            answerUploaded(poll, httpResponse->getBody());
        }
        else if (statusCode == http::StatusCode::Conflict)
        {
            // Document was modified externally
            answer(poll, http::StatusCode::Conflict, httpResponse->getBody());
        }
        else if (statusCode == http::StatusCode::Unauthorized ||
                 statusCode == http::StatusCode::Forbidden)
        {
            answer(poll, http::StatusCode::Forbidden);
        }
        else if ((httpResponse->statusLine().statusCategory()
                      == http::StatusLine::StatusCodeClass::Invalid
                  || http::isTransientStatusCode(statusCode))
                 && !_uploadRetried)
        {
            // The host may or may not have stored the upload (so a forced one is just repeated,
            // and else storage tells which, as for /cool/ws):
            _uploadRetried = true;
            if (_uploadLastModifiedTime.empty()) {
                LOG_WRN("CollabFileProxy: repeating the forced PutFile after " << statusCode);
                doUpload(poll, uri, _uploadBody);
            } else {
                checkUploadOutcome(poll, uri);
            }
        }
        else
        {
            LOG_ERR("CollabFileProxy: PutFile failed with " << statusCode);
            answer(poll, http::StatusCode::BadGateway);
        }
    };

    // The PutFile can fail to connect after the LOCK went through, so its 502 goes through
    // answer(), which releases the lock first.
    const http::Session::ConnectFailCallback answerOnConnectFail =
        [this, poll, uriAnonym, keepalive = shared_from_this()](std::shared_ptr<http::Session> const &) {
            LOG_ERR("CollabFileProxy: no connection to [" << uriAnonym << ']');
            answer(poll, http::StatusCode::BadGateway);
        };

    httpSession->setFinishedHandler(std::move(finishedCallback));
    httpSession->setConnectFailHandler(answerOnConnectFail);
    httpSession->asyncRequest(httpRequest, poll);
}

void CollabFileProxy::answerUploaded(std::shared_ptr<TerminatingPoll> const & poll,
                                     std::string const & wopiResponse)
{
    // The CheckFileInfo kept for this document's editor form still has the version from
    // before this upload, and a session that used it would get 409 on every save.
    ClientRequestDispatcher::DropRequestVettingStations(
        RequestDetails::getDocKey(_wopiSrc));

    // Update any existing DocumentBroker's stored timestamp
    // so it matches the new version we just uploaded.  Without
    // this, a subsequent CheckFileInfo (when another user joins)
    // would see a timestamp mismatch and trigger a spurious
    // "Document has been changed" conflict dialog.
    try
    {
        Poco::JSON::Parser parser;
        auto json = parser.parse(wopiResponse).extract<Poco::JSON::Object::Ptr>();
        const std::string lastModifiedTime =
            json->optValue<std::string>("LastModifiedTime", std::string());
        if (!lastModifiedTime.empty())
        {
            const std::string docKey = RequestDetails::getDocKey(_wopiSrc);
            std::unique_lock<std::mutex> lock(DocBrokersMutex);
            auto it = DocBrokers.find(docKey);
            if (it != DocBrokers.end() && it->second)
            {
                auto broker = it->second;
                broker->addCallback(
                    [broker, lastModifiedTime]()
                    {
                        broker->updateLastModifiedTime(lastModifiedTime);
                    });
            }
        }
    }
    catch (const std::exception& ex)
    {
        LOG_DBG("CollabFileProxy: failed to parse PutFile response for "
                "timestamp update: " << ex.what());
    }

    // Return the WOPI response (contains LastModifiedTime etc.)
    answer(poll, http::StatusCode::OK, wopiResponse);
}

void CollabFileProxy::answer(std::shared_ptr<TerminatingPoll> const & poll,
                             http::StatusCode statusCode, std::optional<std::string> const & body)
{
    const std::function<void()> send = [weakSocket = _socket, statusCode, body]() {
        std::shared_ptr<StreamSocket> const socket = weakSocket.lock();
        if (!socket)
        {
            LOG_DBG_S("CollabFileProxy: the client left before its answer");
            return;
        }

        if (!body)
        {
            HttpHelper::sendErrorAndShutdown(statusCode, socket);
            return;
        }

        http::Response response(statusCode);
        response.setBody(*body, "application/json; charset=utf-8");
        socket->sendAndShutdown(response);
    };

    if (!_locked)
    {
        send();
        return;
    }

    _locked = false;

    // A 502 means the host did not answer, so it may not answer the UNLOCK either.
    // The client hears back at once, instead of after every try of the UNLOCK.
    if (statusCode == http::StatusCode::BadGateway)
    {
        releaseLock(poll, {});
        send();
        return;
    }

    releaseLock(poll, send);
}

void CollabFileProxy::checkUploadOutcome(
    std::shared_ptr<TerminatingPoll> const & poll, Poco::URI const & uri)
{
    Poco::URI const fileUri = fileUriOf(uri);

    LOG_WRN("CollabFileProxy: asking storage whether the PutFile without a clear answer landed");
    _uploadCheck = std::make_shared<CheckFileInfo>(
        poll, fileUri,
        [this, poll, uri, keepalive = shared_from_this()](CheckFileInfo & check) {
            // The CheckFileInfo stays alive until this callback returns:
            Poco::JSON::Object::Ptr const info = check.wopiInfo();
            bool const passed = check.state() == CheckFileInfo::State::Pass && info;
            _uploadCheck.reset();

            std::shared_ptr<StreamSocket> const socket = _socket.lock();
            if (!socket) {
                return;
            }
            if (!passed) {
                LOG_ERR("CollabFileProxy: storage cannot tell whether the PutFile landed");
                answer(poll, http::StatusCode::BadGateway);
                return;
            }

            std::string lastModifiedTime;
            JsonUtil::findJSONValue(info, "LastModifiedTime", lastModifiedTime);
            if (lastModifiedTime == _uploadLastModifiedTime) {
                LOG_WRN("CollabFileProxy: the PutFile did not land, repeating it");
                doUpload(poll, uri, _uploadBody);
                return;
            }

            // A hash settles whether the document in storage is the uploaded one, else the size
            // tells, as for /cool/ws:
            std::string storageHash;
            JsonUtil::findJSONValue(info, "SHA256", storageHash);
            bool isUploaded;
            if (storageHash.empty()) {
                std::size_t size = 0;
                JsonUtil::findJSONValue(info, "Size", size);
                isUploaded = size == _uploadBody.size();
            } else {
                Poco::SHA2Engine engine(Poco::SHA2Engine::SHA_256);
                engine.update(_uploadBody.data(), _uploadBody.size());
                isUploaded = storageHash == Util::base64Encode(engine.digest());
            }

            if (isUploaded) {
                LOG_INF("CollabFileProxy: the PutFile landed, as version [" << lastModifiedTime
                        << ']');
                Poco::JSON::Object::Ptr result = new Poco::JSON::Object();
                result->set("LastModifiedTime", lastModifiedTime);
                answerUploaded(poll, JsonUtil::jsonToString(result));
            } else {
                LOG_WRN("CollabFileProxy: storage has another version [" << lastModifiedTime
                        << "] than the PutFile");
                answer(poll, http::StatusCode::Conflict, "{}");
            }
        });
    _uploadCheck->checkFileInfo(HTTP_REDIRECTION_LIMIT);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
