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

	/*
		The upper side of the object: where it starts and which way it runs. The handle for the
		corner radius lives on it. Nothing where the client does not hold the framing handles.
	*/
	private upperSide(): { from: cool.Point; along: cool.Point } | undefined {
		const handles = this.selection.knownHandles();
		const corner = handles.find((one: SelectionHandle) => one.kind === '1');
		const end = handles.find((one: SelectionHandle) => one.kind === '3');
		if (!corner || !end) return undefined;

		const upper = end.point.subtract(corner.point);
		const side = upper.length();
		if (!side) return undefined;

		return { from: corner.point, along: upper.divideBy(side) };
	}

	/*
		How large a corner radius the mouse at that point asks for, in twips: how far along the
		upper side of the object it has come from the upper left corner, and never less than
		nothing. That is the rule the object itself reads a drag of this handle by.
	*/
	private radiusAsked(to: cool.SimplePoint): number | undefined {
		if (this.handle.kind !== '11') return undefined;

		const side = this.upperSide();
		if (!side) return undefined;

		return Math.max(
			0,
			new cool.Point(to.x, to.y).subtract(side.from).dot(side.along),
		);
	}

	/*
		Where the handle is drawn while it is dragged. A handle for a corner radius is drawn on
		the upper side at the radius it asks for, and no further than half the longer side of
		the object, which is where the object draws it. A handle a custom shape is shaped by
		follows the mouse, its own bounds being the shape's business and not known here.
	*/
	private shownAt(): cool.Point {
		const radius = this.radiusAsked(this.at);
		const side = this.upperSide();
		const shape = this.selection.shapeNow();
		if (radius === undefined || !side || !shape)
			return this.selection.holdTheDrag(
				this.handle,
				new cool.Point(this.at.x, this.at.y),
			);

		const kept = Math.min(
			radius,
			Math.max(shape.width, shape.height) * app.pixelsToTwips * 0.5,
		);

		return side.from.add(side.along.multiplyBy(kept)).round();
	}

	/// Where the engine is told the handle was let go: the radius that was asked for, which can
	/// be larger than the handle is drawn at, or the point itself for a handle without a rule.
	private letGoAt(): cool.Point {
		const radius = this.radiusAsked(this.at);
		const side = this.upperSide();
		if (radius === undefined || !side)
			return new cool.Point(this.at.x, this.at.y);

		return side.from.add(side.along.multiplyBy(radius)).round();
	}

	public move(to: cool.SimplePoint): void {
		this.at = to.clone();
		this.selection.redraw();
	}

	/*
		The drag ends where the mouse let go, and what the engine is told about it is the business
		of the group the handle belongs to: a handle the engine knows is named to it, a point of a
		path is named as a point of that path, a point to tie a connector to is moved.
	*/
	public finish(to: cool.SimplePoint): void {
		this.move(to);

		this.selection.handOverTheDrag(this.handle, this.letGoAt());
	}

	public handles(known: SelectionHandle[]): SelectionHandle[] {
		const shown = this.shownAt();

		// A point of a path carries its weights, and one weight can swing the other, so the
		// editor says where all three of them stand.
		const path = this.selection
			.pathEditor()
			?.handlesDuring(this.handle.name, shown, known);
		if (path) return path;

		return known.map((one: SelectionHandle) =>
			one.name === this.handle.name ? { ...one, point: shown } : one,
		);
	}

	public handleHeld(): SelectionHandle | null {
		return this.handle;
	}

	public leadingPoint(): cool.SimplePoint | null {
		const shown = this.shownAt();
		return new cool.SimplePoint(shown.x, shown.y);
	}

	/*
		The path the object would be drawn along while one of its points is dragged, which the
		editor of that path works out.
	*/
	public outline(): cool.ObjectPathPolygon[] | null {
		const path = this.selection
			.pathEditor()
			?.outlineFor(this.handle.name, this.shownAt());

		return path ?? this.selection.straightLineFrom(this.handle, this.shownAt());
	}
}
