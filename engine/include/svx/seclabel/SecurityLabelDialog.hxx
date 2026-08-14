/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#pragma once

#include <svx/svxdllapi.h>
#include <vcl/abstdlg.hxx>
#include <vcl/vclptr.hxx>

#include <memory>

namespace weld
{
class Window;
}

namespace svx::seclabel
{
class SecurityLabelTarget;

// Create the SPIF/STANAG security label dialog, wrapped for async execution. The
// per-app placement of markings (and the model access) is supplied by rTarget,
// which the returned dialog owns for its (async) lifetime. Each app builds its own
// target and hands it here; the dialog itself is app-agnostic.
SVX_DLLPUBLIC VclPtr<VclAbstractDialog>
CreateSecurityLabelDialog(weld::Window* pParent, std::unique_ptr<SecurityLabelTarget> pTarget);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
