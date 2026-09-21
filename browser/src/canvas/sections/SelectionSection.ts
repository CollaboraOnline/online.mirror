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

	/// The handles as they were last worked out from the objects of the selection.
	private known: SelectionHandle[] = [];

	/// The object an end of a connector is being dragged onto, or null while none is aimed at.
	private aimingAt: number | null = null;

	/// The groups of handles this selection has, in the order that says how they are walked,
	/// drawn and reached by a press. Made again whenever the handles are worked out afresh.
	private groupsHeld: HandleGroup[] | null = null;

	/// The path of a single selected object, with the points and the weights that shape it, or
	/// null where what is selected has no path.
	private editor: PolyPolygonEditor | null = null;

	/// The handle the mouse is over, marked so, or null while it is over none.
	private hovered: string | null = null;

	/// What a drag is doing to the selection, null while nothing is being dragged.
	private interaction: SelectionInteraction | null = null;

	/// What a drag of this selection can line up with on the page, and the lines that mark it.
	public readonly snap: SelectionSnap = new SelectionSnap();

	/// A press waiting to be handed to the engine, kept so that a second press can drop it.
	private pendingClick: any = null;

	/// Whether the press that is being answered landed on a handle. Such a press is never a
	/// press on the page, however short it turns out to be.
	private pressedAHandle: boolean = false;

	/// The handle a press took hold of, kept so that a press that turns out to be a click can
	/// put the keyboard on it.
	private pressedHandle: SelectionHandle | null = null;

	/// The group that took the press, which says what a click on that place means.
	private pressedGroup: HandleGroup | null = null;

	/*
		The kind that names the handle which turns the selection. The client makes that handle
		itself: the engine has no handle of the kind, and what it is told at the end of a turn is
		a transformation of the objects.
	*/
	public static readonly turningKind: string = 'rotate';

	/// The colors the handles are drawn in.
	private static readonly framingColour: string = '#FFFFFF';
	private static readonly shapingColour: string = '#FFFF00';
	private static readonly pathColour: string = '#1C99E0';
	/*
		A point to tie a connector to is drawn in a dimmed red: it is offered while something else
		is being done and should not shout over the handles beside it. The four an object falls
		back on take the same red darker again, so the ones it was given stand out from them.
	*/
	private static readonly gluePointColour: string = '#B03A3A';
	private static readonly defaultGluePointColour: string =
		SelectionSection.darker(SelectionSection.gluePointColour, 0.6);

	/*
		The color that marks the handle the mouse is over: the handle's own color with its
		light turned up, or turned down where it is light already, so that the mark stands out
		from it whatever color that is. Nothing else about the handle changes.
	*/
	public static underTheMouse(color: string): string {
		const of = (at: number) => parseInt(color.substr(at, 2), 16) / 255;
		const red = of(1);
		const green = of(3);
		const blue = of(5);

		const light = Math.max(red, green, blue);
		const shade = light > 0.6 ? 0.55 : 1.8;

		const back = (one: number) =>
			Math.round(Math.min(1, one * shade) * 255)
				.toString(16)
				.padStart(2, '0');

		return '#' + back(red) + back(green) + back(blue);
	}

	/// That color with its light turned down by that much, as a hexadecimal color again.
	public static darker(color: string, by: number): string {
		const of = (at: number) => parseInt(color.substr(at, 2), 16);
		const down = (value: number) =>
			Math.round(value * by)
				.toString(16)
				.padStart(2, '0');

		return '#' + down(of(1)) + down(of(3)) + down(of(5));
	}

	/// How far above the selection the handle that turns it sits, in core pixels.
	private static readonly turningDistance: number = 30;

	/*
		The groups of handles of this selection, in order. The last one is the object itself,
		which holds no handle and takes a press that reached none.
	*/
	protected groups(): HandleGroup[] {
		if (!this.groupsHeld)
			this.groupsHeld = [
				new FramingHandles(this),
				new TurningHandle(this),
				new ShapingHandles(this),
				new TiePointHandles(this),
				new PathHandles(this),
				this.theConnector() === undefined
					? new TheObjectItself(this)
					: new TheConnectorItself(this),
			];

		return this.groupsHeld;
	}

	/// The group a handle belongs to, or nothing for a handle of no group.
	private groupOf(handle: SelectionHandle): HandleGroup | undefined {
		return this.groups().find(
			(group: HandleGroup) => group.name === handle.group,
		);
	}

	/// Works the handles out again from the objects as they stand, and covers them.
	public refresh(): void {
		/*
			A connector is held by a group of its own, and whether what is selected is one is
			known once the object has arrived, so the groups are made again here. The path of the
			object goes the same way: the group that holds its points asks for it.
		*/
		this.groupsHeld = null;

		const objects = this.selectedObjects();
		this.editor =
			objects.length === 1 && RenderGeometrySection.objectOf(objects[0])?.path
				? new PolyPolygonEditor(objects[0])
				: null;

		// Every handle is marked with the group it came from, so that whatever is done to it
		// afterwards is done by the group that knows it.
		const worked = this.groups().flatMap((group: HandleGroup) =>
			group
				.handles()
				.map((handle: SelectionHandle) => ({ ...handle, group: group.name })),
		);

		/*
			The objects are what the handles are worked out from, and a selection can be reported
			before the objects it stands on have arrived. Holding on to the handles we had says
			something slightly old for a moment, where dropping them says the selection is gone -
			and the update that brings the objects puts them right.
		*/
		if (!worked.length && this.known.length) return;

		this.known = worked;
		this.coverTheHandles();
	}

	/*
		The middle of what is selected, from the two handles that frame it across the diagonal.
		Nothing where the client did not work the framing handles out.
	*/
	public middle(): cool.SimplePoint | undefined {
		return SelectionSection.middleOf(this.handles());
	}

	/// The middle of the selection as those handles frame it.
	public static middleOf(
		shown: SelectionHandle[],
	): cool.SimplePoint | undefined {
		const upperLeft = shown.find((one: SelectionHandle) => one.kind === '1');
		const lowerRight = shown.find((one: SelectionHandle) => one.kind === '8');
		if (!upperLeft || !lowerRight) return undefined;

		return new cool.SimplePoint(
			(upperLeft.point.x + lowerRight.point.x) * 0.5,
			(upperLeft.point.y + lowerRight.point.y) * 0.5,
		);
	}

	/// The handles as they are drawn now: where a drag would leave them while one runs, where
	/// the objects put them otherwise.
	public handles(): SelectionHandle[] {
		const shown = this.interaction?.handles(this.known) ?? this.known;

		/*
			Group by group, in the order the groups stand in, and each of them is given the chance
			to lay its own handles out for the state a drag leads to: the one that turns the
			selection keeps its distance from the upper side however the selection is scaled, and
			the points to tie to follow the object under the mouse rather than the drag.
		*/
		return this.groups().flatMap((group: HandleGroup) => {
			const placed = group.place(shown);
			if (placed)
				return placed.map((handle: SelectionHandle) => ({
					...handle,
					group: group.name,
				}));

			return shown.filter(
				(handle: SelectionHandle) => handle.group === group.name,
			);
		});
	}

	/// The handles as the objects have them, which is what an interaction works from.
	public knownHandles(): SelectionHandle[] {
		return this.known;
	}

	/// The path of what is selected, for an interaction that works on one of its points.
	public pathEditor(): PolyPolygonEditor | null {
		return this.editor;
	}

	/// Asks for the page to be drawn again, after something moved under an interaction.
	public redraw(): void {
		this.containerObject.requestReDraw();
	}

	/// Takes in every handle with the box it is drawn as, so that a press on one arrives here.
	private coverTheHandles(): void {
		const shown = this.handles();
		if (!shown.length) {
			this.size = [0, 0];
			return;
		}

		const box = ShapeHandlesSection.handleSize() * app.pixelsToTwips;
		const covered = cool.Range2D.fromPoints(
			shown.map((handle: SelectionHandle) => handle.point),
		).expand(box, box);
		const area = new cool.SimpleRectangle(
			covered.minX,
			covered.minY,
			covered.width,
			covered.height,
		);

		// The size goes first: placing the section is what works out whether it is in sight, and
		// that answer is about the whole box, not about the place its corner is at.
		this.size = [area.pWidth, area.pHeight];
		this.setPosition(area.pX1, area.pY1);
	}

	/*
		The handle whose box holds that point, which is where the mouse is on the canvas. The
		handles are searched from the last one to the first, so that the one lying on top of the
		others is the one taken hold of - two of them can sit at the same place, the corner
		radius of a rectangle right next to the upper left corner among them.

		Only a handle that has a name can be taken hold of. A nameless one is shown and no more,
		as the points a connector could tie itself to are, and one of those sits exactly where the
		end of a tied connector sits.
	*/
	private handleAt(x: number, y: number): SelectionHandle | undefined {
		const half = 0.5 * ShapeHandlesSection.handleSize();
		const shown = this.handles();

		for (let at = shown.length - 1; at >= 0; --at) {
			if (!shown[at].name) continue;

			const point = new cool.SimplePoint(shown[at].point.x, shown[at].point.y);
			if (Math.abs(point.vX - x) <= half && Math.abs(point.vY - y) <= half)
				return shown[at];
		}

		return undefined;
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
		const framing = this.framingCorners();

		return framing.length === 4 ? framing : this.boxInView();
	}

	/// The four corners the eight stand on, in the order they go round, in view pixels. Empty for
	/// a selection that is framed by no handles.
	private framingCorners(): cool.Point[] {
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
		The four corners of the box the selected objects take up, for a selection that is framed
		by no handles: a connector is offered its own points alone, and the box is then what says
		where the selection is and what a press on it lands on.
	*/
	private boxInView(): cool.Point[] {
		let box: cool.Range2D | null = null;
		for (const objectId of this.selectedObjects()) {
			const one = RenderGeometrySection.boxOf(objectId);
			if (!one) return [];

			box = box ? box.union(one) : one;
		}

		if (!box) return [];

		const upperLeft = new cool.SimplePoint(box.minX, box.minY);
		const lowerRight = new cool.SimplePoint(box.maxX, box.maxY);

		return [
			new cool.Point(upperLeft.vX, upperLeft.vY),
			new cool.Point(lowerRight.vX, upperLeft.vY),
			new cool.Point(lowerRight.vX, lowerRight.vY),
			new cool.Point(upperLeft.vX, lowerRight.vY),
		];
	}

	/*
		Whether that point lies within the selection. The four corners go round it in order, so
		a point inside is on the same side of every one of the four edges. It holds for a
		selection that is turned as well as for one that is upright.
	*/
	public within(x: number, y: number): boolean {
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

		What counts as on the selection is the box it takes up, except for a connector: a
		connector is a line across a box that is mostly empty, and a press in that emptiness
		belongs to whatever is drawn there, so only the line itself counts.
	*/
	isHit(point: number[]): boolean {
		if (this.standsBack()) return false;

		if (this.handleAt(point[0], point[1]) !== undefined) return true;

		return this.groups().some((group: HandleGroup) =>
			group.takesAPress(point[0], point[1]),
		);
	}

	/// The point on the page, in twips, that a place on the canvas stands for.
	public inDocumentFromCanvas(x: number, y: number): cool.SimplePoint {
		return cool.SimplePoint.fromCorePixels([
			x - this.myTopLeft[0] + this.position[0],
			y - this.myTopLeft[1] + this.position[1],
		]);
	}

	/*
		While an end of a connector is dragged, the object under the mouse is the one the end
		would tie itself to, and it offers the places where it could land. They come and go as
		the mouse enters an object and leaves it again.
	*/
	private aimAtWhatIsUnder(at: cool.SimplePoint): void {
		const connector = this.theConnector();
		const held = this.interaction?.handleHeld();
		const onAnEnd =
			connector !== undefined &&
			held !== null &&
			held !== undefined &&
			['9.0.0', '9.0.1'].includes(held.name);

		const under = onAnEnd
			? (RenderGeometrySection.objectIdAt(at.x, at.y) ?? null)
			: null;
		const aimed = under === connector ? null : under;

		if (aimed === this.aimingAt) return;

		this.aimingAt = aimed;
		this.coverTheHandles();
		this.redraw();
	}

	/*
		The line a drag of one end of a connector shows of itself: straight from the end that
		stays to the one the drag holds. The engine lays a connector out again as an end moves,
		turning corners that nothing here can work out, so this says where the end goes and
		leaves the way there to the engine. Nothing for anything else.
	*/
	public straightLineFrom(
		handle: SelectionHandle,
		at: cool.Point,
	): cool.ObjectPathPolygon[] | null {
		if (this.theConnector() === undefined) return null;

		// A connector counts its own ends as the first two points of its first polygon.
		const ends = ['9.0.0', '9.0.1'];
		const dragged = ends.indexOf(handle.name);
		if (dragged < 0) return null;

		const stays = this.known.find(
			(one: SelectionHandle) => one.name === ends[1 - dragged],
		);
		if (!stays) return null;

		return [
			{
				closed: false,
				points: [
					{ x: stays.point.x, y: stays.point.y },
					{ x: at.x, y: at.y },
				],
			},
		];
	}

	/// The object an end of a connector is being dragged onto, or nothing while none is aimed at.
	public aimedAtObject(): number | null {
		return this.aimingAt;
	}

	/// The connector this selection stands on, where it stands on one and it is a connector.
	public theConnector(): number | undefined {
		const objects = this.selectedObjects();
		if (objects.length !== 1) return undefined;

		return ObjectHandles.isAConnector(objects[0]) ? objects[0] : undefined;
	}

	/*
		Draws the dashed line around what is selected, through the four corners the framing
		handles sit on. They follow whatever is being done to the selection, so the line turns
		with a turn and grows with a scale.
	*/
	private drawTheFrame(): void {
		// The line follows the eight. A selection they do not frame - a connector, which is
		// offered its own points alone - is marked by those points and nothing else.
		const corners = this.framingCorners();
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

	/*
		Draws the path the running interaction would leave behind, as a thin line. It is what a
		drag of a point shows of itself: moving a point is not a transformation of the object, so
		the object cannot be drawn through one, but the line it would follow can.
	*/
	private drawTheOutline(): void {
		const polygons = this.interaction?.outline();
		if (!polygons?.length) return;

		this.context.save();
		this.context.setTransform(1, 0, 0, 1, 0, 0);

		// The point at the very start of the document says where the drawing of the part begins
		// on the canvas, and a twip is that many pixels wide.
		const origin = new cool.SimplePoint(0, 0);
		this.context.translate(origin.vX, origin.vY);
		this.context.scale(app.twipsToPixels, app.twipsToPixels);
		this.context.strokeStyle = '#1C99E0';
		this.context.lineWidth = app.pixelsToTwips;
		this.context.beginPath();

		for (const polygon of polygons) {
			const points = polygon.points ?? [];
			if (!points.length) continue;

			this.context.moveTo(points[0].x, points[0].y);

			for (let at = 1; at <= points.length; ++at) {
				const from = points[at - 1];
				const to = points[at % points.length];
				if (at === points.length && !polygon.closed) break;

				if (from.aheadX !== undefined || to.behindX !== undefined)
					this.context.bezierCurveTo(
						from.aheadX ?? from.x,
						from.aheadY ?? from.y,
						to.behindX ?? to.x,
						to.behindY ?? to.y,
						to.x,
						to.y,
					);
				else this.context.lineTo(to.x, to.y);
			}

			if (polygon.closed) this.context.closePath();
		}

		this.context.stroke();
		this.context.restore();
	}

	onDraw(): void {
		if (this.standsBack()) return;

		this.drawTheInteraction();
		this.drawTheOutline();

		const shown = this.handles();
		for (const group of this.groups()) group.paint(this, shown);

		this.snap.draw(this);
		this.drawTheFrame();

		this.context.save();
		this.context.setTransform(1, 0, 0, 1, 0, 0);

		const size = ShapeHandlesSection.handleSize();
		for (const handle of this.handles()) {
			const group = this.groupOf(handle);
			if (!group) continue;

			const point = new cool.SimplePoint(handle.point.x, handle.point.y);
			const hovered = handle.name !== '' && handle.name === this.hovered;

			/*
				The handle the keyboard is on is drawn a third larger, at the larger half of its
				blink. The one under the mouse is drawn a little larger as well, by a third of
				that, which is enough to be seen beside the color it takes and little enough
				that the two cannot be taken for one another.
			*/
			const grown = this.travel.showsAsActive(handle.name)
				? size / 3
				: hovered
					? size / 8
					: 0;

			this.context.beginPath();
			this.context.strokeStyle = 'black';
			this.context.fillStyle = group.shape(this.context, handle, point, grown);

			this.context.closePath();
			this.context.fill();
			this.context.stroke();

			/*
				The handle under the mouse is marked by drawing its own edge again, two pixels
				wide and in the one color kept for it. It keeps its shape, so a square stays a
				square and a circle a circle, whatever the handle is.
			*/
			if (hovered) {
				this.context.strokeStyle = SelectionSection.underTheMouse(
					String(this.context.fillStyle),
				);
				this.context.lineWidth = 2 * app.dpiScale;
				this.context.stroke();
				this.context.lineWidth = 1;
			}
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
	public abstract selectedObjects(): number[];

	/*
		The pointer over a handle: the direction that handle scales in, the hand that takes hold
		of one that shapes the object, the hand that turns the selection, and the sign that says
		no over an object that cannot be resized.
	*/
	private pointerOver(handle: SelectionHandle): string {
		if (handle.kind === SelectionSection.turningKind) return 'pointer';

		if (handle.group !== 'framing')
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

	/*
		The shape of the selection as the maths of a drag wants it: the middle it turns around,
		how wide and how high it is in core pixels, and the angle it stands at, counted in
		radians against the clock. All four come from the handles that frame it, so nothing else
		has to be asked for them.
	*/
	public shapeNow(): any {
		const handleOfKind = (kind: string): cool.SimplePoint | undefined => {
			const handle = this.known.find(
				(one: SelectionHandle) => one.kind === kind,
			);
			return handle
				? new cool.SimplePoint(handle.point.x, handle.point.y)
				: undefined;
		};

		// The handles as the objects have them, not as a drag shows them: this says what the
		// selection is now, which is what a drag starts from.
		const middle = SelectionSection.middleOf(this.known);
		const above = handleOfKind('2');
		const below = handleOfKind('7');
		const left = handleOfKind('4');
		const right = handleOfKind('5');
		if (!middle || !above || !below || !left || !right) return undefined;

		return {
			center: middle.clone(),
			width: left.pDistanceTo(right.pToArray()),
			height: above.pDistanceTo(below.pToArray()),
			angleRadian:
				Math.atan2(middle.y - above.y, above.x - middle.x) - Math.PI * 0.5,
		};
	}

	/// Where the mouse is in the document, in core pixels, from a point this section was given.
	private inTheDocument(point: cool.SimplePoint): cool.SimplePoint {
		const inDocument = point.clone();

		inDocument.pX += this.position[0];
		inDocument.pY += this.position[1];

		return inDocument;
	}

	/// Looks for something on the page that the handle could line up with, and marks it.
	public lookForASnap(handle: SelectionHandle): void {
		const half = 0.5 * ShapeHandlesSection.handleSize();
		const at = new cool.SimplePoint(handle.point.x, handle.point.y);

		// A point is asked about, so there is no size to it and no distance left to travel.
		this.snap.look([0, 0], [at.pX - half, at.pY - half], [0, 0]);
		this.redraw();
	}

	/// Where the last look landed, in core pixels, null on an axis that found nothing.
	public snappedTo(): (number | null)[] {
		return this.snap.at();
	}

	/*
		Looks for something on the page that the whole selection could line up with, from where
		the move has taken it, and marks it. The distance is in core pixels.
	*/
	public lookForASnapOfTheWhole(across: number, down: number): void {
		this.snap.look(this.selectionSize(), this.selectionCorner(), [
			across,
			down,
		]);
	}

	/// Where the upper left corner of the selection lands, in core pixels: where the move puts
	/// it, or where it lined up with something on the page.
	public snappedCorner(x: number, y: number): number[] {
		return this.snap.corner(x, y);
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
		Hands the engine what a drag or a key did to the points of a path: the object it belongs
		to and one item for every point or weight that moved. The points that did not move are
		not named at all, so a path of many thousand points still travels as the few numbers that
		changed, and the ones left alone come back exactly as they went out.
	*/
	public static sendPathChanges(objectId: number, changes: string[]): void {
		if (!changes.length) return;

		app.socket.sendMessage(
			'setobjectpoints id=' +
				String(objectId) +
				' changes=' +
				changes.join(';'),
		);
	}

	/// What a running drag does to the objects, or nothing while nothing is being dragged.
	public dragMatrix(): cool.Matrix2D | null {
		return this.interaction?.transformation() ?? null;
	}

	/// Where a drag of that handle may take it, which its own group says.
	public holdTheDrag(handle: SelectionHandle, at: cool.Point): cool.Point {
		return this.groupOf(handle)?.holdInside(handle, at) ?? at;
	}

	/// Hands the engine what a drag of that handle did, which its own group knows how to say.
	public handOverTheDrag(handle: SelectionHandle, to: cool.Point): void {
		this.groupOf(handle)?.handOver(handle, to);
	}

	/*
		Moves a handle as a key asks, which is the business of the group the handle belongs to:
		one of the eight scales the selection, the one above it turns it, a point of a path moves
		that point. Answers where the handle lands, and nothing where it goes nowhere of its own.
	*/
	private moveHandleBy(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.SimplePoint | null {
		const landed = this.groupOf(handle)?.moveByKey(handle, towards, event);
		return landed ? new cool.SimplePoint(landed.x, landed.y) : null;
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
		this.endTheInteraction(true);
	}

	public cancelCarrying(): void {
		this.interaction?.cancel();
		this.endTheInteraction(false);
	}

	onMouseDown(point: cool.SimplePoint, e: MouseEvent): void {
		const at = this.inTheDocument(point);
		const onCanvas = [
			this.myTopLeft[0] + point.pX,
			this.myTopLeft[1] + point.pY,
		];
		const handle = this.handleAt(onCanvas[0], onCanvas[1]);

		this.pressedAHandle = handle !== undefined;
		this.pressedHandle = handle ?? null;

		/*
			The group that owns the handle begins the drag of it. A press that reached no handle
			goes to the last group that answers for the place it landed on, which is the object
			itself where it lands on the object.
		*/
		if (handle) {
			this.pressedGroup = this.groupOf(handle) ?? null;
			this.interaction = this.pressedGroup?.interactionFor(handle, at) ?? null;
		} else {
			this.pressedGroup =
				this.groups().find((group: HandleGroup) =>
					group.takesAPress(onCanvas[0], onCanvas[1]),
				) ?? null;
			this.interaction = this.pressedGroup?.interactionForThePlace(at) ?? null;
		}

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

			// The handle under the mouse is marked, so that it is plain which one a press would
			// take hold of where several lie close together.
			const hovered = over?.name ?? null;
			if (hovered !== this.hovered) {
				this.hovered = hovered;
				this.containerObject.requestReDraw();
			}
			return;
		}

		this.stopPropagating();
		e.stopPropagation();

		this.interaction.move(this.inTheDocument(point), e);
		this.aimAtWhatIsUnder(this.inTheDocument(point));

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
			/*
				A press on a handle that was let go where it started puts the keyboard on that
				handle. It is the short way onto one handle among hundreds - a point of a polygon
				among them - without walking there from the first.
			*/
			if (this.pressedHandle?.name) this.travel.goTo(this.pressedHandle.name);

			this.interaction = null;
			return;
		}

		this.stopPropagating();
		e.stopPropagation();

		this.interaction.finish(this.inTheDocument(point), e);
		this.endTheInteraction(true);
	}

	/*
		A press that was not a drag. It is handed to the engine as a press of its own, a moment
		later, so that a press that turns out to be the first half of a double one can still be
		called off: the engine would otherwise have selected something else before the text edit
		of the double press could begin.
	*/
	onClick(point: cool.SimplePoint, e: MouseEvent): void {
		this.stopPropagating();
		e.stopPropagation();

		/*
			A press that took hold of a handle is answered by what that handle does, and by
			nothing else. A short press on one counts as a click all the same, and handing that
			on would tell the engine that the page was pressed where the handle lies - which for
			the handle that turns the selection is beside the object, so the selection would go.
		*/
		if (this.pressedAHandle) return;

		// The group that took the press says whether the engine hears of it: a press on the line
		// of a connector is the connector itself, and it stays selected.
		if (this.pressedGroup && !this.pressedGroup.passesTheClickOn()) return;

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

	/// The mouse has left what is selected, so no handle is under it any more.
	onMouseLeave(): void {
		if (this.hovered === null) return;

		this.hovered = null;
		this.containerObject.requestReDraw();
	}

	onDragCancel(): void {
		this.interaction?.cancel();
		this.endTheInteraction(false);
	}

	/*
		Lets the interaction go and takes the lines that marked a snap away with it.

		Where the drag was carried out, the handles stay where it left them. The engine answers a
		moment later and the objects move then; falling back to where they still are would show
		the handles jumping back and forward again. A drag that was called off leaves them where
		the objects have them, which is where they belong.
	*/
	private endTheInteraction(carriedOut: boolean): void {
		if (carriedOut && this.interaction)
			this.known = this.interaction.handles(this.known);

		this.interaction = null;
		this.snap.forget();

		// Nothing is aimed at once the drag is over, so the places to tie to go with it.
		this.aimingAt = null;

		app.map.fire('scrollvelocity', { vx: 0, vy: 0 });
		this.containerObject.requestReDraw();
	}
}
