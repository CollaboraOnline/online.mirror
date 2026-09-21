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
	One group of handles of a selection, and everything that is its own: which handles it has and
	where they lie, how they are drawn, whether a press reaches one, what a drag of one does and
	what the engine is told when the drag ends.

	A selection holds a list of these in a fixed order, and that one list says three things. The
	keyboard walks it from the first group to the last. The drawing goes the same way, so the
	finest handles lie on top. A press goes the other way, so the finest is reached first and the
	first group that answers takes the press.
*/
abstract class HandleGroup {
	protected selection: SelectionSection;

	constructor(selection: SelectionSection) {
		this.selection = selection;
	}

	/// What the group is called, which is what marks a handle as belonging to it.
	public abstract readonly name: string;

	/// The handles it has, worked out from the objects of the selection.
	public handles(): SelectionHandle[] {
		return [];
	}

	/*
		Where its handles stand while a drag runs, from all of them as the drag leaves them.
		Nothing where they simply travel with the drag, which is what most of them do.
	*/
	public place(_shown: SelectionHandle[]): SelectionHandle[] | null {
		return null;
	}

	/// Anything it draws besides the handles themselves, drawn under them.
	public paint(_section: SelectionSection, _shown: SelectionHandle[]): void {
		// Most groups draw their handles and nothing else.
	}

	/*
		Lays the shape of one of its handles on the canvas and answers the color it is filled
		with. The selection fills it, draws its edge and marks it when the mouse is over it, so
		every handle is marked the same way whatever it looks like.
	*/
	public abstract shape(
		context: CanvasRenderingContext2D,
		handle: SelectionHandle,
		at: cool.SimplePoint,
		grown: number,
	): string;

	/// Whether a press that is on none of the handles lands on this group.
	public takesAPress(_x: number, _y: number): boolean {
		return false;
	}

	/// The drag a press on one of its handles begins, or nothing where it begins none.
	public interactionFor(
		_handle: SelectionHandle,
		_at: cool.SimplePoint,
	): SelectionInteraction | null {
		return null;
	}

	/// The drag a press that reached no handle begins, for a group that answers for a place.
	public interactionForThePlace(
		_at: cool.SimplePoint,
	): SelectionInteraction | null {
		return null;
	}

	/*
		Whether a press this group took is handed to the engine as a click of its own when it
		turns out not to be a drag. The engine hit tests it and selects what it finds, which is
		how a click through the box of a selection reaches an object behind it.
	*/
	public passesTheClickOn(): boolean {
		return true;
	}

	/*
		What an arrow key does to one of its handles, which is what a drag of it would do. Answers
		where the handle lands, so the view can follow it, and nothing where it goes nowhere.
	*/
	public moveByKey(
		_handle: SelectionHandle,
		_towards: cool.Point,
		_event: KeyboardEvent,
	): cool.Point | null {
		return null;
	}

	/*
		Hands the engine what a drag of one of its handles did, once the drag has ended. What that
		is differs from group to group: a handle the engine knows is named to it, a point of a
		path is named as a point of that path, a point to tie a connector to is moved where it
		was let go.
	*/
	public handOver(_handle: SelectionHandle, _to: cool.Point): void {
		// A group whose handles do not move tells the engine nothing.
	}

	/// Where one of its handles may go, from where the mouse has taken it. Most of them go where
	/// the mouse goes.
	public holdInside(_handle: SelectionHandle, at: cool.Point): cool.Point {
		return at;
	}

	/// Hands the engine a handle that was moved, by the name that says what it is.
	protected static sendTheHandle(
		handle: SelectionHandle,
		to: cool.Point,
	): void {
		app.map.sendUnoCommand('.uno:MoveShapeHandle', {
			...ShapeHandlesSection.handleParameters(handle),
			NewPosX: { type: 'long', value: to.x },
			NewPosY: { type: 'long', value: to.y },
		});
	}

	/// Lays out a round handle of the usual size at that place, grown by as much as asked.
	protected static round(
		context: CanvasRenderingContext2D,
		at: cool.SimplePoint,
		grown: number,
	): void {
		context.arc(
			at.vX,
			at.vY,
			ShapeHandlesSection.handleSize() * 0.5 + grown,
			0,
			Math.PI * 2,
		);
	}

	/*
		Moves the handle a key step and hands the engine where it landed, the way the end of a
		drag of it would. Answers where it landed.
	*/
	protected stepAndHandOver(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.Point {
		const to = HandleGroup.steppedBy(handle, towards, event);
		this.handOver(handle, to);

		return to;
	}

	/// Where a key takes the handle it is on, in twips.
	protected static steppedBy(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.Point {
		const step = HandleTravel.stepFor(event);

		return new cool.Point(
			handle.point.x + towards.x * step,
			handle.point.y + towards.y * step,
		).round();
	}
}

/*
	The eight that frame the selection, from the upper left one to the lower right one. They are
	what a scale takes hold of, and what everything else about the selection is measured from: its
	middle, the side the handle that turns it stands above, and the corners a press is tested
	against.
*/
class FramingHandles extends HandleGroup {
	public readonly name: string = 'framing';

	public handOver(handle: SelectionHandle, to: cool.Point): void {
		HandleGroup.sendTheHandle(handle, to);
	}

	public handles(): SelectionHandle[] {
		return ObjectHandles.framingOf(this.selection.selectedObjects()) ?? [];
	}

	public shape(
		context: CanvasRenderingContext2D,
		_handle: SelectionHandle,
		at: cool.SimplePoint,
		grown: number,
	): string {
		const size = ShapeHandlesSection.handleSize() + 2 * grown;

		context.rect(at.vX - size * 0.5, at.vY - size * 0.5, size, size);

		return '#FFFFFF';
	}

	public interactionFor(
		handle: SelectionHandle,
		_at: cool.SimplePoint,
	): SelectionInteraction | null {
		const shape = this.selection.shapeNow();

		return shape ? new ScalingInteraction(this.selection, handle, shape) : null;
	}

	public moveByKey(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.Point | null {
		return this.stepAndHandOver(handle, towards, event);
	}
}

/*
	The one handle that turns the selection, above the middle of its upper side and away from it
	by the same distance whatever the zoom. The client makes it: the engine has no handle of the
	kind, and what it is told at the end of a turn is a transformation.
*/
class TurningHandle extends HandleGroup {
	public readonly name: string = 'turning';

	/// How far above the selection it sits, in core pixels.
	private static readonly distance: number = 30;

	/// How far a key turns the selection, in degrees: one of them, fifteen with Shift, which is
	/// the step the office holds a turn to, and a tenth with Alt for the finest of it.
	private static turningStep(event: KeyboardEvent): number {
		if (event.shiftKey) return 15;
		if (event.altKey) return 0.1;
		return 1;
	}

	public handles(): SelectionHandle[] {
		return this.placedAbove(
			ObjectHandles.framingOf(this.selection.selectedObjects()) ?? [],
		);
	}

	/*
		It is laid out again from the handles as a drag leaves them, so that it keeps its distance
		from the upper side however the selection is scaled or turned.
	*/
	public place(shown: SelectionHandle[]): SelectionHandle[] | null {
		return this.placedAbove(shown);
	}

	/// The handle above the upper side of what those handles frame, or none where they do not
	/// frame anything or the objects say they cannot be turned.
	private placedAbove(shown: SelectionHandle[]): SelectionHandle[] {
		if (GraphicSelection.extraInfo?.isRotatable === false) return [];

		const middle = SelectionSection.middleOf(shown);
		const above = shown.find((one: SelectionHandle) => one.kind === '2');
		if (!middle || !above) return [];

		const away = TurningHandle.distance * app.dpiScale;
		const out = new cool.Point(
			above.point.x - middle.x,
			above.point.y - middle.y,
		);
		const length = out.length();
		if (!length) return [];

		const step = cool.SimplePoint.fromCorePixels([away, away]);

		return [
			{
				name: SelectionSection.turningKind,
				kind: SelectionSection.turningKind,
				pointer: '0',
				point: new cool.Point(
					above.point.x + (out.x / length) * step.x,
					above.point.y + (out.y / length) * step.y,
				).round(),
			},
		];
	}

	public shape(
		context: CanvasRenderingContext2D,
		_handle: SelectionHandle,
		at: cool.SimplePoint,
		grown: number,
	): string {
		HandleGroup.round(context, at, grown);

		return '#FFFFFF';
	}

	public interactionFor(
		_handle: SelectionHandle,
		at: cool.SimplePoint,
	): SelectionInteraction | null {
		const middle = this.selection.middle();

		return middle ? new TurningInteraction(this.selection, middle, at) : null;
	}

	public moveByKey(
		_handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.Point | null {
		const middle = this.selection.middle();
		if (!middle) return null;

		// The keys that point left and up turn against the clock, the others with it.
		const against = towards.x < 0 || towards.y < 0;
		TurningInteraction.turnObjects(
			middle,
			TurningHandle.turningStep(event) * (against ? 1 : -1),
		);

		return null;
	}
}

/*
	A group whose handles are each dragged on their own, to where the mouse takes them, and moved
	by a key the same way. Where a handle ends up is handed to the engine.
*/
abstract class HandlesMovedOneByOne extends HandleGroup {
	public interactionFor(
		handle: SelectionHandle,
		at: cool.SimplePoint,
	): SelectionInteraction | null {
		return new ShapingInteraction(this.selection, handle, at);
	}

	public moveByKey(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.Point | null {
		return this.stepAndHandOver(handle, towards, event);
	}
}

/*
	The handles that shape one object rather than frame it: the corner radius of a rectangle, the
	points a custom shape is shaped by, the points along the way of a connector. What such a
	handle does to the object is the object's own business, so the engine is told which handle
	moved and where it went.
*/
class ShapingHandles extends HandlesMovedOneByOne {
	public readonly name: string = 'shaping';

	public handOver(handle: SelectionHandle, to: cool.Point): void {
		HandleGroup.sendTheHandle(handle, to);
	}

	public handles(): SelectionHandle[] {
		return ObjectHandles.shapingOf(this.selection.selectedObjects());
	}

	public shape(
		context: CanvasRenderingContext2D,
		_handle: SelectionHandle,
		at: cool.SimplePoint,
		grown: number,
	): string {
		HandleGroup.round(context, at, grown);

		return '#FFFF00';
	}
}

/*
	The points someone added to an object for a connector to tie itself to, and, while an end of a
	connector is dragged onto an object, every place that end could land. They are walked to and
	marked; moving one is not built yet.
*/
class TiePointHandles extends HandleGroup {
	public readonly name: string = 'tiePoints';

	/// The points the selected object was given, which travel with it as it is dragged.
	public handles(): SelectionHandle[] {
		const objects = this.selection.selectedObjects();

		return objects.length === 1 ? GluePointHandles.ownPointsOf(objects[0]) : [];
	}

	/*
		The object's own points as the drag leaves them, and beside them every place an end of a
		connector could land on the object under the mouse. Those belong to that object, so they
		are worked out where it stands rather than carried along by the drag.
	*/
	public place(shown: SelectionHandle[]): SelectionHandle[] | null {
		const own = this.ownAsTheDragLeavesThem(shown);

		const aimedAt = this.selection.aimedAtObject();
		if (aimedAt === null) return own;

		return [
			...own,
			...GluePointHandles.ownPointsOf(aimedAt),
			...GluePointHandles.defaultPointsOf(aimedAt),
		];
	}

	/*
		The object's own points while a drag of the object runs. A point held as a share of the
		object's size sits at the same place on the object whatever is done to it, so it travels
		with the drag as everything else does. A point that keeps a distance of its own moves and
		turns with the object but is not stretched by it, so it keeps its way from the middle and
		only turns with it.
	*/
	private ownAsTheDragLeavesThem(shown: SelectionHandle[]): SelectionHandle[] {
		const own = shown.filter(
			(handle: SelectionHandle) => handle.group === this.name,
		);

		const matrix = this.selection.dragMatrix();
		const objects = this.selection.selectedObjects();
		if (!matrix || objects.length !== 1) return own;

		const held = RenderGeometrySection.objectOf(objects[0])?.gluePoints ?? [];
		if (!held.some((point) => point.keepsItsDistance)) return own;

		const before = SelectionSection.middleOf(this.selection.knownHandles());
		const after = SelectionSection.middleOf(shown);
		const standing = GluePointHandles.ownPointsOf(objects[0]);
		if (!before || !after) return own;

		// How far the drag turns the objects, which is all of it that such a point follows: it
		// keeps its way from the middle, turned, around the middle the drag leads to.
		const carried = cool.Matrix2D.IDENTITY.translate(-before.x, -before.y)
			.rotateAround(0, 0, matrix.rotation())
			.translate(after.x, after.y);

		return own.map((handle: SelectionHandle, at: number) => {
			if (!held[at]?.keepsItsDistance || !standing[at]) return handle;

			return {
				...handle,
				point: carried
					.apply(standing[at].point.x, standing[at].point.y)
					.round(),
			};
		});
	}

	/*
		A point to tie a connector to stays on the object it belongs to: the drawing layer reads
		such a point off the box around the object and holds it inside that box, so a drag that
		would take it outside leaves it on the edge.
	*/
	public holdInside(_handle: SelectionHandle, at: cool.Point): cool.Point {
		const transform = RenderGeometrySection.transformOf(
			this.selection.selectedObjects()[0],
		);
		if (!transform) return at;

		const onTheObject = transform.invert()?.apply(at.x, at.y);
		if (!onTheObject) return at;

		const held = (value: number) => Math.min(Math.max(value, 0), 1);
		return transform.apply(held(onTheObject.x), held(onTheObject.y)).round();
	}

	/*
		A point the object was given is moved where it is put, by the number it has in the object's
		own list. The four an object falls back on are not its own and are shown only, so they
		have no name and nothing takes hold of one.
	*/
	public interactionFor(
		handle: SelectionHandle,
		at: cool.SimplePoint,
	): SelectionInteraction | null {
		return handle.name
			? new ShapingInteraction(this.selection, handle, at)
			: null;
	}

	public handOver(handle: SelectionHandle, to: cool.Point): void {
		const at = Number(handle.name.split('.')[1]);
		if (!(at >= 0)) return;

		const objectId = this.selection.selectedObjects()[0];
		const transform = RenderGeometrySection.transformOf(objectId);
		if (!transform) return;

		// The object is told where the point sits on it, which is how it was given to us.
		const onTheObject = transform.invert()?.apply(to.x, to.y);
		if (!onTheObject) return;

		app.socket.sendMessage(
			'setobjectgluepoint id=' +
				String(objectId) +
				' at=' +
				String(at) +
				' x=' +
				onTheObject.x.toFixed(4) +
				' y=' +
				onTheObject.y.toFixed(4),
		);
	}

	public moveByKey(
		handle: SelectionHandle,
		towards: cool.Point,
		event: KeyboardEvent,
	): cool.Point | null {
		if (!handle.name) return null;

		const to = HandleGroup.steppedBy(handle, towards, event);
		this.handOver(handle, to);

		return to;
	}

	public shape(
		context: CanvasRenderingContext2D,
		handle: SelectionHandle,
		at: cool.SimplePoint,
		grown: number,
	): string {
		context.arc(
			at.vX,
			at.vY,
			ShapeHandlesSection.gluePointSize() * 0.5 + grown,
			0,
			Math.PI * 2,
		);

		/*
			A dimmed red: these are offered while something else is being done and should not
			shout over the handles beside them. The four an object falls back on take that red
			darker again, so the ones it was given stand out from them.
		*/
		return handle.kind === 'GluePoint'
			? '#B03A3A'
			: SelectionSection.darker('#B03A3A', 0.6);
	}
}

/*
	The points of the path an object is drawn along, with the weights that bend the curves between
	them. They are the finest handles there are, so they come last: they are drawn over everything
	and a press reaches them first.
*/
class PathHandles extends HandlesMovedOneByOne {
	public readonly name: string = 'path';

	public handOver(handle: SelectionHandle, to: cool.Point): void {
		const change = this.selection.pathEditor()?.changeFor(handle.name, to);
		if (!change) return;

		SelectionSection.sendPathChanges(this.selection.selectedObjects()[0], [
			change,
		]);
	}

	public handles(): SelectionHandle[] {
		return this.selection.pathEditor()?.handles() ?? [];
	}

	public paint(section: SelectionSection, shown: SelectionHandle[]): void {
		this.selection.pathEditor()?.paint(section, shown);
	}

	public shape(
		context: CanvasRenderingContext2D,
		handle: SelectionHandle,
		at: cool.SimplePoint,
		grown: number,
	): string {
		if (handle.kind === '9') {
			// A point of the path, smaller than the eight and drawn over them, so it can be taken
			// hold of where the two meet.
			const across = PolyPolygonEditor.pointSize() + 2 * grown;
			context.rect(at.vX - across * 0.5, at.vY - across * 0.5, across, across);
		} else {
			// A weight that bends the curve at a point, smaller again: there are two of them for
			// every point of a curve.
			context.arc(
				at.vX,
				at.vY,
				PolyPolygonEditor.weightSize() * 0.5 + grown,
				0,
				Math.PI * 2,
			);
		}

		return '#1C99E0';
	}
}

/*
	The object itself rather than any handle of it: the group that takes a press anywhere on the
	selection and carries it. It holds no handle and stands last in the list, so it is reached
	only where no group before it answered.
*/
class TheObjectItself extends HandleGroup {
	public readonly name: string = 'object';

	public takesAPress(x: number, y: number): boolean {
		return this.selection.within(x, y);
	}

	public shape(): string {
		// It has no handle to draw.
		return '';
	}

	public interactionForThePlace(
		at: cool.SimplePoint,
	): SelectionInteraction | null {
		if (GraphicSelection.extraInfo?.isDraggable === false) return null;

		return new MovingInteraction(this.selection, at);
	}
}

/*
	A connector itself, which is held differently: it is a line across a box that is mostly empty,
	so a press counts as on it only where its own line is drawn, and a press in that emptiness
	belongs to whatever is drawn there. One that is tied to an object is not carried at all - it
	runs from where it is tied, so carrying it would leave it where it was.
*/
class TheConnectorItself extends TheObjectItself {
	/*
		A press reaches this group only where the connector's own line is drawn, so the connector
		itself is what was pressed and it stays selected. Handing the press on would let the
		engine hit test it and find whatever else is drawn there.
	*/
	public passesTheClickOn(): boolean {
		return false;
	}

	public takesAPress(x: number, y: number): boolean {
		const connector = this.selection.theConnector();
		if (connector === undefined) return false;

		const at = this.selection.inDocumentFromCanvas(x, y);

		return RenderGeometrySection.objectHitAt(connector, at.x, at.y);
	}

	public interactionForThePlace(
		at: cool.SimplePoint,
	): SelectionInteraction | null {
		const connector = this.selection.theConnector();
		if (connector !== undefined && ObjectHandles.isATiedConnector(connector))
			return null;

		return super.interactionForThePlace(at);
	}
}
