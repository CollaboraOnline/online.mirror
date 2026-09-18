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
	public readonly travel: HandleTravel = new HandleTravel(
		() => this.handles(),
		(handle: SelectionHandle, towards: cool.Point, event: KeyboardEvent) =>
			this.moveHandleBy(handle, towards, event),
	);

	/// The handles as they were last worked out from the objects.
	private known: SelectionHandle[] = [];

	/// What a drag is doing to the selection, null while nothing is being dragged.
	private interaction: SelectionInteraction | null = null;

	/// A press waiting to be handed to the engine, kept so that a second press can drop it.
	private pendingClick: any = null;

	/*
		The kind that names the handle which turns the selection. The client makes that handle
		itself: the engine has no handle of the kind, and what it is told at the end of a turn is
		a transformation of the objects.
	*/
	public static readonly turningKind: string = 'rotate';

	/// How far above the selection the handle that turns it sits, in core pixels.
	private static readonly turningDistance: number = 30;

	/// What has handles here. One object offers its own, a path offers its points.
	protected abstract sources(): HandleSource[];

	/// Works the handles out again from the objects as they stand, and covers them.
	public refresh(): void {
		this.known = this.sources().flatMap((source: HandleSource) =>
			source.handles(),
		);

		const turning = this.turningHandle();
		if (turning) this.known.push(turning);
		this.coverTheHandles();
	}

	/*
		The middle of what is selected, from the two handles that frame it across the diagonal.
		Nothing where the client did not work the framing handles out.
	*/
	private middle(): cool.SimplePoint | undefined {
		const upperLeft = this.known.find(
			(one: SelectionHandle) => one.kind === '1',
		);
		const lowerRight = this.known.find(
			(one: SelectionHandle) => one.kind === '8',
		);
		if (!upperLeft || !lowerRight) return undefined;

		return new cool.SimplePoint(
			(upperLeft.point.x + lowerRight.point.x) * 0.5,
			(upperLeft.point.y + lowerRight.point.y) * 0.5,
		);
	}

	/*
		The handle that turns the selection, above the middle of its upper side and away from it
		by the same distance whatever the zoom. It turns with the selection, being placed from
		the handles that frame it. Nothing where the objects say they cannot be turned.
	*/
	private turningHandle(): SelectionHandle | undefined {
		if (GraphicSelection.extraInfo?.isRotatable === false) return undefined;

		const middle = this.middle();
		const above = this.known.find((one: SelectionHandle) => one.kind === '2');
		if (!middle || !above) return undefined;

		const away = SelectionSection.turningDistance * app.dpiScale;
		const out = new cool.Point(
			above.point.x - middle.x,
			above.point.y - middle.y,
		);
		const length = out.length();
		if (!length) return undefined;

		const step = cool.SimplePoint.fromCorePixels([away, away]);

		return {
			name: SelectionSection.turningKind,
			kind: SelectionSection.turningKind,
			pointer: '0',
			point: new cool.Point(
				above.point.x + (out.x / length) * step.x,
				above.point.y + (out.y / length) * step.y,
			).round(),
		};
	}

	/// The handles as they are drawn now: where a drag would leave them while one runs, where
	/// the objects put them otherwise.
	public handles(): SelectionHandle[] {
		return this.interaction?.handles(this.known) ?? this.known;
	}

	/// The handles as the objects have them, which is what an interaction works from.
	public knownHandles(): SelectionHandle[] {
		return this.known;
	}

	/// Asks for the page to be drawn again, after something moved under an interaction.
	public redraw(): void {
		this.containerObject.requestReDraw();
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

	/*
		The four corners of the selection, in the order they go round it, in view pixels. Empty
		where the client did not work the framing handles out.
	*/
	private cornersInView(): cool.Point[] {
		return ['1', '3', '8', '6']
			.map((kind: string) =>
				this.handles().find((handle: SelectionHandle) => handle.kind === kind),
			)
			.filter((handle): handle is SelectionHandle => handle !== undefined)
			.map((handle: SelectionHandle) => {
				const point = new cool.SimplePoint(handle.point.x, handle.point.y);
				return new cool.Point(point.vX, point.vY);
			});
	}

	/*
		Whether that point lies within the selection. The four corners go round it in order, so
		a point inside is on the same side of every one of the four edges. It holds for a
		selection that is turned as well as for one that is upright.
	*/
	private within(x: number, y: number): boolean {
		const corners = this.cornersInView();
		if (corners.length !== 4) return false;

		const pressed = new cool.Point(x, y);
		let left = false;
		let right = false;

		for (let at = 0; at < 4; ++at) {
			const one = corners[at];
			const next = corners[(at + 1) % 4];
			const side = next.subtract(one).cross(pressed.subtract(one));

			if (side > 0) right = true;
			if (side < 0) left = true;
		}

		return !(left && right);
	}

	/*
		A press lands here where it is on a handle, and where it is on the selection itself,
		which is what carrying it begins with. Everywhere else it goes to whoever draws the page.
	*/
	isHit(point: number[]): boolean {
		if (this.standsBack()) return false;

		return (
			this.handleAt(point[0], point[1]) !== undefined ||
			this.within(point[0], point[1])
		);
	}

	/// Whether the handle is one of the eight that frame the selection, the ones that scale it.
	private framesTheSelection(handle: SelectionHandle): boolean {
		return Number(handle.kind) >= 1 && Number(handle.kind) <= 8;
	}

	/*
		Draws the dashed line around what is selected, through the four corners the framing
		handles sit on. They follow whatever is being done to the selection, so the line turns
		with a turn and grows with a scale.
	*/
	private drawTheFrame(): void {
		const corners = this.cornersInView();
		if (corners.length !== 4) return;

		this.context.save();
		this.context.setTransform(1, 0, 0, 1, 0, 0);
		this.context.strokeStyle = app.map.uiManager.isBackgroundDark()
			? 'white'
			: 'black';
		this.context.setLineDash([3, 3]);
		this.context.beginPath();

		corners.forEach((corner: cool.Point, at: number) => {
			if (at === 0) this.context.moveTo(corner.x, corner.y);
			else this.context.lineTo(corner.x, corner.y);
		});

		this.context.closePath();
		this.context.stroke();
		this.context.setLineDash([]);
		this.context.restore();
	}

	onDraw(): void {
		if (this.standsBack()) return;

		this.drawTheInteraction();
		this.drawTheFrame();

		this.context.save();
		this.context.setTransform(1, 0, 0, 1, 0, 0);

		const size = ShapeHandlesSection.handleSize();
		for (const handle of this.handles()) {
			const point = new cool.SimplePoint(handle.point.x, handle.point.y);
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
				this.context.fillStyle =
					handle.kind === SelectionSection.turningKind ? 'white' : 'yellow';
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

	/*
		Draws what a running interaction would leave behind: the objects of the selection, as
		they draw themselves, with the transformation it stands for over them. Half see-through,
		so that what lies under them stays readable.
	*/
	private drawTheInteraction(): void {
		const matrix = this.interaction?.transformation();
		if (!matrix) return;

		const data = RenderGeometrySection.currentPart();
		if (!data) return;

		this.context.save();
		this.context.setTransform(1, 0, 0, 1, 0, 0);

		// The point at the very start of the document says where the drawing of the part begins
		// on the canvas, and a twip is that many pixels wide.
		const origin = new cool.SimplePoint(0, 0);
		this.context.translate(origin.vX, origin.vY);
		this.context.scale(app.twipsToPixels, app.twipsToPixels);
		this.context.globalAlpha = 0.5;

		RenderManager.renderObjectsWith(
			this.context,
			data,
			this.selectedObjects(),
			matrix,
		);

		this.context.restore();
	}

	/// Which objects the selection holds, so that an interaction can draw them.
	protected abstract selectedObjects(): number[];

	/*
		The pointer over a handle: the direction that handle scales in, the hand that takes hold
		of one that shapes the object, the hand that turns the selection, and the sign that says
		no over an object that cannot be resized.
	*/
	private pointerOver(handle: SelectionHandle): string {
		if (handle.kind === SelectionSection.turningKind) return 'pointer';

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

	/// The section that holds what the older path knows about the selection: the shape it has
	/// and what a drag of it could snap to.
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

	/// Looks for something on the page that the handle could snap to, and marks it.
	public lookForASnap(handle: SelectionHandle): void {
		const half = 0.5 * ShapeHandlesSection.handleSize();
		const at = new cool.SimplePoint(handle.point.x, handle.point.y);

		// A point is asked about, so there is no size to it and no distance left to travel.
		this.shapeSection()?.checkHelperLinesAndSnapPoints(
			[0, 0],
			[at.pX - half, at.pY - half],
			[0, 0],
		);
	}

	/// Where the last look for a snap landed, in core pixels, or nothing on either side that
	/// found nothing to snap to.
	public snappedTo(): (number | null)[] | null {
		const snap = this.shapeSection()?.sectionProperties;
		if (!snap) return null;

		return [snap.closestX, snap.closestY];
	}

	/*
		Looks for something on the page that the whole selection could line up with, from where
		the move has taken it, and marks it. The distance is in core pixels.
	*/
	public lookForASnapOfTheWhole(across: number, down: number): void {
		this.shapeSection()?.checkHelperLinesAndSnapPoints(
			this.selectionSize(),
			this.selectionCorner(),
			[across, down],
		);
	}

	/*
		Where the upper left corner of the selection ends up, in core pixels: where the move
		would put it, or where it snapped to another object of the page. What snapped is a point
		of the selection, its middle or an edge, so the older section says how far that point
		lies from the corner.
	*/
	public snappedCorner(x: number, y: number): number[] {
		const section = this.shapeSection();
		const snap = section?.sectionProperties;
		if (!snap) return [x, y];

		return [
			snap.closestX !== null && snap.closestX !== undefined
				? section.adjustSnapTransformCoordinate(snap.closestX, null)
				: x,
			snap.closestY !== null && snap.closestY !== undefined
				? section.adjustSnapTransformCoordinate(null, snap.closestY)
				: y,
		];
	}

	/// The upper left corner of the selection, in core pixels.
	public selectionCorner(): number[] {
		const rectangle = GraphicSelection.rectangle;
		return rectangle ? [rectangle.pX1, rectangle.pY1] : this.position;
	}

	/// How wide and how high the selection is, in core pixels.
	private selectionSize(): number[] {
		const rectangle = GraphicSelection.rectangle;
		return rectangle ? [rectangle.pWidth, rectangle.pHeight] : this.size;
	}

	/*
		How far a key turns the selection, in degrees: one of them, fifteen with Shift, which is
		the step the office holds a turn to, and a tenth with Alt for the finest of it.
	*/
	private static turningStep(event: KeyboardEvent): number {
		if (event.shiftKey) return 15;
		if (event.altKey) return 0.1;
		return 1;
	}

	/*
		Moves a handle as a key asks: a handle that shapes the selection goes where the key
		points, the handle that turns it turns the selection around its middle instead. Answers
		where the handle lands, and nothing where it goes nowhere of its own.
	*/
	private moveHandleBy(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.SimplePoint | null {
		if (handle.kind === SelectionSection.turningKind) {
			const middle = this.middle();
			// The keys that point left and up turn against the clock, the others with it.
			const against = towards.x < 0 || towards.y < 0;
			if (middle)
				TurningInteraction.turnObjects(
					middle,
					SelectionSection.turningStep(event) * (against ? 1 : -1),
				);
			return null;
		}

		const step = HandleTravel.stepFor(event);
		const to = new cool.SimplePoint(
			handle.point.x + towards.x * step,
			handle.point.y + towards.y * step,
		);

		app.map.sendUnoCommand('.uno:MoveShapeHandle', {
			...ShapeHandlesSection.handleParameters(handle),
			NewPosX: { type: 'long', value: to.x },
			NewPosY: { type: 'long', value: to.y },
		});

		return to;
	}

	/*
		Carrying the selection through a press that landed before this section was there: on an
		object nobody had selected, which the press selects. The section that took that press
		drives it, since the mouse belongs to that one until it is let go.
	*/
	public beginCarrying(at: cool.SimplePoint): void {
		this.interaction = new MovingInteraction(this, at);
	}

	public carryTo(to: cool.SimplePoint): void {
		this.interaction?.move(to);
	}

	public finishCarrying(to: cool.SimplePoint): void {
		this.interaction?.finish(to);
		this.endTheInteraction();
	}

	public cancelCarrying(): void {
		this.interaction?.cancel();
		this.endTheInteraction();
	}

	/// The interaction a press on that handle begins, or nothing where the handle begins none.
	private interactionFor(
		handle: SelectionHandle,
		at: cool.SimplePoint,
	): SelectionInteraction | null {
		if (handle.kind === SelectionSection.turningKind) {
			const middle = this.middle();
			return middle ? new TurningInteraction(this, middle, at) : null;
		}

		if (!this.framesTheSelection(handle)) return null;

		const shape =
			this.shapeSection()?.sectionProperties.shapeRectangleProperties;

		return shape
			? new ScalingInteraction(this, handle, {
					...shape,
					center: shape.center.clone(),
				})
			: null;
	}

	onMouseDown(point: cool.SimplePoint, e: MouseEvent): void {
		const at = this.inTheDocument(point);
		const handle = this.handleAt(
			this.myTopLeft[0] + point.pX,
			this.myTopLeft[1] + point.pY,
		);

		if (handle) this.interaction = this.interactionFor(handle, at);
		else if (GraphicSelection.extraInfo?.isDraggable !== false)
			this.interaction = new MovingInteraction(this, at);

		this.stopPropagating();
		e.stopPropagation();
	}

	onMouseMove(point: cool.SimplePoint, dragDistance: number[], e: MouseEvent) {
		if (!this.containerObject.isDraggingSomething() || !this.interaction) {
			const over = this.handleAt(
				this.myTopLeft[0] + point.pX,
				this.myTopLeft[1] + point.pY,
			);
			if (over) this.context.canvas.style.cursor = this.pointerOver(over);
			return;
		}

		this.stopPropagating();
		e.stopPropagation();

		this.interaction.move(this.inTheDocument(point), e);

		/*
			The view follows the point the drag is led by, so that a drag which reaches past the
			edge brings the view with it. It is scrolled by the shortest way that shows that
			point again, once for each move the mouse makes: a view that scrolled on by itself
			would move the document under a mouse that is standing still, and the drag would run
			away from under it.
		*/
		const leading = this.interaction.leadingPoint();
		if (leading) GraphicSelection.scrollPointIntoView(leading);
	}

	onMouseUp(point: cool.SimplePoint, e: MouseEvent): void {
		if (!this.containerObject.isDraggingSomething() || !this.interaction) {
			this.interaction = null;
			return;
		}

		this.stopPropagating();
		e.stopPropagation();

		this.interaction.finish(this.inTheDocument(point), e);
		this.endTheInteraction();
	}

	/*
		A press that was not a drag. It is handed to the engine as a press of its own, a moment
		later, so that a press that turns out to be the first half of a double one can still be
		called off: the engine would otherwise have selected something else before the text edit
		of the double press could begin.
	*/
	onClick(point: cool.SimplePoint, e: MouseEvent): void {
		const at = this.inTheDocument(point);
		const modifier = MouseControl.readModifier(e);

		this.forgetThePendingClick();

		this.pendingClick = app.timerRegistry.setTimeout(
			'selectionClick',
			() => {
				app.map._docLayer._postMouseEvent(
					'buttondown',
					at.x,
					at.y,
					1,
					1,
					modifier,
				);
				app.map._docLayer._postMouseEvent(
					'buttonup',
					at.x,
					at.y,
					1,
					1,
					modifier,
				);
				this.pendingClick = null;
			},
			250,
		);

		this.stopPropagating();
		e.stopPropagation();
	}

	/// A press of two, which starts the text edit of the object underneath.
	onDoubleClick(point: cool.SimplePoint, e: MouseEvent): void {
		const at = this.inTheDocument(point);

		this.forgetThePendingClick();

		app.map._docLayer._postMouseEvent('buttondown', at.x, at.y, 2, 1, 0);
		app.map._docLayer._postMouseEvent('buttonup', at.x, at.y, 2, 1, 0);

		this.stopPropagating();
		e.stopPropagation();
	}

	/// Drops a press that is waiting to be handed over, because a second one took its place.
	private forgetThePendingClick(): void {
		if (this.pendingClick === null) return;

		app.timerRegistry.clearTimeout(this.pendingClick);
		this.pendingClick = null;
	}

	onDragCancel(): void {
		this.interaction?.cancel();
		this.endTheInteraction();
	}

	/// Lets the interaction go, puts the handles back where the objects have them and takes the
	/// lines that marked a snap away with it.
	private endTheInteraction(): void {
		this.interaction = null;
		this.shapeSection()?.forgetTheSnap();
		app.map.fire('scrollvelocity', { vx: 0, vy: 0 });
		this.containerObject.requestReDraw();
	}
}
