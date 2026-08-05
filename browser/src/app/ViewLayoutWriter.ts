/* -*- js-indent-level: 8 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

class ViewLayoutWriter extends ViewLayoutBase {
	public readonly type: string = 'ViewLayoutWriter';

	constructor() {
		super();

		// On a mid-session swap into this layout (e.g. leaving multi-page or
		// compare-changes view) the file size is already known, so seed the
		// scrollable extent from it - the off-map path needs viewSize for
		// centering and vertical scrolling. On first construction during document
		// load fileSize is not set yet (optional chaining skips it) and
		// WriterTileLayer._setNewSize sets it from the first status.
		if (app.activeDocument?.fileSize?.x)
			this.viewSize = app.activeDocument.fileSize.clone();
	}

	// Writer places one continuous page column with the inherited single-window
	// machinery, centred horizontally when the page is narrower than the viewport.
	protected override usesSingleWindowView(): boolean {
		return true;
	}

	// Centre the page on its stable width. Vertical centring is
	// a no-op, and it folds into the viewed rectangle.
	protected override getCenteringOffset(): number[] {
		Util.ensureValue(app.activeDocument);

		const frame = this.frameSize;
		// Centre on fileSize, not viewSize: the comment section
		// inflates viewSize, and the page then jumps on scroll.
		const content = app.activeDocument.fileSize;
		if (content.pX <= 0) return [0, 0]; // before the first status

		const centerX = Math.max(0, Math.round((frame.pX - content.pX) / 2));
		const centerY = Math.max(0, Math.round((frame.pY - content.pY) / 2));
		return [centerX, centerY];
	}
}
