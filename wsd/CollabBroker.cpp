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

#include "CollabBroker.hpp"
#include "CollabSocketHandler.hpp"

#include <Anonymizer.hpp>
#include <wsd/COOLWSD.hpp>
#include <wsd/DocumentBroker.hpp>
#include <JsonUtil.hpp>
#include <Log.hpp>
#include <SigUtil.hpp>
#include <Uri.hpp>
#include <Util.hpp>

#include <algorithm>
#include <atomic>
#include <sstream>

#include <Poco/URI.h>

/// Global CollabBrokers map - keyed by docKey
std::map<std::string, std::shared_ptr<CollabBroker>> CollabBrokers;
std::mutex CollabBrokersMutex;

/// Global fetch requests map - keyed by token
std::map<std::string, CollabFetchRequest> CollabFetchRequests;
std::mutex CollabFetchRequestsMutex;

/// Global upload requests map - keyed by token
std::map<std::string, CollabUploadRequest> CollabUploadRequests;
std::mutex CollabUploadRequestsMutex;

namespace
{
std::atomic<uint64_t> HandlerIdCounter{0};

/// Grace period before reclaiming an idle broker, so a transient
/// client disconnect (network blip) can reconnect and re-find the
/// same broker with its state intact.
constexpr auto COLLAB_BROKER_GRACE = std::chrono::seconds(30);
}

CollabBroker::CollabBroker(const std::string& docKey, const std::string& wopiSrc)
    : _docKey(docKey)
    , _wopiSrc(wopiSrc)
    , _idleSince(std::chrono::steady_clock::now())
    , _accessToken(CollabAccessTokenLength, CollabAccessTokenRotation)
{
    LOG_INF("CollabBroker created for docKey [" << _docKey << ']');
}

CollabBroker::~CollabBroker()
{
    LOG_INF("CollabBroker destroyed for docKey [" << _docKey << ']');
}

std::string CollabBroker::generateHandlerId()
{
    return "collab_" + std::to_string(++HandlerIdCounter);
}

void CollabBroker::addHandler(const std::shared_ptr<CollabSocketHandler>& handler)
{
    std::lock_guard<std::mutex> lock(_mutex);

    const std::string handlerId = generateHandlerId();
    handler->setHandlerId(handlerId);
    _handlers.push_back(handler);
    _disconnectedEditors.erase(handler->getUserId());

    // A new handler is here; the previous "graceful close was the
    // last word" no longer holds.  Reset so the broker stays around
    // again on the next idle period.
    _gracefulClose = false;

    LOG_INF("CollabBroker [" << _docKey << "]: added handler [" << handlerId
            << "], total handlers: " << _handlers.size());
}

void CollabBroker::removeHandler(const std::shared_ptr<CollabSocketHandler>& handler)
{
    std::lock_guard<std::mutex> lock(_mutex);

    const std::string handlerId = handler->getHandlerId();

    // Use erase-remove idiom to find and remove the specific handler
    auto it = std::find_if(_handlers.begin(), _handlers.end(),
                           [&handler](const std::weak_ptr<CollabSocketHandler>& h) {
                               auto locked = h.lock();
                               return locked && locked.get() == handler.get();
                           });

    if (it != _handlers.end())
    {
        LOG_INF("CollabBroker [" << _docKey << "]: removed handler [" << handlerId << ']');
        _handlers.erase(it);
    }

    cleanupExpiredHandlers();
    LOG_DBG("CollabBroker [" << _docKey << "]: remaining handlers: " << _handlers.size());

    // A user who edits a local copy and whose connection closed without a "bye" (so that it may
    // connect again) still edits it during the grace period:
    if (_editingUserIds.contains(handler->getUserId())) {
        if (handler->isGracefulClose()) {
            _disconnectedEditors.erase(handler->getUserId());
            // A "bye" ends the local editing of that user, unless it has another connection:
            if (std::none_of(
                    _handlers.begin(), _handlers.end(),
                    [&](auto const & weakHandler) {
                        auto const h = weakHandler.lock();
                        return h && h->getUserId() == handler->getUserId();
                    }))
            {
                _editingUserIds.erase(handler->getUserId());
            }
        } else {
            _disconnectedEditors[handler->getUserId()]
                = {handler->getUsername(), std::chrono::steady_clock::now()};
        }
    }

    if (handler->isGracefulClose())
        updateEditingStarted();

    if (_handlers.empty())
    {
        _idleSince = std::chrono::steady_clock::now();
        // A "bye" is the last word only when no user whose connection closed without one can still
        // connect again within the grace period:
        std::erase_if(_disconnectedEditors, [this](auto const & entry) {
            return entry.second.since + COLLAB_BROKER_GRACE <= _idleSince;
        });
        if (handler->isGracefulClose() && _disconnectedEditors.empty())
        {
            // Client announced "bye": no reconnect is coming, so
            // drop the editing state now and let isReclaimable()
            // bypass the grace period so cleanupCollabBrokers reaps
            // the broker on its next pass.
            _editingStarted = false;
            _editingUserIds.clear();
            _gracefulClose = true;
        }
        // Otherwise (accidental disconnect): keep _editingStarted
        // set so a reconnect within the grace window finds the
        // session intact.
    }
}

size_t CollabBroker::getHandlerCount() const
{
    std::lock_guard<std::mutex> lock(_mutex);

    size_t count = 0;
    for (const auto& handler : _handlers)
    {
        if (!handler.expired())
            ++count;
    }
    return count;
}

bool CollabBroker::hasHandler(std::string const & handlerId) const {
    std::scoped_lock const lock(_mutex);
    for (auto const & handler: _handlers) {
        if (auto const locked = handler.lock(); locked && locked->getHandlerId() == handlerId) {
            return true;
        }
    }
    return false;
}

bool CollabBroker::isEmpty() const
{
    return getHandlerCount() == 0;
}

bool CollabBroker::isIdle() const
{
    std::lock_guard<std::mutex> lock(_mutex);
    return _handlers.empty();
}

bool CollabBroker::isReclaimable(
    std::chrono::steady_clock::duration grace) const
{
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_handlers.empty())
        return false;
    if (_gracefulClose)
        return true;
    return std::chrono::steady_clock::now() - _idleSince >= grace;
}

void CollabBroker::setWopiInfo(Poco::JSON::Object::Ptr wopiInfo)
{
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_wopiInfo)
    {
        _wopiInfo = wopiInfo;
        LOG_DBG("CollabBroker [" << _docKey << "]: WOPI info set");
    }
}

Poco::JSON::Object::Ptr CollabBroker::getWopiInfo() const
{
    std::lock_guard<std::mutex> lock(_mutex);
    return _wopiInfo;
}

void CollabBroker::broadcastMessage(const std::string& message)
{
    std::lock_guard<std::mutex> lock(_mutex);

    LOG_DBG("CollabBroker [" << _docKey << "]: broadcasting message to "
            << _handlers.size() << " handlers");

    for (auto& weakHandler : _handlers)
    {
        if (auto handler = weakHandler.lock())
        {
            handler->sendTextMessage(message);
        }
    }
}

void CollabBroker::broadcastExcluding(const std::string& message,
                                       const std::shared_ptr<CollabSocketHandler>& exclude)
{
    std::lock_guard<std::mutex> lock(_mutex);

    for (auto& weakHandler : _handlers)
    {
        auto h = weakHandler.lock();
        if (h && h.get() != exclude.get())
        {
            h->sendTextMessage(message);
        }
    }
}

void CollabBroker::sendToEditingUsers(
    std::string const & message, std::shared_ptr<CollabSocketHandler> const & exclude)
{
    std::scoped_lock const lock(_mutex);
    for (auto const & weakHandler: _handlers) {
        auto const h = weakHandler.lock();
        if (h && h.get() != exclude.get() && _editingUserIds.contains(h->getUserId())) {
            h->sendTextMessage(message);
        }
    }
}

LocalEditors CollabBroker::getLocalEditors() const {
    std::scoped_lock const lock(_mutex);
    LocalEditors editors;
    // TODO: _editingUserIds keeps the ID of a user whose connection closed without a "bye", so that
    // such a user who connects again only to view is named here too:
    for (auto const & weakHandler: _handlers) {
        auto const h = weakHandler.lock();
        if (h && _editingUserIds.contains(h->getUserId())) {
            editors.names.insert(h->getUsername());
        }
    }
    auto const now = std::chrono::steady_clock::now();
    for (auto const & [id, editor]: _disconnectedEditors) {
        auto const end = editor.since + COLLAB_BROKER_GRACE;
        if (end > now) {
            editors.names.insert(editor.username);
            if (editors.expiry == std::chrono::steady_clock::time_point() || end < editors.expiry) {
                editors.expiry = end;
            }
        }
    }
    return editors;
}

void CollabBroker::sendLocalEditorsToDocument() const {
    LocalEditors editors = getLocalEditors();
    std::shared_ptr<DocumentBroker> broker;
    {
        std::scoped_lock const lock(DocBrokersMutex);
        auto const it = DocBrokers.find(_docKey);
        if (it != DocBrokers.end()) {
            broker = it->second;
        }
    }
    if (broker) {
        broker->addCallback(
            [broker, editors = std::move(editors)] { broker->sendLocalEditors(editors); });
    }
}

void CollabBroker::askLocalEditorsToJoin(std::string const & userId, std::string const & username) {
    sendToEditingUsers(
        "{\"type\":\"switch_to_collab\",\"user\":{\"id\":\"" + JsonUtil::escapeJSONValue(userId)
        + "\",\"name\":\"" + JsonUtil::escapeJSONValue(username) + "\"}}",
        nullptr);
}

namespace
{
/// Serialize a handler's user info as a JSON object (fields: id,
/// name, and avatar if present).
///
/// The avatar URL is rewritten to a server-hosted proxy
/// (/cool/collab/avatar?...) which returns the cached image bytes.
/// This avoids two problems with forwarding the raw WOPI avatar
/// URL: cross-origin fetches from cool.html don't carry the
/// integrator's session cookies, and CSP may block them.
void appendUserJson(std::ostringstream& oss,
                    const std::string& wopiSrc,
                    const std::string& brokerTag,
                    const std::shared_ptr<CollabSocketHandler>& h)
{
    oss << "{\"id\":\"" << JsonUtil::escapeJSONValue(h->getUserId()) << "\""
           ",\"name\":\"" << JsonUtil::escapeJSONValue(h->getUsername()) << "\""
           ",\"connection\":\"" << JsonUtil::escapeJSONValue(h->getHandlerId()) << "\"";
    if (!h->getAvatar().empty())
    {
        std::string proxy = "/cool/collab/avatar?userId="
            + Uri::encode(h->getUserId())
            + "&token=" + brokerTag + collabRoutingParameters(wopiSrc);
        oss << ",\"avatar\":\""
            << JsonUtil::escapeJSONValue(proxy) << "\"";
    }
    oss << '}';
}

/// Serialize an ExternalSession as a JSON user object.  No avatar
/// field: we don't carry the avatar URL from the /cool/ws session
/// over, so the cool.html renderer falls back to the default icon.
std::string externalUserJson(const std::string& userId,
                             const std::string& username,
                             std::string const & connection)
{
    std::ostringstream oss;
    oss << "{\"id\":\"" << JsonUtil::escapeJSONValue(userId) << "\""
           ",\"name\":\"" << JsonUtil::escapeJSONValue(username) << "\""
           ",\"connection\":\"" << JsonUtil::escapeJSONValue(connection) << "\"";
    oss << '}';
    return oss.str();
}
} // namespace

std::string CollabBroker::getUserListJson(const std::shared_ptr<CollabSocketHandler>& exclude) const
{
    const std::string tag = getCurrentAccessToken();
    std::lock_guard<std::mutex> lock(_mutex);

    std::ostringstream oss;
    oss << "{\"type\":\"user_list\",\"users\":[";

    bool first = true;
    for (const auto& weakHandler : _handlers)
    {
        auto handler = weakHandler.lock();
        if (handler && handler.get() != exclude.get())
        {
            if (!first)
                oss << ',';
            first = false;
            appendUserJson(oss, _wopiSrc, tag, handler);
        }
    }

    for (const auto& [sid, ext] : _externalSessions)
    {
        if (!first)
            oss << ',';
        first = false;
        oss << externalUserJson(
            ext.userId, ext.username, ext.connection);
    }

    oss << "],\"editingActive\":" << (_editingStarted ? "true" : "false")
        << '}';
    return oss.str();
}

void CollabBroker::notifyUserJoined(const std::shared_ptr<CollabSocketHandler>& handler)
{
    std::ostringstream oss;
    oss << "{\"type\":\"user_joined\",\"user\":";
    appendUserJson(oss, _wopiSrc, getCurrentAccessToken(), handler);
    oss << "}";
    const std::string message = oss.str();

    LOG_INF("CollabBroker [" << _docKey << "]: notifying user joined: "
            << Anonymizer::anonymize(handler->getUsername()));

    // Send to all handlers except the one that joined
    std::lock_guard<std::mutex> lock(_mutex);
    for (auto& weakHandler : _handlers)
    {
        auto h = weakHandler.lock();
        if (h && h.get() != handler.get())
        {
            h->sendTextMessage(message);
        }
    }
}

void CollabBroker::notifyUserLeft(const std::shared_ptr<CollabSocketHandler>& handler)
{
    std::ostringstream oss;
    oss << "{\"type\":\"user_left\",\"user\":";
    appendUserJson(oss, _wopiSrc, getCurrentAccessToken(), handler);
    oss << "}";
    const std::string message = oss.str();

    LOG_INF("CollabBroker [" << _docKey << "]: notifying user left: "
            << Anonymizer::anonymize(handler->getUsername()));

    // Send to all remaining handlers
    std::lock_guard<std::mutex> lock(_mutex);
    for (auto& weakHandler : _handlers)
    {
        auto h = weakHandler.lock();
        if (h && h.get() != handler.get())
        {
            h->sendTextMessage(message);
        }
    }
}

void CollabBroker::notifyEditingStarted(const std::shared_ptr<CollabSocketHandler>& handler)
{
    std::ostringstream oss;
    oss << "{\"type\":\"editing_started\",\"user\":";
    appendUserJson(oss, _wopiSrc, getCurrentAccessToken(), handler);
    oss << "}";
    const std::string message = oss.str();

    LOG_INF("CollabBroker [" << _docKey << "]: notifying editing started by: "
            << Anonymizer::anonymize(handler->getUsername()));

    std::lock_guard<std::mutex> lock(_mutex);
    _editingStarted = true;
    if (!_editingUserIds.insert(handler->getUserId()).second)
    {
        LOG_DBG("CollabBroker [" << _docKey << "]: the user already edits, not notifying again");
        return;
    }

    // Send to all handlers except the one that started editing
    for (auto& weakHandler : _handlers)
    {
        auto h = weakHandler.lock();
        if (h && h.get() != handler.get())
        {
            h->sendTextMessage(message);
        }
    }
}

void CollabBroker::updateEditingStarted()
{
    const bool sessionCanWrite =
        std::any_of(_externalSessions.begin(), _externalSessions.end(),
                    [](const auto& session) { return session.second.editing; });

    // A /cool/ws session that can write may change the stored file at any time. So it counts as
    // editing, and CODA users are told to join the server editor instead of a local copy.
    _editingStarted = !_editingUserIds.empty() || sessionCanWrite;
}

void CollabBroker::cleanupExpiredHandlers()
{
    // Called with _mutex held - use erase-remove idiom
    _handlers.erase(
        std::remove_if(_handlers.begin(), _handlers.end(),
                       [](const std::weak_ptr<CollabSocketHandler>& h) {
                           return h.expired();
                       }),
        _handlers.end());
}

std::string CollabBroker::getCurrentAccessToken() const
{
    // Rotate if needed (time-based)
    const_cast<CollabBroker*>(this)->_accessToken.rotateIfNeeded();
    return _accessToken.getCurrent();
}

void CollabBroker::rotateAccessToken()
{
    _accessToken.rotate();
    LOG_TRC("CollabBroker [" << _docKey << "]: access token rotated to "
            << _accessToken.getCurrent() << " (previous: "
            << _accessToken.getPrevious() << ')');
}

bool CollabBroker::matchesAccessToken(const std::string& tag) const
{
    if (tag.empty())
    {
        LOG_ERR("Invalid empty access token tag");
        return false;
    }

    // Rotate if needed before validation
    const_cast<CollabBroker*>(this)->_accessToken.rotateIfNeeded();

    if (_accessToken.matches(tag))
    {
        return true;
    }

    LOG_WRN("CollabBroker [" << _docKey << "]: access token mismatch - got ["
            << tag << "], expected [" << _accessToken.getCurrent() << "] or ["
            << _accessToken.getPrevious() << ']');
    return false;
}

void CollabBroker::registerAvatar(const std::string& userId,
                                  const std::string& url)
{
    std::lock_guard<std::mutex> lock(_mutex);
    _avatars[userId] = UserAvatar{url};
}

CollabBroker::UserAvatar
CollabBroker::lookupAvatar(const std::string& userId) const
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto it = _avatars.find(userId);
    if (it == _avatars.end())
        return {};
    return it->second;
}

void CollabBroker::addExternalSession(const std::string& sessionId,
                                      const std::string& userId,
                                      const std::string& username,
                                      bool editing)
{
    std::string const connection = generateHandlerId();
    const std::string userJson = externalUserJson(
        userId, username, connection);
    const std::string joined =
        "{\"type\":\"user_joined\",\"user\":" + userJson + "}";
    const std::string editStarted = editing
        ? "{\"type\":\"editing_started\",\"user\":" + userJson + "}"
        : std::string();

    std::lock_guard<std::mutex> lock(_mutex);
    auto [it, inserted] = _externalSessions.emplace(
        sessionId, ExternalSession{userId, username, editing, connection});
    if (!inserted)
        return;

    LOG_INF("CollabBroker [" << _docKey << "]: external session ["
            << sessionId << "] joined, editing: " << editing);

    if (editing)
        _editingStarted = true;

    for (auto& weakHandler : _handlers)
    {
        if (auto h = weakHandler.lock())
        {
            h->sendTextMessage(joined);
            if (!editStarted.empty())
                h->sendTextMessage(editStarted);
        }
    }
}

void CollabBroker::removeExternalSession(const std::string& sessionId)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto it = _externalSessions.find(sessionId);
    if (it == _externalSessions.end())
        return;

    const std::string userJson = externalUserJson(
        it->second.userId, it->second.username, it->second.connection);
    _externalSessions.erase(it);
    updateEditingStarted();

    LOG_INF("CollabBroker [" << _docKey << "]: external session ["
            << sessionId << "] left");

    const std::string msg =
        "{\"type\":\"user_left\",\"user\":" + userJson + "}";
    for (auto& weakHandler : _handlers)
    {
        if (auto h = weakHandler.lock())
            h->sendTextMessage(msg);
    }
}

void CollabBroker::startExternalEditing(std::string const & sessionId) {
    std::scoped_lock const lock(_mutex);
    auto const it = _externalSessions.find(sessionId);
    if (it == _externalSessions.end() || it->second.editing) {
        return;
    }
    it->second.editing = true;
    _editingStarted = true;
    std::string const message
        = "{\"type\":\"editing_started\",\"user\":"
        + externalUserJson(it->second.userId, it->second.username, it->second.connection) + "}";
    for (auto const & weakHandler: _handlers) {
        if (auto const h = weakHandler.lock()) {
            h->sendTextMessage(message);
        }
    }
}

std::shared_ptr<CollabBroker> findOrCreateCollabBroker(const std::string& docKey,
                                                        const std::string& wopiSrc)
{
    LOG_INF("Find or create CollabBroker for docKey [" << docKey << ']');

    std::unique_lock<std::mutex> lock(CollabBrokersMutex);

    // Check if shutting down
    if (SigUtil::getShutdownRequestFlag())
    {
        LOG_WRN("Shutdown requested, not creating new CollabBroker for docKey [" << docKey << ']');
        return nullptr;
    }

    // Look up existing broker
    auto it = CollabBrokers.find(docKey);
    if (it != CollabBrokers.end() && it->second)
    {
        if (it->second->isReclaimable(COLLAB_BROKER_GRACE))
        {
            LOG_INF("Removing idle CollabBroker for docKey [" << docKey
                                                             << "] after its grace period");
            CollabBrokers.erase(it);
        }
        else
        {
            LOG_DBG("Found existing CollabBroker for docKey [" << docKey << ']');
            return it->second;
        }
    }

    // Create new broker
    LOG_DBG("Creating new CollabBroker for docKey [" << docKey << ']');
    auto broker = std::make_shared<CollabBroker>(docKey, wopiSrc);
    CollabBrokers.emplace(docKey, broker);

    LOG_TRC("Have " << CollabBrokers.size() << " CollabBrokers after inserting [" << docKey << ']');

    return broker;
}

void cleanupCollabBrokers()
{
    std::lock_guard<std::mutex> lock(CollabBrokersMutex);

    for (auto it = CollabBrokers.begin(); it != CollabBrokers.end(); )
    {
        if (it->second && it->second->isReclaimable(COLLAB_BROKER_GRACE))
        {
            LOG_INF("Removing idle CollabBroker for docKey [" << it->first << ']');
            it = CollabBrokers.erase(it);
        }
        else
        {
            ++it;
        }
    }
}

std::string createCollabFetchRequest(const std::string& streamUrl,
                                      bool wopiContents,
                                      const std::string& accessToken,
                                      const std::string& wopiSrc,
                                      const std::string& docKey,
                                      const std::string& brokerTag,
                                      const std::string& requestId,
                                      const std::string& stream,
                                      std::string const & handlerId)
{
    // Generate a unique token
    const std::string token = Util::rng::getHexString(CollabAccessTokenLength);

    CollabFetchRequest request;
    request.streamUrl = streamUrl;
    request.wopiContents = wopiContents;
    request.accessToken = accessToken;
    request.wopiSrc = wopiSrc;
    request.docKey = docKey;
    request.brokerTag = brokerTag;
    request.requestId = requestId;
    request.stream = stream;
    request.handlerId = handlerId;
    // Token expires after configured duration
    request.expiry = std::chrono::steady_clock::now() + CollabFetchTokenExpiry;

    {
        std::lock_guard<std::mutex> lock(CollabFetchRequestsMutex);
        CollabFetchRequests[token] = std::move(request);
    }

    LOG_DBG("Created fetch request with token [" << token << "] for stream [" << stream
            << "] docKey [" << docKey << ']');
    return token;
}

std::shared_ptr<CollabBroker> findCollabBroker(const std::string& docKey)
{
    std::lock_guard<std::mutex> lock(CollabBrokersMutex);

    auto it = CollabBrokers.find(docKey);
    if (it != CollabBrokers.end() && it->second && !it->second->isEmpty())
    {
        return it->second;
    }
    return nullptr;
}

LocalEditors findLocalEditors(std::string const & docKey) {
    std::shared_ptr<CollabBroker> broker;
    {
        std::scoped_lock const lock(CollabBrokersMutex);
        auto const it = CollabBrokers.find(docKey);
        if (it != CollabBrokers.end()) {
            broker = it->second;
        }
    }
    if (broker) {
        return broker->getLocalEditors();
    } else {
        return {};
    }
}

std::string collabRoutingParameters(std::string const & wopiSrc) {
    Poco::URI uri(wopiSrc);
    uri.setQueryParameters(Poco::URI::QueryParameters());
    std::string parameters = "&WOPISrc=" + Uri::encode(uri.toString());
    std::string const routeToken = COOLWSD::getRouteToken();
    if (!routeToken.empty()) {
        parameters += "&RouteToken=" + routeToken;
    }
    return parameters;
}

bool consumeCollabFetchRequest(const std::string& token, CollabFetchRequest& request)
{
    std::lock_guard<std::mutex> lock(CollabFetchRequestsMutex);

    auto it = CollabFetchRequests.find(token);
    if (it == CollabFetchRequests.end())
    {
        LOG_WRN("Fetch request not found for token [" << token << ']');
        return false;
    }

    // Check if expired
    if (std::chrono::steady_clock::now() > it->second.expiry)
    {
        LOG_WRN("Fetch request expired for token [" << token << ']');
        CollabFetchRequests.erase(it);
        return false;
    }

    request = std::move(it->second);
    CollabFetchRequests.erase(it);

    LOG_DBG("Consumed fetch request for token [" << token << "] stream [" << request.stream << ']');
    return true;
}

void cleanupCollabFetchRequests()
{
    std::lock_guard<std::mutex> lock(CollabFetchRequestsMutex);

    const auto now = std::chrono::steady_clock::now();
    for (auto it = CollabFetchRequests.begin(); it != CollabFetchRequests.end(); )
    {
        if (now > it->second.expiry)
        {
            LOG_DBG("Removing expired fetch request for token [" << it->first << ']');
            it = CollabFetchRequests.erase(it);
        }
        else
        {
            ++it;
        }
    }
}

std::string createCollabUploadRequest(const std::string& targetUrl,
                                       const std::string& accessToken,
                                       const std::string& wopiSrc,
                                       const std::string& docKey,
                                       const std::string& brokerTag,
                                       const std::string& requestId,
                                       std::string const & lastModifiedTime,
                                       std::string const & handlerId,
                                       bool supportsLocks)
{
    const std::string token = Util::rng::getHexString(CollabAccessTokenLength);

    CollabUploadRequest request;
    request.targetUrl = targetUrl;
    request.accessToken = accessToken;
    request.wopiSrc = wopiSrc;
    request.docKey = docKey;
    request.brokerTag = brokerTag;
    request.requestId = requestId;
    request.lastModifiedTime = lastModifiedTime;
    request.handlerId = handlerId;
    request.supportsLocks = supportsLocks;
    request.expiry = std::chrono::steady_clock::now() + CollabUploadTokenExpiry;

    {
        std::lock_guard<std::mutex> lock(CollabUploadRequestsMutex);
        CollabUploadRequests[token] = std::move(request);
    }

    LOG_DBG("Created upload request with token [" << token << "] for docKey [" << docKey << ']');
    return token;
}

bool consumeCollabUploadRequest(const std::string& token, CollabUploadRequest& request)
{
    std::lock_guard<std::mutex> lock(CollabUploadRequestsMutex);

    auto it = CollabUploadRequests.find(token);
    if (it == CollabUploadRequests.end())
    {
        LOG_WRN("Upload request not found for token [" << token << ']');
        return false;
    }

    if (std::chrono::steady_clock::now() > it->second.expiry)
    {
        LOG_WRN("Upload request expired for token [" << token << ']');
        CollabUploadRequests.erase(it);
        return false;
    }

    request = std::move(it->second);
    CollabUploadRequests.erase(it);

    LOG_DBG("Consumed upload request for token [" << token << ']');
    return true;
}

void cleanupCollabUploadRequests()
{
    std::lock_guard<std::mutex> lock(CollabUploadRequestsMutex);

    const auto now = std::chrono::steady_clock::now();
    for (auto it = CollabUploadRequests.begin(); it != CollabUploadRequests.end(); )
    {
        if (now > it->second.expiry)
        {
            LOG_DBG("Removing expired upload request for token [" << it->first << ']');
            it = CollabUploadRequests.erase(it);
        }
        else
        {
            ++it;
        }
    }
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
