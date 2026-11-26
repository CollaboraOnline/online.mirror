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

#include "WindowDecorations.hpp"

#include "WebView.hpp"

#include <QApplication>
#include <QCursor>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusReply>
#include <QGuiApplication>
#include <QMainWindow>
#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QRegion>
#include <QSettings>
#include <QStandardPaths>
#include <QStringList>
#include <QTimer>
#include <QWindow>

#include <optional>

// The private QtGui interface of a Wayland window can tell the compositor that a margin around
// the window is shadow: the compositor then leaves it out of the window's geometry when it
// places, snaps and tiles the window. There is no public API for this, so without the private
// headers the window draws an outline instead of a shadow.
#if __has_include(<QtGui/qpa/qplatformwindow_p.h>)
#include <QtGui/qpa/qplatformwindow_p.h>
#if QT_CONFIG(wayland)
#define CODA_WAYLAND_WINDOW_MARGINS 1
#endif
#endif

namespace
{
// The radius of the rounded top corners, which is the radius of the active tab's corners, the
// --tab-radius of qtapp-tabstrip.css.
constexpr qreal kCornerRadius = 10;
// The width of the shadow around a window whose compositor knows about it.
constexpr int kShadowWidth = 12;
// The width of the outline around a window whose compositor cannot be told about a shadow.
constexpr int kOutlineWidth = 1;
// The band where the pointer resizes the window: outside the window, in the shadow, or inside
// the window when there is only an outline.
constexpr int kOutsideResizeBand = 8;
constexpr int kInsideResizeBand = 4;
// How far along each edge from a corner the pointer resizes from the corner.
constexpr int kCornerReach = 12;

// The --color-border of color-palette.css and color-palette-dark.css.
QColor outlineColor(bool dark) { return dark ? QColor(0x76, 0x76, 0x76) : QColor(0xb6, 0xb6, 0xb6); }

// The alpha of the shadow next to the window, which fades to nothing at the outside.
int shadowAlpha(bool dark) { return dark ? 110 : 60; }

// The outline of a rectangle with rounded top corners and square bottom corners.
QPainterPath roundedTopPath(const QRectF& rect, qreal radius)
{
    QPainterPath path;
    path.moveTo(rect.left(), rect.bottom());
    if (radius <= 0)
    {
        path.lineTo(rect.topLeft());
        path.lineTo(rect.topRight());
    }
    else
    {
        const qreal diameter = 2 * radius;
        path.lineTo(rect.left(), rect.top() + radius);
        path.arcTo(QRectF(rect.left(), rect.top(), diameter, diameter), 180, -90);
        path.lineTo(rect.right() - radius, rect.top());
        path.arcTo(QRectF(rect.right() - diameter, rect.top(), diameter, diameter), 90, -90);
    }
    path.lineTo(rect.bottomRight());
    path.closeSubpath();
    return path;
}

bool desktopIs(const char* name)
{
    return qgetenv("XDG_CURRENT_DESKTOP").toLower().contains(QByteArray(name).toLower());
}

// A value from the settings portal, which serves the GNOME settings to sandboxed and unsandboxed
// apps alike. Empty when there is no portal or it has no such setting.
std::optional<QVariant> readPortalSetting(const QString& group, const QString& key)
{
    QDBusMessage message = QDBusMessage::createMethodCall(
        "org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.Settings", "Read");
    message << group << key;
    // A short timeout, as the windows wait for this to open.
    QDBusReply<QVariant> reply = QDBusConnection::sessionBus().call(message, QDBus::Block, 1000);
    if (!reply.isValid())
        return std::nullopt;
    QVariant value = reply.value();
    // Read wraps the value in one more variant than the value itself has.
    while (value.userType() == qMetaTypeId<QDBusVariant>())
        value = qvariant_cast<QDBusVariant>(value).variant();
    return value;
}

// Filter GNOME's button-layout so it only contains controls we draw.
QString keepDrawnButtons(const QString& layout)
{
    // A layout without a colon has all its buttons on the left.
    const QStringList sides = layout.split(QLatin1Char(':'));
    const auto keep = [](const QString& side)
    {
        QStringList buttons;
        for (const QString& item : side.split(QLatin1Char(','), Qt::SkipEmptyParts))
        {
            const QString name = item.trimmed();
            if ((name == QLatin1String("minimize") || name == QLatin1String("maximize") ||
                 name == QLatin1String("close")) &&
                !buttons.contains(name))
                buttons.append(name);
        }
        return buttons.join(QLatin1Char(','));
    };
    return keep(sides.value(0)) + QLatin1Char(':') + keep(sides.value(1));
}

// KWin names its buttons with one letter each, I minimize, A maximize and X close.
QString kwinButtons(const QString& letters)
{
    QStringList buttons;
    for (const QChar letter : letters)
    {
        if (letter == QLatin1Char('I'))
            buttons.append(QStringLiteral("minimize"));
        else if (letter == QLatin1Char('A'))
            buttons.append(QStringLiteral("maximize"));
        else if (letter == QLatin1Char('X'))
            buttons.append(QStringLiteral("close"));
    }
    return buttons.join(QLatin1Char(','));
}

TitleBarAction doubleClickActionFromGnome(const QString& action)
{
    if (action.startsWith(QLatin1String("toggle-maximize")))
        return TitleBarAction::ToggleMaximize;
    if (action == QLatin1String("minimize"))
        return TitleBarAction::Minimize;
    return TitleBarAction::None;
}
} // namespace

DecorationSettings* DecorationSettings::instance()
{
    static DecorationSettings* settings = new DecorationSettings();
    return settings;
}

DecorationSettings::DecorationSettings()
    : QObject(qApp)
{
    // For tests, a layout in the form of GNOME's button-layout.
    const QByteArray testLayout = qgetenv("CODA_CSD_LAYOUT");
    if (!testLayout.isEmpty())
    {
        _buttonLayout = keepDrawnButtons(QString::fromUtf8(testLayout));
        return;
    }

    // KWin keeps its buttons in its own configuration, which GTK apps also follow on KDE.
    if (desktopIs("KDE"))
    {
        const QString path =
            QStandardPaths::locate(QStandardPaths::GenericConfigLocation, QStringLiteral("kwinrc"));
        QString left = QStringLiteral("MS");
        QString right = QStringLiteral("HIAX");
        QString doubleClick = QStringLiteral("Maximize");
        if (!path.isEmpty())
        {
            QSettings kwinrc(path, QSettings::IniFormat);
            left = kwinrc.value(QStringLiteral("org.kde.kdecoration2/ButtonsOnLeft"), left).toString();
            right =
                kwinrc.value(QStringLiteral("org.kde.kdecoration2/ButtonsOnRight"), right).toString();
            doubleClick =
                kwinrc.value(QStringLiteral("Windows/TitlebarDoubleClickCommand"), doubleClick)
                    .toString();
        }
        _buttonLayout = kwinButtons(left) + QLatin1Char(':') + kwinButtons(right);
        if (doubleClick.startsWith(QLatin1String("Maximize")))
            _doubleClickAction = TitleBarAction::ToggleMaximize;
        else if (doubleClick == QLatin1String("Minimize"))
            _doubleClickAction = TitleBarAction::Minimize;
        else
            _doubleClickAction = TitleBarAction::None;
    }
    else
    {
        if (const auto layout = readPortalSetting(QStringLiteral("org.gnome.desktop.wm.preferences"),
                                                  QStringLiteral("button-layout")))
            _buttonLayout = keepDrawnButtons(layout->toString());
        else
            _buttonLayout = desktopIs("GNOME") ? QStringLiteral(":close")
                                               : QStringLiteral(":minimize,maximize,close");

        if (const auto action =
                readPortalSetting(QStringLiteral("org.gnome.desktop.wm.preferences"),
                                  QStringLiteral("action-double-click-titlebar")))
            _doubleClickAction = doubleClickActionFromGnome(action->toString());

        // A change in the settings shows at once in every window.
        QDBusConnection::sessionBus().connect(
            "org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Settings", "SettingChanged", this,
            SLOT(onPortalSettingChanged(QString, QString, QDBusVariant)));
    }
}

void DecorationSettings::onPortalSettingChanged(const QString& group, const QString& key,
                                                const QDBusVariant& value)
{
    if (group != QLatin1String("org.gnome.desktop.wm.preferences"))
        return;
    if (key == QLatin1String("button-layout"))
    {
        const QString layout = keepDrawnButtons(value.variant().toString());
        if (layout == _buttonLayout)
            return;
        _buttonLayout = layout;
        emit buttonLayoutChanged(_buttonLayout);
    }
    else if (key == QLatin1String("action-double-click-titlebar"))
        _doubleClickAction = doubleClickActionFromGnome(value.variant().toString());
}

bool WindowDecorations::wanted()
{
    static const bool result = []
    {
        const QByteArray env = qgetenv("CODA_CSD");
        if (env == "0")
            return false;
        if (env == "1")
            return true;
        return QGuiApplication::platformName().startsWith(QLatin1String("wayland"));
    }();
    return result;
}

WindowDecorations::WindowDecorations(QMainWindow* window)
    : QObject(window)
    , _window(window)
{
    // Both have to be set before the platform window is made.
    _window->setWindowFlag(Qt::FramelessWindowHint);
    _window->setAttribute(Qt::WA_TranslucentBackground);

    _window->setMouseTracking(true);
    qApp->installEventFilter(this);
}

WindowDecorations::~WindowDecorations() { setEdgeCursor({}); }

WindowState WindowDecorations::state() const
{
    if (_window->isFullScreen())
        return WindowState::FullScreen;
    if (_window->isMaximized())
        return WindowState::Maximized;
    return WindowState::Normal;
}

bool WindowDecorations::isActive() const { return _window->isActiveWindow(); }

void WindowDecorations::setDark(bool dark)
{
    _dark = dark;
    _window->update();
}

void WindowDecorations::startMove()
{
    // The compositor takes over the pointer while the button that pressed on the strip is
    // still down.
    if (QWindow* handle = _window->windowHandle())
        handle->startSystemMove();
}

void WindowDecorations::controlActivated(WindowControl control)
{
    switch (control)
    {
        case WindowControl::Minimize:
            _window->showMinimized();
            break;
        case WindowControl::Maximize:
            toggleMaximize();
            break;
        case WindowControl::Close:
            // Defer, as the close of the last tab deletes the strip that asked for it. A close
            // still goes through TabbedWindow::closeEvent, so every document is saved first.
            QTimer::singleShot(0, _window, [window = _window]() { window->close(); });
            break;
    }
}

void WindowDecorations::titleBarDoubleClicked()
{
    switch (DecorationSettings::instance()->doubleClickAction())
    {
        case TitleBarAction::ToggleMaximize:
            toggleMaximize();
            break;
        case TitleBarAction::Minimize:
            _window->showMinimized();
            break;
        case TitleBarAction::None:
            break;
    }
}

void WindowDecorations::toggleMaximize()
{
    if (_window->isFullScreen())
        return;
    if (_window->isMaximized())
        _window->showNormal();
    else
        _window->showMaximized();
}

void WindowDecorations::updateMargins()
{
    QWindow* handle = _window->windowHandle();
#ifdef CODA_WAYLAND_WINDOW_MARGINS
    auto* waylandWindow =
        handle ? handle->nativeInterface<QNativeInterface::Private::QWaylandWindow>() : nullptr;
    _drawShadow = waylandWindow != nullptr;
#endif

    // A maximized or full screen window meets the edges of the screen, so it has no
    // decoration.
    const bool edgeToEdge = _window->isMaximized() || _window->isFullScreen();
    const int width = edgeToEdge ? 0 : (_drawShadow ? kShadowWidth : kOutlineWidth);
    const QMargins margins(width, width, width, width);
    if (margins != _margins)
    {
        _margins = margins;
#ifdef CODA_WAYLAND_WINDOW_MARGINS
        if (waylandWindow)
            waylandWindow->setCustomMargins(margins);
#endif
        _window->setContentsMargins(margins);
        _window->update();
    }
    updateInputMask();
}

void WindowDecorations::updateInputMask()
{
    // The pointer reaches the windows behind the shadow, except in the band that resizes. Only
    // with a shadow: on X11 a mask would cut the drawing too.
    QWindow* handle = _window->windowHandle();
    if (!_drawShadow || !handle)
        return;
    if (_margins.isNull())
    {
        handle->setMask(QRegion());
        return;
    }
    const QRect content = _window->rect().marginsRemoved(_margins);
    handle->setMask(QRegion(content.adjusted(-kOutsideResizeBand, -kOutsideResizeBand,
                                             kOutsideResizeBand, kOutsideResizeBand)));
}

void WindowDecorations::paint()
{
    QPainter painter(_window);
    painter.setRenderHint(QPainter::Antialiasing);

    const QRectF content = QRectF(_window->rect()).marginsRemoved(QMarginsF(_margins));
    const qreal radius = _margins.isNull() ? 0 : kCornerRadius;

    // Paint shadow.
    if (_drawShadow && !_margins.isNull())
    {
        // Rings around the window, each one pixel wide and fainter than the one inside it.
        painter.setBrush(Qt::NoBrush);
        for (int ring = 1; ring <= _margins.left(); ++ring)
        {
            const qreal fade = 1.0 - qreal(ring) / (_margins.left() + 1);
            painter.setPen(QPen(QColor(0, 0, 0, qRound(shadowAlpha(_dark) * fade * fade)), 1));
            const qreal grow = ring - 0.5;
            painter.drawPath(
                roundedTopPath(content.adjusted(-grow, -grow, grow, grow), radius + grow));
        }
    }

    // Paint background and window content.
    painter.setPen(Qt::NoPen);
    painter.setBrush(coda::themeBackgroundColor(_dark));
    painter.drawPath(roundedTopPath(content, radius));

    // Fallback window outline if the shadow isn't drawn.
    if (!_drawShadow && !_margins.isNull())
    {
        painter.setBrush(Qt::NoBrush);
        painter.setPen(QPen(outlineColor(_dark), kOutlineWidth));
        const qreal grow = kOutlineWidth / 2.0;
        painter.drawPath(roundedTopPath(content.adjusted(-grow, -grow, grow, grow), radius + grow));
    }
}

Qt::Edges WindowDecorations::edgesAt(const QPoint& pos) const
{
    if (_margins.isNull())
        return {};

    const QRect content = _window->rect().marginsRemoved(_margins);
    const QRect outer = _drawShadow ? content.adjusted(-kOutsideResizeBand, -kOutsideResizeBand,
                                                   kOutsideResizeBand, kOutsideResizeBand)
                                : _window->rect();
    const QRect inner = _drawShadow ? content
                                : content.adjusted(kInsideResizeBand, kInsideResizeBand,
                                                   -kInsideResizeBand, -kInsideResizeBand);
    if (!outer.contains(pos) || inner.contains(pos))
        return {};

    Qt::Edges edges;
    if (pos.x() < inner.left())
        edges |= Qt::LeftEdge;
    else if (pos.x() > inner.right())
        edges |= Qt::RightEdge;
    if (pos.y() < inner.top())
        edges |= Qt::TopEdge;
    else if (pos.y() > inner.bottom())
        edges |= Qt::BottomEdge;

    // A corner reaches some way along both of its edges, so it is easy to catch.
    if (!(edges & (Qt::TopEdge | Qt::BottomEdge)))
    {
        if (pos.y() < content.top() + kCornerReach)
            edges |= Qt::TopEdge;
        else if (pos.y() > content.bottom() - kCornerReach)
            edges |= Qt::BottomEdge;
    }
    if (!(edges & (Qt::LeftEdge | Qt::RightEdge)))
    {
        if (pos.x() < content.left() + kCornerReach)
            edges |= Qt::LeftEdge;
        else if (pos.x() > content.right() - kCornerReach)
            edges |= Qt::RightEdge;
    }
    return edges;
}

void WindowDecorations::setEdgeCursor(Qt::Edges edges)
{
    if (edges == _cursorEdges)
        return;
    // An override cursor, as the web view under the band sets a cursor of its own on every move.
    if (_cursorEdges)
        QGuiApplication::restoreOverrideCursor();
    _cursorEdges = edges;
    if (!edges)
        return;

    Qt::CursorShape shape;
    if (edges == (Qt::TopEdge | Qt::LeftEdge) || edges == (Qt::BottomEdge | Qt::RightEdge))
        shape = Qt::SizeFDiagCursor;
    else if (edges == (Qt::TopEdge | Qt::RightEdge) || edges == (Qt::BottomEdge | Qt::LeftEdge))
        shape = Qt::SizeBDiagCursor;
    else if (edges & (Qt::LeftEdge | Qt::RightEdge))
        shape = Qt::SizeHorCursor;
    else
        shape = Qt::SizeVerCursor;
    QGuiApplication::setOverrideCursor(QCursor(shape));
}

bool WindowDecorations::handleMouse(QEvent* ev)
{
    auto* mouse = static_cast<QMouseEvent*>(ev);
    const QPoint pos = _window->mapFromGlobal(mouse->globalPosition().toPoint());

    if (ev->type() == QEvent::MouseMove)
    {
        // Don't interrupt drags that started inside the window.
        if (mouse->buttons() != Qt::NoButton)
            return false;
        const Qt::Edges edges = edgesAt(pos);
        setEdgeCursor(edges);
        return edges != Qt::Edges();
    }

    if (mouse->button() != Qt::LeftButton)
        return false;
    const Qt::Edges edges = edgesAt(pos);
    if (!edges)
        return false;
    // The compositor resizes the window from here, and gets the release too.
    if (QWindow* handle = _window->windowHandle())
        handle->startSystemResize(edges);
    return true;
}

bool WindowDecorations::eventFilter(QObject* obj, QEvent* ev)
{
    switch (ev->type())
    {
        case QEvent::MouseMove:
        case QEvent::MouseButtonPress:
        case QEvent::MouseButtonDblClick:
            if (obj->isWidgetType() && static_cast<QWidget*>(obj)->window() == _window)
                return handleMouse(ev);
            return false;
        default:
            break;
    }

    if (obj != _window)
        return false;

    switch (ev->type())
    {
        case QEvent::Paint:
            paint();
            return true;
        case QEvent::Show:
            // The platform window exists but isn't on the screen yet.
            updateMargins();
            break;
        case QEvent::Resize:
            updateInputMask();
            break;
        case QEvent::WindowStateChange:
            updateMargins();
            emit stateChanged(state(), isActive());
            break;
        case QEvent::ActivationChange:
            emit stateChanged(state(), isActive());
            break;
        case QEvent::Leave:
            setEdgeCursor({});
            break;
        default:
            break;
    }
    return false;
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
