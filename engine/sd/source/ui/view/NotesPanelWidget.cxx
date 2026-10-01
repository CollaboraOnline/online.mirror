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

#include <NotesPanelWidget.hxx>
#include <NotesPanelView.hxx>

#include <editeng/outliner.hxx>
#include <vcl/event.hxx>
#include <vcl/jsdialog/executor.hxx>
#include <vcl/svapp.hxx>

namespace sd
{
namespace
{
/// The notes editor as seen from the client. Focus moves the panel in and out of editing, which
/// swaps the "Click to add Notes" placeholder for empty text and back.
class NotesPanelWidgetController final : public EditEngineWidgetController
{
    NotesPanelView& mrNotesPanelView;

public:
    NotesPanelWidgetController(NotesPanelView& rNotesPanelView, OutlinerView& rOutlinerView)
        : EditEngineWidgetController(rOutlinerView.GetEditView(), &rNotesPanelView.GetOutliner())
        , mrNotesPanelView(rNotesPanelView)
    {
    }

    /// An edit can arrive while the engine does not count the pane as focused, for example when
    /// the notes were freed while the client still showed them as held. The edit then takes the
    /// notes when they are free, and the read-only pane drops it when they are not.
    bool HandleCustomEvent(const OUString& rCmd, const OUString& rData) override
    {
        if ((rCmd == u"key" || rCmd == u"text") && !mrNotesPanelView.isInFocus())
        {
            SolarMutexGuard aGuard;
            mrNotesPanelView.onGrabFocus();
        }
        return EditEngineWidgetController::HandleCustomEvent(rCmd, rData);
    }

protected:
    sal_Int32 GetLockingViewId() override { return mrNotesPanelView.getLockingViewId(); }

    /// The notes are plain paragraphs, so Ctrl+Enter starts a new paragraph at the same level, as
    /// Enter does.
    KeyEvent AdjustKeyEvent(const KeyEvent& rKeyEvent) override
    {
        const vcl::KeyCode& rKeyCode = rKeyEvent.GetKeyCode();
        if (rKeyCode.GetCode() != KEY_RETURN || !rKeyCode.IsMod1())
            return rKeyEvent;

        const vcl::KeyCode aKeyCode(KEY_RETURN, rKeyCode.IsShift(), false, rKeyCode.IsMod2(),
                                    rKeyCode.IsMod3());
        return KeyEvent(rKeyEvent.GetCharCode(), aKeyCode, rKeyEvent.GetRepeat());
    }

    bool HandleExtraEvent(const OUString& rCmd, const OUString& /*rData*/) override
    {
        if (rCmd == u"focus")
            mrNotesPanelView.onGrabFocus();
        else if (rCmd == u"blur")
            mrNotesPanelView.onLoseFocus();
        else
            return false;

        // A focus change can clear or restore the placeholder, so the client gets the new text.
        QueueUpdate();
        return true;
    }
};
}

NotesPanelWidget::NotesPanelWidget(vcl::Window* pParent, NotesPanelView& rNotesPanelView,
                                   sal_uInt64 nKitWindowId)
    : InterimItemWindow(pParent, u"modules/simpress/ui/notespanel.ui"_ustr, u"NotesPanel"_ustr,
                        true, nKitWindowId)
    , mrNotesPanelView(rNotesPanelView)
{
    OutlinerView* pOutlinerView = rNotesPanelView.GetOutlinerView();
    if (!pOutlinerView)
        return;

    mxController = std::make_unique<NotesPanelWidgetController>(rNotesPanelView, *pOutlinerView);
    mxWidgetWeld
        = std::make_unique<weld::CustomClientWeld>(*m_xBuilder, u"notesedit"_ustr, *mxController);

    mrNotesPanelView.SetContentChangedHdl(LINK(this, NotesPanelWidget, ContentChangedHdl));

    InitControlBase(mxWidgetWeld->GetWidget());
}

NotesPanelWidget::~NotesPanelWidget() { disposeOnce(); }

void NotesPanelWidget::dispose()
{
    mrNotesPanelView.SetContentChangedHdl(Link<LinkParamNone*, void>());
    mxWidgetWeld.reset();
    mxController.reset();
    InterimItemWindow::dispose();
}

IMPL_LINK_NOARG(NotesPanelWidget, ContentChangedHdl, LinkParamNone*, void)
{
    if (mxController)
        mxController->QueueUpdate();
}

void NotesPanelWidget::SendInitialUpdate()
{
    if (weld::Widget* pWidget = mxWidgetWeld ? mxWidgetWeld->GetWidget() : nullptr)
        jsdialog::SendFullUpdate(*pWidget);
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
