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
	worked out from the shape it started with and where the mouse is, and the handles keep their
	part of that shape while it runs.
*/
class ScalingInteraction extends SelectionInteraction {
	/// The handle that was taken hold of.
	private handle: SelectionHandle;

	/// The shape the selection had when it began: a middle, a width, a height and an angle.
	private shapeAtStart: any;

	/// Where each handle stood in the shape's own two directions, as a part of its width and of
	/// its height, so that it can be put where the shape now reaches.
	private places: { name: string; acrossPart: number; upPart: number }[] = [];

	/// The shape it would leave behind, null until the mouse has moved.
	private reached: any = null;

	constructor(
		selection: SelectionSection,
		handle: SelectionHandle,
		shapeAtStart: any,
	) {
		super(selection);

		this.handle = handle;
		this.shapeAtStart = shapeAtStart;

		if (!shapeAtStart?.width || !shapeAtStart.height) return;

		const turn = shapeAtStart.angleRadian;
		const cosine = Math.cos(turn);
		const sine = Math.sin(turn);

		for (const one of selection.knownHandles()) {
			const at = new cool.SimplePoint(one.point.x, one.point.y);
			// Counted from the middle of the shape, with the second one growing upwards.
			const across = at.pX - shapeAtStart.center.pX;
			const up = shapeAtStart.center.pY - at.pY;

			this.places.push({
				name: one.name,
				acrossPart: (across * cosine + up * sine) / (shapeAtStart.width * 0.5),
				upPart: (-across * sine + up * cosine) / (shapeAtStart.height * 0.5),
			});
		}
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
		const dragged = this.handles(this.selection.knownHandles()).find(
			(one: SelectionHandle) => one.name === this.handle.name,
		);
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

	public handles(known: SelectionHandle[]): SelectionHandle[] {
		const shape = this.reached;
		if (!shape) return known;

		const turn = shape.angleRadian;
		const cosine = Math.cos(turn);
		const sine = Math.sin(turn);

		return known.map((handle: SelectionHandle) => {
			const place = this.places.find((one: any) => one.name === handle.name);
			if (!place) return handle;

			// Its part of the shape, on the shape as the drag leaves it, turned back into the
			// directions of the page.
			const across = place.acrossPart * shape.width * 0.5;
			const up = place.upPart * shape.height * 0.5;

			const moved = cool.SimplePoint.fromCorePixels([
				shape.center.pX + across * cosine - up * sine,
				shape.center.pY - (across * sine + up * cosine),
			]);

			return { ...handle, point: new cool.Point(moved.x, moved.y) };
		});
	}
}
