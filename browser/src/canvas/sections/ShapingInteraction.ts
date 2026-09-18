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
	Dragging a handle that shapes the object itself: the corner radius of a rectangle and the
	points a custom shape is shaped by. What such a handle does to the object is the object's own
	business - a radius is not a transformation of it - so nothing is drawn of the object while
	it runs. The handle follows the mouse, and the engine is told where it was let go.
*/
class ShapingInteraction extends SelectionInteraction {
	/// The handle that was taken hold of.
	private handle: SelectionHandle;

	/// Where it has been taken, in twips.
	private at: cool.SimplePoint;

	constructor(
		selection: SelectionSection,
		handle: SelectionHandle,
		at: cool.SimplePoint,
	) {
		super(selection);

		this.handle = handle;
		this.at = at.clone();
	}

	public move(to: cool.SimplePoint): void {
		this.at = to.clone();
		this.selection.redraw();
	}

	public finish(to: cool.SimplePoint): void {
		this.move(to);

		app.map.sendUnoCommand('.uno:MoveShapeHandle', {
			...ShapeHandlesSection.handleParameters(this.handle),
			NewPosX: { type: 'long', value: this.at.x },
			NewPosY: { type: 'long', value: this.at.y },
		});
	}

	public handles(known: SelectionHandle[]): SelectionHandle[] {
		return known.map((one: SelectionHandle) =>
			one.name === this.handle.name
				? { ...one, point: new cool.Point(this.at.x, this.at.y) }
				: one,
		);
	}

	public leadingPoint(): cool.SimplePoint | null {
		return this.at.clone();
	}
}
