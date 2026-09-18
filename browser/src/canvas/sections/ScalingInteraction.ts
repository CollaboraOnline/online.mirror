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
	Scaling the selection by one of the eight handles that frame it. The shape it leads to is
	worked out from the shape it started with and where the mouse is, and everything it shows -
	the objects and every handle - goes through the one transformation that leads from the one
	shape to the other.
*/
class ScalingInteraction extends SelectionInteraction {
	/// The handle that was taken hold of.
	private handle: SelectionHandle;

	/// The shape the selection had when it began: a middle, a width, a height and an angle.
	private shapeAtStart: any;

	/// The shape it would leave behind, null until the mouse has moved.
	private reached: any = null;

	/*
		The corner radius of the object, in twips, taken from where its handle stood when the
		drag began: that handle sits on the upper side, that far from the upper left corner.
		Null where the object has no such handle.
	*/
	private radius: number | null = null;

	constructor(
		selection: SelectionSection,
		handle: SelectionHandle,
		shapeAtStart: any,
	) {
		super(selection);

		this.handle = handle;
		this.shapeAtStart = shapeAtStart;
		this.radius = ScalingInteraction.radiusOf(selection.knownHandles());
	}

	/// How far the handle for the corner radius stands from the upper left corner, in twips.
	private static radiusOf(handles: SelectionHandle[]): number | null {
		const corner = handles.find((one: SelectionHandle) => one.kind === '1');
		const radius = handles.find((one: SelectionHandle) => one.kind === '11');
		if (!corner || !radius) return null;

		return radius.point.subtract(corner.point).length();
	}

	/*
		The handle for the corner radius, laid out for the shape the drag leads to rather than
		carried along with the object: the radius keeps the size it has, so the handle stays
		that far from the upper left corner along the upper side, and it comes no further than
		half the longer side of the shape. That is the rule the object is drawn by.
	*/
	private placedRadius(mapped: SelectionHandle[]): SelectionHandle[] {
		if (this.radius === null || !this.reached) return mapped;

		const corner = mapped.find((one: SelectionHandle) => one.kind === '1');
		const along = mapped.find((one: SelectionHandle) => one.kind === '3');
		if (!corner || !along) return mapped;

		const upper = along.point.subtract(corner.point);
		const side = upper.length();
		if (!side) return mapped;

		const longer =
			Math.max(this.reached.width, this.reached.height) * app.pixelsToTwips;
		const kept = Math.min(this.radius, longer * 0.5);

		return mapped.map((one: SelectionHandle) =>
			one.kind === '11'
				? {
						...one,
						point: corner.point
							.add(upper.divideBy(side).multiplyBy(kept))
							.round(),
					}
				: one,
		);
	}

	/// The shape the mouse at that point leads to.
	private shapeFor(to: cool.SimplePoint, event: MouseEvent): any {
		return HandleScaling.shapeAfterDrag(
			to.clone(),
			this.shapeAtStart,
			this.handle.kind,
			HandleScaling.keepsRatio(event, false),
		);
	}

	public move(to: cool.SimplePoint, event: MouseEvent): void {
		if (GraphicSelection.extraInfo?.isResizable === false) return;
		if (!this.shapeAtStart) return;

		this.reached = this.shapeFor(to, event);

		// What may snap to another object of the page is the handle being dragged, taken where
		// the drag has it now.
		const dragged = this.draggedHandle();
		if (dragged) this.selection.lookForASnap(dragged);

		this.selection.redraw();
	}

	public finish(to: cool.SimplePoint, event: MouseEvent): void {
		if (!this.shapeAtStart) return;

		const keepRatio = HandleScaling.keepsRatio(event, false);
		const shape = this.shapeFor(to, event);

		const reached = cool.SimpleRectangle.fromCorePixels([
			shape.center.pX - shape.width * 0.5,
			shape.center.pY - shape.height * 0.5,
			shape.width,
			shape.height,
		]);

		// The engine counts the eight from zero, where a name counts the kinds from one.
		const committed = HandleScaling.committedHandle(
			String(Number(this.handle.kind) - 1),
			keepRatio,
		);
		const point = HandleScaling.positionOfHandle(committed, reached);

		// Where the ratio is free, the drag ends where the mouse is, or where it snapped to
		// another object of the page.
		if (!keepRatio) {
			const snapped = this.selection.snappedTo();
			point[0] = Math.round((snapped?.[0] ?? to.pX) * app.pixelsToTwips);
			point[1] = Math.round((snapped?.[1] ?? to.pY) * app.pixelsToTwips);
		}

		app.map.sendUnoCommand('.uno:MoveShapeHandle', {
			...ShapeHandlesSection.handleParameters({
				name: String(Number(committed) + 1) + '.0.0',
			}),
			NewPosX: { type: 'long', value: point[0] },
			NewPosY: { type: 'long', value: point[1] },
		});
	}

	/// The handle being dragged, where the drag has it now.
	private draggedHandle(): SelectionHandle | undefined {
		return this.handles(this.selection.knownHandles()).find(
			(one: SelectionHandle) => one.name === this.handle.name,
		);
	}

	public leadingPoint(): cool.SimplePoint | null {
		const dragged = this.draggedHandle();

		return dragged
			? new cool.SimplePoint(dragged.point.x, dragged.point.y)
			: null;
	}

	public transformation(): cool.Matrix2D | null {
		const from = this.shapeAtStart;
		const to = this.reached;
		if (!from || !to || !from.width || !from.height) return null;

		// From the middle it started at, upright, scaled along its own two directions, turned
		// back and on to the middle it reached.
		return cool.Matrix2D.IDENTITY.translate(-from.center.x, -from.center.y)
			.rotateAround(0, 0, from.angleRadian)
			.scale(to.width / from.width, to.height / from.height)
			.rotateAround(0, 0, -from.angleRadian)
			.translate(to.center.x, to.center.y);
	}

	/*
		Where the handles stand while the selection is scaled: every one of them through the
		transformation the drag stands for, which is the state the objects would be in when it
		ends. The eight that frame the selection land exactly where they belong, since they are
		the corners and the sides of that state, and the drawing of the objects goes through the
		very same transformation, so the two can never disagree. A handle that does not travel
		with the object that way is laid out afterwards by the rule of its own kind.
	*/
	public handles(known: SelectionHandle[]): SelectionHandle[] {
		const matrix = this.transformation();
		if (!matrix) return known;

		const mapped = known.map((handle: SelectionHandle) => ({
			...handle,
			point: matrix.apply(handle.point.x, handle.point.y).round(),
		}));

		return this.placedRadius(mapped);
	}
}
