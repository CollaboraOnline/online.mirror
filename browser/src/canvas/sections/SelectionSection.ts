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
	What is selected, drawn and worked on as one thing: a selected object, a selection of
	several of them, and later the editor of a path. It draws its own handles, says which of
	them lies under the mouse, carries the keyboard that travels them and runs the drag of the
	one that was taken hold of.

	It holds the handles as a list rather than giving each of them a piece of canvas of its own,
	so that a path with hundreds of points costs one of these and not hundreds.
*/
abstract class SelectionSection extends CanvasSectionObject {
	processingOrder: number =
		app.CSections.DefaultForDocumentObjects.processingOrder;
	drawingOrder: number =
		app.CSections.DefaultForDocumentObjects.drawingOrder + 1;
	zIndex: number = app.CSections.DefaultForDocumentObjects.zIndex;
	documentObject: boolean = true;

	/// The keyboard on the handles of this selection.
	public readonly travel: HandleTravel = new HandleTravel(() => this.handles());

	/// The handles as they were last worked out from the objects.
	private known: SelectionHandle[] = [];

	/// Where the handles stand while a drag is running, which is where the drag would leave
	/// them. Null while nothing is being dragged.
	private previewed: SelectionHandle[] | null = null;

	/// The handle a drag took hold of, null while none is being dragged.
	private dragged: SelectionHandle | null = null;

	/// The shape the selection had when the drag began, which every step of it works from.
	private shapeAtStart: any = null;

	/// Where each handle stood when the drag began, as a distance from the middle of the shape
	/// and the angle it lies at, so that it can be put where the shape now reaches.
	private placesAtStart: { name: string; distance: number; angle: number }[] =
		[];

	/// What has handles here. One object offers its own, a path offers its points.
	protected abstract sources(): HandleSource[];

	/// Works the handles out again from the objects as they stand, and covers them.
	public refresh(): void {
		this.known = this.sources().flatMap((source: HandleSource) =>
			source.handles(),
		);
		// A drag that is running keeps its picture of where the handles are going.
		if (!this.dragged) this.previewed = null;

		this.coverTheHandles();
	}

	/// The handles as they are drawn now: where a drag would leave them while one runs, where
	/// the objects put them otherwise.
	public handles(): SelectionHandle[] {
		return this.previewed ?? this.known;
	}

	/// Takes in every handle with the box it is drawn as, so that a press on one arrives here.
	private coverTheHandles(): void {
		if (!this.known.length) {
			this.size = [0, 0];
			return;
		}

		const box = ShapeHandlesSection.handleSize() * app.pixelsToTwips;
		const covered = cool.Range2D.fromPoints(
			this.known.map((handle: SelectionHandle) => handle.point),
		).expand(box, box);
		const area = new cool.SimpleRectangle(
			covered.minX,
			covered.minY,
			covered.width,
			covered.height,
		);

		this.setPosition(area.pX1, area.pY1);
		this.size = [area.pWidth, area.pHeight];
		this.boundingRectangle = cool.SimpleRectangle.fromCorePixels([
			...this.position,
			...this.size,
		]);
	}

	/// The handle whose box holds that point, which is where the mouse is on the canvas.
	private handleAt(x: number, y: number): SelectionHandle | undefined {
		const half = 0.5 * ShapeHandlesSection.handleSize();

		return this.handles().find((handle: SelectionHandle) => {
			const point = new cool.SimplePoint(handle.point.x, handle.point.y);
			return Math.abs(point.vX - x) <= half && Math.abs(point.vY - y) <= half;
		});
	}

	/*
		Cropping an image is done with a set of handles of its own, drawn and dragged the way a
		view that draws from tiles does it. This section keeps out of the way while that runs.
	*/
	private standsBack(): boolean {
		return GraphicSelection.extraInfo?.isCropMode === true;
	}

	/// A press lands here only where it is on a handle. Anywhere else within the selection
	/// belongs to whoever draws the object underneath.
	isHit(point: number[]): boolean {
		if (this.standsBack()) return false;

		return this.handleAt(point[0], point[1]) !== undefined;
	}

	/// Whether the handle is one of the eight that frame the selection, the ones that scale it.
	private framesTheSelection(handle: SelectionHandle): boolean {
		return Number(handle.kind) >= 1 && Number(handle.kind) <= 8;
	}

	onDraw(): void {
		if (this.standsBack()) return;

		this.context.save();
		this.context.setTransform(1, 0, 0, 1, 0, 0);

		const size = ShapeHandlesSection.handleSize();
		for (const handle of this.handles()) {
			const point = new cool.SimplePoint(handle.point.x, handle.point.y);
			// The handle the keyboard works on is drawn a third larger, at its larger half.
			const grown = this.travel.showsAsActive(handle.name) ? size / 3 : 0;

			this.context.beginPath();
			this.context.strokeStyle = 'black';

			if (this.framesTheSelection(handle)) {
				this.context.fillStyle = 'white';
				this.context.rect(
					point.vX - size * 0.5 - grown,
					point.vY - size * 0.5 - grown,
					size + 2 * grown,
					size + 2 * grown,
				);
			} else {
				this.context.fillStyle = 'yellow';
				this.context.arc(
					point.vX,
					point.vY,
					size * 0.5 + grown,
					0,
					Math.PI * 2,
				);
			}

			this.context.closePath();
			this.context.fill();
			this.context.stroke();
		}

		this.context.restore();
	}

	/// The section that knows the shape of the selection and shows what a drag would do to it.
	private shapeSection(): any {
		return GraphicSelection.handlesSection;
	}

	/// Where the mouse is in the document, in core pixels, from a point this section was given.
	private inTheDocument(point: cool.SimplePoint): cool.SimplePoint {
		const inDocument = point.clone();
		inDocument.pX += this.position[0];
		inDocument.pY += this.position[1];
		return inDocument;
	}

	onMouseDown(point: cool.SimplePoint, e: MouseEvent): void {
		this.dragged =
			this.handleAt(
				this.myTopLeft[0] + point.pX,
				this.myTopLeft[1] + point.pY,
			) ?? null;
		if (!this.dragged) return;

		const shape =
			this.shapeSection()?.sectionProperties.shapeRectangleProperties;
		this.shapeAtStart = shape
			? { ...shape, center: shape.center.clone() }
			: null;

		/*
			Where every handle stands in relation to the middle of the shape. A drag moves the
			middle and changes the size, and each handle keeps its distance and its angle, which
			is what carries it along.
		*/
		this.placesAtStart = [];
		if (this.shapeAtStart) {
			for (const handle of this.known) {
				const at = new cool.SimplePoint(handle.point.x, handle.point.y);
				const alongX = at.pX - this.shapeAtStart.center.pX;
				const alongY = this.shapeAtStart.center.pY - at.pY;

				this.placesAtStart.push({
					name: handle.name,
					distance: Math.sqrt(alongX * alongX + alongY * alongY),
					angle: Math.atan2(alongY, alongX) - this.shapeAtStart.angleRadian,
				});
			}
		}

		this.stopPropagating();
		e.stopPropagation();
	}

	/// The handles where the shape the drag leads to would put them.
	private placedOn(shape: any): SelectionHandle[] {
		return this.known.map((handle: SelectionHandle) => {
			const place = this.placesAtStart.find(
				(one: any) => one.name === handle.name,
			);
			if (!place) return handle;

			const angle = place.angle + shape.angleRadian;
			const moved = cool.SimplePoint.fromCorePixels([
				shape.center.pX + place.distance * Math.cos(angle),
				shape.center.pY - place.distance * Math.sin(angle),
			]);

			return { ...handle, point: new cool.Point(moved.x, moved.y) };
		});
	}

	/*
		The pointer over a handle: the direction that handle scales in, the hand that takes hold
		of one that shapes the object, and the sign that says no over an object that cannot be
		resized.
	*/
	private pointerOver(handle: SelectionHandle): string {
		if (!this.framesTheSelection(handle))
			return (
				'url(' + app.LOUtil.getURL('images/cursors/grab.svg') + ') 12 12, grab'
			);

		if (GraphicSelection.extraInfo?.isResizable === false) return 'not-allowed';

		const byKind: Record<string, string> = {
			'1': 'nwse-resize',
			'2': 'ns-resize',
			'3': 'nesw-resize',
			'4': 'ew-resize',
			'5': 'ew-resize',
			'6': 'nesw-resize',
			'7': 'ns-resize',
			'8': 'nwse-resize',
		};

		return byKind[handle.kind] ?? 'default';
	}

	onMouseMove(point: cool.SimplePoint, dragDistance: number[], e: MouseEvent) {
		if (!this.containerObject.isDraggingSomething() || !this.dragged) {
			const over = this.handleAt(
				this.myTopLeft[0] + point.pX,
				this.myTopLeft[1] + point.pY,
			);
			if (over) this.context.canvas.style.cursor = this.pointerOver(over);
			return;
		}

		this.stopPropagating();
		e.stopPropagation();

		if (GraphicSelection.extraInfo?.isResizable === false) return;

		if (this.framesTheSelection(this.dragged) && this.shapeAtStart) {
			const shape = HandleScaling.shapeAfterDrag(
				this.inTheDocument(point),
				this.shapeAtStart,
				this.dragged.kind,
				HandleScaling.keepsRatio(e, false),
			);

			// The handles follow the shape the drag leads to.
			this.previewed = this.placedOn(shape);
		}

		/*
			What may snap to another object of the page is the handle being dragged, taken where
			the drag has it now. It is a point, so there is no size to it and no distance left to
			travel: it is already where it is being asked about.
		*/
		const dragged = this.handles().find(
			(handle: SelectionHandle) => handle.name === this.dragged?.name,
		);
		if (dragged) {
			const half = 0.5 * ShapeHandlesSection.handleSize();
			const at = new cool.SimplePoint(dragged.point.x, dragged.point.y);
			this.shapeSection()?.checkHelperLinesAndSnapPoints(
				[0, 0],
				[at.pX - half, at.pY - half],
				[0, 0],
			);
		}

		this.containerObject.requestReDraw();
	}

	onMouseUp(point: cool.SimplePoint, e: MouseEvent): void {
		if (!this.containerObject.isDraggingSomething() || !this.dragged) {
			this.dragged = null;
			return;
		}

		this.stopPropagating();
		e.stopPropagation();

		const handle = this.dragged;
		const inDocument = this.inTheDocument(point);
		let parameters: any = {
			...ShapeHandlesSection.handleParameters(handle),
			NewPosX: { type: 'long', value: inDocument.x },
			NewPosY: { type: 'long', value: inDocument.y },
		};

		if (this.framesTheSelection(handle) && this.shapeAtStart) {
			const keepRatio = HandleScaling.keepsRatio(e, false);
			const shape = HandleScaling.shapeAfterDrag(
				inDocument,
				this.shapeAtStart,
				handle.kind,
				keepRatio,
			);

			const reached = cool.SimpleRectangle.fromCorePixels([
				shape.center.pX - shape.width * 0.5,
				shape.center.pY - shape.height * 0.5,
				shape.width,
				shape.height,
			]);

			// The engine counts the eight from zero, where a name counts the kinds from one.
			const committed = HandleScaling.committedHandle(
				String(Number(handle.kind) - 1),
				keepRatio,
			);
			const reachedPoint = HandleScaling.positionOfHandle(committed, reached);

			// Where the ratio is free, the drag ends where the mouse is, or where it snapped to
			// another object of the page.
			if (!keepRatio) {
				const snap = this.shapeSection()?.sectionProperties;
				reachedPoint[0] = Math.round(
					(snap?.closestX ?? inDocument.pX) * app.pixelsToTwips,
				);
				reachedPoint[1] = Math.round(
					(snap?.closestY ?? inDocument.pY) * app.pixelsToTwips,
				);
			}

			parameters = {
				...ShapeHandlesSection.handleParameters({
					name: String(Number(committed) + 1) + '.0.0',
				}),
				NewPosX: { type: 'long', value: reachedPoint[0] },
				NewPosY: { type: 'long', value: reachedPoint[1] },
			};
		}

		app.map.sendUnoCommand('.uno:MoveShapeHandle', parameters);

		this.endTheDrag();
	}

	onDragCancel(): void {
		this.endTheDrag();
	}

	/// Puts the handles back where the objects have them and takes the picture of the drag away.
	private endTheDrag(): void {
		this.dragged = null;
		this.previewed = null;
		this.shapeAtStart = null;
		this.placesAtStart = [];
		this.containerObject.requestReDraw();
	}
}
