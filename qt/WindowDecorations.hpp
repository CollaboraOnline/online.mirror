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

#pragma once

#include <QMargins>
#include <QObject>
#include <QRect>
#include <QString>
// After QObject: GCC rejects the Qt headers when QtDBus comes first (sfinae-incomplete).
#include <QDBusVariant>

class QEvent;
class QMainWindow;
class QPoint;

enum class WindowControl
{
    Minimize,
    Maximize,
    Close
};

enum class WindowState
{
    Normal,
    Maximized,
    FullScreen
};

// What a double click on the free space of the tab strip does.
enum class TitleBarAction
{
    ToggleMaximize,
    Minimize,
    None
};

// The window manager preferences that the CSD follows.
class DecorationSettings : public QObject
{
    Q_OBJECT

public:
    static DecorationSettings* instance();

    // In the form of GNOME's button-layout, "left:right", with only the buttons the frame draws:
    // minimize, maximize and close.
    QString buttonLayout() const { return _buttonLayout; }

    TitleBarAction doubleClickAction() const { return _doubleClickAction; }

signals:
    void buttonLayoutChanged(const QString& layout);

private slots:
    void onPortalSettingChanged(const QString& group, const QString& key,
                                const QDBusVariant& value);

private:
    DecorationSettings();

    QString _buttonLayout;
    TitleBarAction _doubleClickAction = TitleBarAction::ToggleMaximize;
};

// The frame of a window that has CSD: the window controls live in the tab strip page, and
// this object gives the window its rounded top, its shadow or outline, and its moving and
// resizing. Created by the window before it is first shown, and owned by it.
class WindowDecorations : public QObject
{
    Q_OBJECT

public:
    // On Wayland, unless CODA_CSD=0. CODA_CSD=1 turns it on elsewhere too, for tests.
    static bool wanted();

    explicit WindowDecorations(QMainWindow* window);
    ~WindowDecorations() override;

    WindowState state() const;
    bool isActive() const;

    void setDark(bool dark);

    // Called from the tab strip.
    void startMove();
    void controlActivated(WindowControl control);
    void titleBarDoubleClicked();

    bool eventFilter(QObject* obj, QEvent* ev) override;

signals:
    void stateChanged(WindowState state, bool active);

private:
    void toggleMaximize();
    void updateMargins();
    void updateInputMask();
    void paint();
    Qt::Edges edgesAt(const QPoint& windowPos) const;
    void setEdgeCursor(Qt::Edges edges);
    bool handleMouse(QEvent* ev);

    QMainWindow* _window;
    bool _dark = false;
    bool _drawShadow = false;
    QMargins _margins;
    // The edges under the pointer that the cursor now shows, if any.
    Qt::Edges _cursorEdges;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
