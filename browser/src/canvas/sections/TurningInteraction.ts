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
	Turning the selection around its middle by the handle that sits above it. The handle is the
	client's own, the engine has none of the kind, so the turn is worked out here and what the
	engine is told at the end is a transformation of the objects.
*/
class TurningInteraction extends SelectionInteraction {
	/// The middle the selection turns around, in twips.
	private middle: cool.SimplePoint;

	/// The angle from that middle to the mouse when the turn began.
	private from: number;

	/// How far it has turned since, as the canvas counts angles.
	private turned: number = 0;

	constructor(
		selection: SelectionSection,
		middle: cool.SimplePoint,
		at: cool.SimplePoint,
	) {
		super(selection);

		this.middle = middle;
		this.from = TurningInteraction.angleAt(middle, at);
	}

	/// The angle from the middle to that point, as the canvas counts angles.
	private static angleAt(
		middle: cool.SimplePoint,
		point: cool.SimplePoint,
	): number {
		return Math.atan2(point.y - middle.y, point.x - middle.x);
	}

	/*
		Turns the objects of a selection around a point by that many degrees, counted against the
		clock, which is how the engine counts them. It is handed a transformation of the objects
		rather than a handle that moved, because the engine has no handle that turns them.
	*/
	public static turnObjects(middle: cool.SimplePoint, degrees: number): void {
		if (!degrees) return;

		app.map.sendUnoCommand('.uno:TransformDialog ', {
			TransformRotationDeltaAngle: {
				type: 'long',
				value: Math.round(degrees * 100),
			},
			TransformRotationX: { type: 'long', value: middle.x },
			TransformRotationY: { type: 'long', value: middle.y },
		});
	}

	public move(to: cool.SimplePoint): void {
		this.turned = TurningInteraction.angleAt(this.middle, to) - this.from;
		this.selection.redraw();
	}

	public finish(to: cool.SimplePoint): void {
		this.move(to);

		// The canvas counts an angle with the clock, the engine against it.
		TurningInteraction.turnObjects(this.middle, (-this.turned * 180) / Math.PI);
	}

	public transformation(): cool.Matrix2D | null {
		if (!this.turned) return null;

		return cool.Matrix2D.IDENTITY.rotateAround(
			this.middle.x,
			this.middle.y,
			this.turned,
		);
	}

	public handles(known: SelectionHandle[]): SelectionHandle[] {
		const matrix = cool.Matrix2D.IDENTITY.rotateAround(
			this.middle.x,
			this.middle.y,
			this.turned,
		);

		return known.map((handle: SelectionHandle) => ({
			...handle,
			point: matrix.apply(handle.point.x, handle.point.y).round(),
		}));
	}
}
