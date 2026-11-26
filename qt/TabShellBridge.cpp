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

#include "TabShellBridge.hpp"
#include "TabManager.hpp"
#include "WindowDecorations.hpp"

#include <common/Log.hpp>

// The bridge is parented to its TabManager, so it cannot outlive _manager.
TabShellBridge::TabShellBridge(TabManager* manager)
    : QObject(manager)
    , _manager(manager)
{
}

void TabShellBridge::requestSync() { _manager->emitInitialState(); }
void TabShellBridge::tabActivated(int tabId) { _manager->activateTab(tabId); }
void TabShellBridge::tabCloseRequested(int tabId) { _manager->closeTab(tabId); }
void TabShellBridge::tabContextMenuRequested(int tabId, int x, int y) { _manager->showTabContextMenu(tabId, x, y); }
void TabShellBridge::newTabRequested() { _manager->addStarterTab(); }

void TabShellBridge::tabReordered(int fromIndex, int toIndex)
{
    _manager->reorderTab(fromIndex, toIndex);
}

void TabShellBridge::tabDragStarted(int tabId) { _manager->onSourceDragStarted(tabId); }

void TabShellBridge::tabDragEnded(int tabId, bool inStripDropHandled)
{
    _manager->onSourceDragEnded(tabId, inStripDropHandled);
}

void TabShellBridge::tabAdoptFromOtherWindow(int srcTabId, int insertAt)
{
    _manager->adoptFromOtherWindow(srcTabId, insertAt);
}

void TabShellBridge::targetDragOver(int insertAt) { _manager->onTargetDragOver(insertAt); }

void TabShellBridge::tabHoverStarted(int tabId, int x, int y, const QString& background,
                                     const QString& text, const QString& border,
                                     bool rightToLeft, const QString& imageBackground,
                                     const QString& shadow)
{
    _manager->onTabHoverStarted(tabId, x, y, background, text, border, rightToLeft,
                                imageBackground, shadow);
}

void TabShellBridge::tabHoverEnded() { _manager->hideHoverCard(); }

void TabShellBridge::windowMoveRequested()
{
    if (WindowDecorations* decorations = _manager->decorations())
        decorations->startMove();
}

void TabShellBridge::titleBarDoubleClicked()
{
    if (WindowDecorations* decorations = _manager->decorations())
        decorations->titleBarDoubleClicked();
}

// The page names the window controls and states as GNOME's button-layout does, and uses the
// names in its CSS, so they cross the bridge as names.
void TabShellBridge::windowControlActivated(const QString& control)
{
    WindowDecorations* decorations = _manager->decorations();
    if (!decorations)
        return;
    if (control == QLatin1String("minimize"))
        decorations->controlActivated(WindowControl::Minimize);
    else if (control == QLatin1String("maximize"))
        decorations->controlActivated(WindowControl::Maximize);
    else if (control == QLatin1String("close"))
        decorations->controlActivated(WindowControl::Close);
}

void TabShellBridge::sendWindowState(WindowState state, bool active)
{
    switch (state)
    {
        case WindowState::Normal:
            emit windowStateChanged(QStringLiteral("normal"), active);
            break;
        case WindowState::Maximized:
            emit windowStateChanged(QStringLiteral("maximized"), active);
            break;
        case WindowState::FullScreen:
            emit windowStateChanged(QStringLiteral("fullscreen"), active);
            break;
    }
}

void TabShellBridge::debug(const QString& message)
{
    LOG_TRC_NOFILE("[tabstrip] " << message.toStdString());
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
