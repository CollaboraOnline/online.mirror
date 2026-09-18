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

/*
	Moving the whole selection, as taking hold of an object and carrying it does. It is begun by
	a press on the object itself rather than on a handle, and it ends by telling the engine where
	the selection now stands.
*/
class MovingInteraction extends SelectionInteraction {
	/// Where the mouse was in the document when the move began, in twips.
	private from: cool.SimplePoint;

	/// Where the mouse was told to be last, which the view keeps in sight.
	private at: cool.SimplePoint;

	/// How far it has come since, in twips.
	private across: number = 0;
	private down: number = 0;

	constructor(selection: SelectionSection, at: cool.SimplePoint) {
		super(selection);

		this.from = at.clone();
		this.at = at.clone();
	}

	public move(to: cool.SimplePoint): void {
		this.at = to.clone();
		this.across = to.x - this.from.x;
		this.down = to.y - this.from.y;

		// What the selection could line up with, from where the move has taken it.
		this.selection.lookForASnapOfTheWhole(
			this.across * app.twipsToPixels,
			this.down * app.twipsToPixels,
		);

		this.selection.redraw();
	}

	/*
		Tells the engine where the selection now stands: the corner it started at, moved by as
		much as the mouse moved, or the place it snapped to. The engine is handed a position, not
		a drag of its own.
	*/
	public finish(to: cool.SimplePoint): void {
		this.move(to);

		if (!this.across && !this.down) return;

		// Where the selection stands is read now rather than when the move began: nothing has
		// moved it in the meantime, and a selection made by the press itself is known by now.
		const corner = this.selection.selectionCorner();
		const stands = this.selection.snappedCorner(
			corner[0] + this.across * app.twipsToPixels,
			corner[1] + this.down * app.twipsToPixels,
		);

		app.map.sendUnoCommand('.uno:TransformDialog', {
			TransformPosX: {
				type: 'long',
				value: Math.round(stands[0] * app.pixelsToTwips),
			},
			TransformPosY: {
				type: 'long',
				value: Math.round(stands[1] * app.pixelsToTwips),
			},
		});
	}

	public leadingPoint(): cool.SimplePoint | null {
		return this.at.clone();
	}

	public transformation(): cool.Matrix2D | null {
		if (!this.across && !this.down) return null;

		return cool.Matrix2D.IDENTITY.translate(this.across, this.down);
	}

	public handles(known: SelectionHandle[]): SelectionHandle[] {
		const matrix = this.transformation();
		if (!matrix) return known;

		return known.map((handle: SelectionHandle) => ({
			...handle,
			point: matrix.apply(handle.point.x, handle.point.y),
		}));
	}
}
