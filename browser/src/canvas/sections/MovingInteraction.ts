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
	Moving the whole selection, as taking hold of an object and carrying it does. It is the one
	interaction that is not begun by a press on a handle, so while the press on the object still
	belongs to the older section, that section drives this one and sends the command that ends
	it. What is drawn while it runs is worked out here like every other interaction.
*/
class MovingInteraction extends SelectionInteraction {
	/// Where the mouse was in the document when the move began, in twips.
	private from: cool.SimplePoint;

	/// How far it has come since, in twips.
	private across: number = 0;
	private down: number = 0;

	constructor(selection: SelectionSection, at: cool.SimplePoint) {
		super(selection);

		this.from = at.clone();
	}

	public move(to: cool.SimplePoint): void {
		this.across = to.x - this.from.x;
		this.down = to.y - this.from.y;
		this.selection.redraw();
	}

	/*
		The command that lays the move on the objects is sent by the section that owns the press,
		which knows what the move snapped to. It moves here when the press does.
	*/
	public finish(to: cool.SimplePoint): void {
		this.move(to);
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
