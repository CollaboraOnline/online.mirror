/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 */
#pragma once

#include <swdllapi.h>
#include <docsh.hxx>
#include <docmodel/theme/ColorSet.hxx>
#include <svx/theme/IThemeColorChanger.hxx>

class SfxItemSet;
class SvxBoxItem;
class SwDoc;

namespace sw
{
/// The color set of the document's theme. A document without a drawing model has no theme
/// yet; then the color set a new drawing model would get, so that the same names resolve to
/// the same colors before and after the model exists.
SW_DLLPUBLIC model::ColorSet const& GetDocumentThemeColors(const SwDoc& rDoc);

/// Give every theme color among the set's background, box and text color items the value the
/// color set has for it, keeping the theme reference. Returns whether any value changed.
SW_DLLPUBLIC bool ResolveThemeColors(SfxItemSet& rSet, model::ColorSet const& rColorSet);

/// The same for the lines of one box item.
SW_DLLPUBLIC bool ResolveThemeColors(SvxBoxItem& rBox, model::ColorSet const& rColorSet);

/// Resolve every table that follows a live table style again, against the document theme's
/// current colors.
void ResolveLiveTableStyles(SwDoc& rDoc);

class SW_DLLPUBLIC ThemeColorChanger : public svx::IThemeColorChanger
{
private:
    SwDocShell* mpDocSh;

public:
    ThemeColorChanger(SwDocShell* pDocSh);
    virtual ~ThemeColorChanger() override;

    void doApply(std::shared_ptr<model::ColorSet> const& pColorSet) override;
};

} // end sw namespace

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
