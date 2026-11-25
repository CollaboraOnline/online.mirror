/* -*- js-indent-level: 8 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/// One object a turn in 3D turns, with the transforms its turn is worked out through.
interface TurnedIn3D {
	id: number;
	/// its own 3D transform before the turn
	before: cool.Matrix3D;
	/// the transforms of the scenes it lies in, and their inverse
	outer: cool.Matrix3D;
	outerInverse: cool.Matrix3D;
}

/*
	A turn in 3D of a scene that sits in no other, or of the 3D objects selected inside an entered
	one, by a drag of the handle in the middle, as the office turns them: a drag across the whole
	width of what is selected turns by a quarter about one axis, one down its whole height by a
	quarter about the other. They turn about the place the handle stands at, at the depth of the
	middle of the objects, in the space the camera looks from, so the turn looks the same however
	the scene is turned already.

	The angles count from where the drag began, as a 3D object has no angle from upright of its
	own. Ctrl, Shift and Alt snap each of them to the steps they snap a turn to; Space switches
	the pair of axes. While it runs the lines of the objects are drawn turned, through the view
	the engine will give the scene. At the end the engine is told the new 3D transforms, which it
	applies as one step.
*/
class Turn3DInteraction extends SelectionInteraction {
	/// The pairs of axes a drag turns about: the first by a drag across, the second by a drag
	/// down. Space goes on to the next pair, which stays in use for the next turn.
	public static readonly pairs: ('x' | 'y' | 'z')[][] = [
		['y', 'x'],
		['z', 'x'],
		['y', 'z'],
	];
	public static pairInUse: number = 0;

	private readonly data: cool.VectorPrimitivesData;
	private readonly sceneId: number;
	private readonly objectIds: number[];
	private readonly start: cool.SimplePoint;
	// the size of what is selected on the page, in twips, which a quarter turn is dragged across
	private readonly width: number;
	private readonly height: number;
	private readonly turnedOnes: TurnedIn3D[];
	private readonly orientation: cool.Matrix3D;
	private readonly orientationInverse: cool.Matrix3D;
	// the point the turn goes about, in the space the camera looks from
	private readonly middle: cool.Point3D;

	// the angles reached, in degrees, snapped where a key asks for it, and the part of them the
	// objects are turned by already
	private angles: number[] = [0, 0];
	private applied: number[] = [0, 0];
	// the 3D transforms the objects have now, as turned so far
	private turned = new Map<number, cool.Matrix3D>();
	private ghost: { lines: cool.Polygon2D[]; frame: cool.Range2D } | null = null;

	private constructor(
		selection: SelectionSection,
		data: cool.VectorPrimitivesData,
		sceneId: number,
		objectIds: number[],
		start: cool.SimplePoint,
		box: cool.Range2D,
		turnedOnes: TurnedIn3D[],
		orientation: cool.Matrix3D,
		orientationInverse: cool.Matrix3D,
		middle: cool.Point3D,
	) {
		super(selection);
		this.data = data;
		this.sceneId = sceneId;
		this.objectIds = objectIds;
		this.start = start;
		this.width = Math.max(box.width, 1);
		this.height = Math.max(box.height, 1);
		this.turnedOnes = turnedOnes;
		this.orientation = orientation;
		this.orientationInverse = orientationInverse;
		this.middle = middle;
		for (const one of turnedOnes) this.turned.set(one.id, one.before);
	}

	/*
		What a turn in 3D of that selection turns: the scene where one scene that sits in no other
		is selected, or the selected 3D objects where they all lie in one entered scene. Each of
		them in a scene the client works out from its 3D objects, and none held in place. Nothing
		for any other selection.
	*/
	public static turnsIn(
		objectIds: number[],
	): { sceneId: number; objectIds: number[] } | null {
		const data = RenderGeometrySection.currentPart();
		if (!data || !objectIds.length) return null;
		// the 3D of an active chart is the chart's own, its parts go by the chart rules
		if (GraphicSelection.inPlaceActive) return null;

		const sceneId = cool.Scene3D.sceneOf(data, objectIds[0]);
		if (sceneId === undefined || !cool.Scene3D.takes(data, sceneId))
			return null;

		// a scene held in place is not turned either; the 3D objects inside a scene never move
		// on the page, so the engine alone knows whether one of them is held
		const wholeScene = objectIds.length === 1 && objectIds[0] === sceneId;
		if (wholeScene) {
			if (data.objects.get(sceneId)?.cannotBeMoved) return null;
			return { sceneId: sceneId, objectIds: objectIds };
		}
		for (const objectId of objectIds)
			if (
				objectId === sceneId ||
				cool.Scene3D.sceneOf(data, objectId) !== sceneId
			)
				return null;
		return { sceneId: sceneId, objectIds: objectIds };
	}

	/// The box of those objects on the page, in twips, as the records give it.
	public static boxOf(objectIds: number[]): cool.Range2D | null {
		const corners: cool.Point[] = [];
		for (const objectId of objectIds) {
			const object = RenderGeometrySection.objectOf(objectId);
			const x = object?.x;
			const y = object?.y;
			if (x === undefined || y === undefined) continue;
			corners.push(new cool.Point(x, y));
			corners.push(
				new cool.Point(x + (object?.width ?? 0), y + (object?.height ?? 0)),
			);
		}
		return corners.length ? cool.Range2D.fromPoints(corners) : null;
	}

	/// The turn the handle at the middle of that selection begins, or nothing where the selection
	/// turns in 3D no more.
	public static begin(
		selection: SelectionSection,
		handle: SelectionHandle,
	): Turn3DInteraction | null {
		return Turn3DInteraction.prepare(
			selection,
			new cool.SimplePoint(handle.point.x, handle.point.y),
		);
	}

	/// A turn of that selection about that point on the page, in twips, or nothing where the
	/// selection turns in 3D no more.
	private static prepare(
		selection: SelectionSection,
		at: cool.SimplePoint,
	): Turn3DInteraction | null {
		const data = RenderGeometrySection.currentPart();
		const what = Turn3DInteraction.turnsIn(selection.selectedObjects());
		const box = what && Turn3DInteraction.boxOf(what.objectIds);
		const view = what && data?.objects.get(what.sceneId)?.scene3D;
		if (!data || !what || !box || !view) return null;

		const orientation = cool.Matrix3D.fromArray(view.orientation);
		const orientationInverse = orientation?.invert();
		const placement = cool.Matrix2D.fromArray(view.placement);
		const toTheSquare = placement?.invert();
		const projection = cool.Matrix3D.fromArray(view.projection);
		const deviceToView = cool.Matrix3D.fromArray(view.deviceToView);
		if (
			!orientation ||
			!orientationInverse ||
			!toTheSquare ||
			!projection ||
			!deviceToView
		)
			return null;
		const fromTheSquare = projection.then(deviceToView).invert();
		if (!fromTheSquare) return null;

		const turnedOnes: TurnedIn3D[] = [];
		let depths = 0;
		for (const objectId of what.objectIds) {
			const before = cool.Scene3D.transformOf(data, objectId);
			const outer = cool.Scene3D.outerTransformOf(data, objectId);
			const outerInverse = outer.invert();
			const middleOfIt = cool.Scene3D.middleInItsOwnSpace(data, objectId);
			if (!before || !outerInverse || !middleOfIt) return null;

			turnedOnes.push({
				id: objectId,
				before: before,
				outer: outer,
				outerInverse: outerInverse,
			});
			depths += before.then(outer).then(orientation).apply(middleOfIt).z;
		}

		// the place of the handle, from the page back onto the scene's unit square and from
		// there into the space the camera looks from, at the depth of the objects' middles
		const onTheSquare = toTheSquare.apply(at.x, at.y);
		const there = fromTheSquare.apply(
			new cool.Point3D(onTheSquare.x, onTheSquare.y, 0),
		);
		const middle = new cool.Point3D(
			there.x,
			there.y,
			depths / turnedOnes.length,
		);

		return new Turn3DInteraction(
			selection,
			data,
			what.sceneId,
			what.objectIds,
			at,
			box,
			turnedOnes,
			orientation,
			orientationInverse,
			middle,
		);
	}

	private static turnAbout(
		axis: 'x' | 'y' | 'z',
		degrees: number,
	): cool.Matrix3D {
		const angle = (degrees * Math.PI) / 180;
		if (axis === 'x') return cool.Matrix3D.turnAboutX(angle);
		if (axis === 'y') return cool.Matrix3D.turnAboutY(angle);
		return cool.Matrix3D.turnAboutZ(angle);
	}

	public move(to: cool.SimplePoint, event?: MouseEvent): void {
		const step = EditSteps.turnSnap(event);
		const snapped = (degrees: number): number =>
			step ? Math.round(degrees / step) * step : degrees;
		this.angles = [
			snapped((90 * (to.x - this.start.x)) / this.width),
			snapped((90 * (to.y - this.start.y)) / this.height),
		];

		/*
			As the office turns: each move turns what is turned already by what it adds, about
			the axes as the camera sees them, so a drag goes on from where the objects stand and
			not from where they stood when it began.
		*/
		const added = [
			this.angles[0] - this.applied[0],
			this.angles[1] - this.applied[1],
		];
		if (added[0] === 0 && added[1] === 0 && this.ghost) return;
		this.applied = this.angles;
		this.turnBy(added);
		this.selection.containerObject?.requestReDraw();
	}

	/// Turns the objects on by those angles in degrees, about the axes of the pair in use, and
	/// works out the lines that show them so.
	private turnBy(added: number[]): void {
		const pair = Turn3DInteraction.pairs[Turn3DInteraction.pairInUse];
		const turn = Turn3DInteraction.turnAbout(pair[0], added[0]).then(
			Turn3DInteraction.turnAbout(pair[1], added[1]),
		);
		const aroundTheMiddle = cool.Matrix3D.translation(
			-this.middle.x,
			-this.middle.y,
			-this.middle.z,
		)
			.then(turn)
			.then(
				cool.Matrix3D.translation(this.middle.x, this.middle.y, this.middle.z),
			);

		// each object into the space the camera looks from, turned there, and back
		for (const one of this.turnedOnes)
			this.turned.set(
				one.id,
				(this.turned.get(one.id) ?? one.before)
					.then(one.outer)
					.then(this.orientation)
					.then(aroundTheMiddle)
					.then(this.orientationInverse)
					.then(one.outerInverse),
			);

		this.ghost = cool.Scene3D.outlineAfter(
			this.data,
			this.sceneId,
			this.turned,
			this.objectIds,
		);
	}

	public finish(to: cool.SimplePoint, event?: MouseEvent): void {
		this.move(to, event);
		if (this.angles[0] === 0 && this.angles[1] === 0) return;
		Turn3DInteraction.send(
			this.data,
			this.sceneId,
			this.turned,
			this.outline(),
			this.ghost?.frame ?? null,
		);
	}

	/*
		The lines of a turn that went to the engine, kept until the scene shows its new picture:
		the engine answers with the scene's new size at once, and its picture follows once it is
		drawn and loaded, so the lines stand for it meanwhile, as they do while the drag runs.
		Kept no longer than keptFor in any case.
	*/
	private static sent: {
		sceneId: number;
		lines: cool.ObjectPathPolygon[];
		pictureWas: number;
		since: number;
	} | null = null;
	private static readonly keptFor = 5000;

	/// The checksum of the picture the scene is drawn by, nought where it has none.
	private static pictureOf(sceneId: number): number {
		let found = 0;
		const walk = (list: cool.Primitive[] | undefined): void => {
			for (const primitive of list ?? []) {
				if (found) return;
				if (cool.GraphicResource.is(primitive)) found = primitive.checksum;
				else walk(primitive.children);
			}
		};
		walk(RenderGeometrySection.objectOf(sceneId)?.primitives);
		return found;
	}

	/// Tells the engine the new 3D transforms, one step to undo, and keeps the lines that show
	/// them until the scene's new picture is there.
	public static send(
		data: cool.VectorPrimitivesData,
		sceneId: number,
		transforms: Map<number, cool.Matrix3D>,
		lines: cool.ObjectPathPolygon[] | null,
		frame: cool.Range2D | null = null,
	): void {
		const named: string[] = [];
		for (const [objectId, transform] of transforms)
			named.push(
				String(objectId) + ',' + transform.toArray().map(String).join(','),
			);
		if (!named.length) return;

		if (lines?.length) {
			Turn3DInteraction.sent = {
				sceneId: sceneId,
				lines: lines,
				pictureWas: Turn3DInteraction.pictureOf(sceneId),
				since: performance.now(),
			};
			// the lines go once the time is up, also where nothing else draws again
			setTimeout(
				() => app.sectionContainer?.requestReDraw(),
				Turn3DInteraction.keptFor + 50,
			);
		}
		Turn3DInteraction.keyLeft = {
			objectIds: Array.from(transforms.keys()).join(','),
			version: data.version,
			transforms: transforms,
			frame: frame,
		};
		ChangeOutbox.sendAChange(
			'setobjecttransform to=' + named.join(';') + ' as=turn3d',
		);
	}

	/// The lines of the last turn sent, while the scene does not show its new picture yet.
	public static linesWhileAnswered(): cool.ObjectPathPolygon[] | null {
		const sent = Turn3DInteraction.sent;
		if (!sent) return null;

		const now = Turn3DInteraction.pictureOf(sent.sceneId);
		const shown =
			now !== 0 &&
			now !== sent.pictureWas &&
			RenderManager.imageFor(now)?.complete === true;
		if (shown || performance.now() - sent.since > Turn3DInteraction.keptFor) {
			Turn3DInteraction.sent = null;
			return null;
		}
		return sent.lines;
	}

	/*
		Where the keys last left the objects they turned, while the engine has not answered: the
		version of the records the turn was worked out on, so a key that comes before the answer
		goes on from there rather than from the objects as the records still hold them.
	*/
	private static keyLeft: {
		objectIds: string;
		version: number | string | undefined;
		transforms: Map<number, cool.Matrix3D>;
		// their frame on the page then, where the change worked it out
		frame: cool.Range2D | null;
	} | null = null;

	/// Where the keys left those objects, while the records of that version do not show it yet:
	/// their 3D transforms and their frame on the page. Nothing once the engine has answered.
	public static whereTheKeysLeft(
		objectIds: number[],
		version: number | string | undefined,
	): {
		transforms: Map<number, cool.Matrix3D>;
		frame: cool.Range2D | null;
	} | null {
		const left = Turn3DInteraction.keyLeft;
		if (
			!left ||
			left.objectIds !== objectIds.join(',') ||
			left.version !== version
		)
			return null;
		return { transforms: new Map(left.transforms), frame: left.frame };
	}

	/*
		An arrow key on the handle: Left and Right turn about the first axis of the pair in use,
		as a drag across does, Up and Down about the second, by one degree, or by the step Ctrl,
		Shift or Alt names. Each step goes on from where the objects stand.
	*/
	public static turnByKey(
		selection: SelectionSection,
		towards: cool.Point,
		event: KeyboardEvent,
	): void {
		const what = Turn3DInteraction.turnsIn(selection.selectedObjects());
		const box = what && Turn3DInteraction.boxOf(what.objectIds);
		if (!what || !box) return;
		const turn = Turn3DInteraction.prepare(
			selection,
			new cool.SimplePoint(
				(box.minX + box.maxX) / 2,
				(box.minY + box.maxY) / 2,
			),
		);
		if (!turn) return;

		const left = Turn3DInteraction.whereTheKeysLeft(
			what.objectIds,
			turn.data.version,
		);
		if (left) turn.turned = left.transforms;

		const step = EditSteps.turnSnap(event) ?? EditSteps.keyTurnStep();
		turn.turnBy([towards.x * step, towards.y * step]);
		Turn3DInteraction.send(
			turn.data,
			turn.sceneId,
			turn.turned,
			turn.outline(),
			turn.ghost?.frame ?? null,
		);
	}

	/*
		A 3D transform without its turn: each axis keeps its length, and a mirror its side, and
		the given middle, in the object's own space, stays where the transform puts it, as a turn
		goes about the middle. Without a middle the origin stays. Nothing where the transform has
		no turn to take away.
	*/
	public static withoutTheTurn(
		transform: cool.Matrix3D,
		middle: cool.Point3D | null = null,
	): cool.Matrix3D | null {
		const column = (at: number): number[] => [
			transform.get(0, at),
			transform.get(1, at),
			transform.get(2, at),
		];
		const [x, y, z] = [column(0), column(1), column(2)];
		const length = (axis: number[]): number =>
			Math.hypot(axis[0], axis[1], axis[2]);
		const mirrored =
			x[0] * (y[1] * z[2] - y[2] * z[1]) -
				y[0] * (x[1] * z[2] - x[2] * z[1]) +
				z[0] * (x[1] * y[2] - x[2] * y[1]) <
			0;
		const scale = [mirrored ? -length(x) : length(x), length(y), length(z)];

		let turned = false;
		for (let row = 0; row < 3; ++row)
			for (let at = 0; at < 3; ++at) {
				const upright = row === at ? scale[at] : 0;
				if (
					Math.abs(transform.get(row, at) - upright) >
					1e-9 * (1 + Math.abs(upright))
				)
					turned = true;
			}
		if (!turned) return null;

		const place = [
			transform.get(0, 3),
			transform.get(1, 3),
			transform.get(2, 3),
		];
		if (middle) {
			const stays = transform.apply(middle);
			place[0] = stays.x - scale[0] * middle.x;
			place[1] = stays.y - scale[1] * middle.y;
			place[2] = stays.z - scale[2] * middle.z;
		}

		return cool.Matrix3D.fromArray([
			scale[0],
			0,
			0,
			place[0],
			0,
			scale[1],
			0,
			place[1],
			0,
			0,
			scale[2],
			place[2],
			0,
			0,
			0,
			1,
		]);
	}

	/*
		The 0 key on a selected 3D scene, or on 3D objects selected inside an entered one: their
		turns in 3D are taken away, each keeping its size and its middle, as one step to undo, and the
		engine fits the scene to them as after a turn. Answers whether any of them was turned.
	*/
	public static uprightByKey(objectIds: number[]): boolean {
		const data = RenderGeometrySection.currentPart();
		const what = Turn3DInteraction.turnsIn(objectIds);
		if (!data || !what) return false;

		const uprights = new Map<number, cool.Matrix3D>();
		for (const objectId of what.objectIds) {
			const transform = cool.Scene3D.transformOf(data, objectId);
			const upright =
				transform &&
				Turn3DInteraction.withoutTheTurn(
					transform,
					cool.Scene3D.middleInItsOwnSpace(data, objectId),
				);
			if (upright) uprights.set(objectId, upright);
		}
		if (!uprights.size) return false;

		const ghost = cool.Scene3D.outlineAfter(
			data,
			what.sceneId,
			uprights,
			what.objectIds,
		);
		Turn3DInteraction.send(
			data,
			what.sceneId,
			uprights,
			ghost ? Turn3DInteraction.linesOf(ghost.lines) : null,
			ghost?.frame ?? null,
		);
		return true;
	}

	/// Space goes on to the next pair of axes, keeping the angles reached.
	public takesTheKey(event: KeyboardEvent): boolean {
		if (event.key !== ' ') return false;
		Turn3DInteraction.switchThePair();
		return true;
	}

	public static switchThePair(): void {
		Turn3DInteraction.pairInUse =
			(Turn3DInteraction.pairInUse + 1) % Turn3DInteraction.pairs.length;
	}

	/// The handles hide once a drag turns, as they stand where the objects were. A press that has
	/// not moved yet keeps them, so a click on the handle in the middle puts the keyboard there.
	public handles(known: SelectionHandle[]): SelectionHandle[] {
		return this.ghost ? [] : known;
	}

	public outline(): cool.ObjectPathPolygon[] | null {
		return this.ghost ? Turn3DInteraction.linesOf(this.ghost.lines) : null;
	}

	private static linesOf(lines: cool.Polygon2D[]): cool.ObjectPathPolygon[] {
		return lines.map((line: cool.Polygon2D) => ({
			closed: line.closed,
			points: line.points.map((point: cool.Point) => ({
				x: point.x,
				y: point.y,
			})),
		}));
	}

	/// The two angles reached, each named by its axis.
	public reading(): string {
		const pair = Turn3DInteraction.pairs[Turn3DInteraction.pairInUse];
		return this.angles
			.map(
				(degrees: number, at: number) =>
					pair[at].toUpperCase() + ' ' + String(Math.round(degrees)) + '\u00B0',
			)
			.join('  ');
	}
}

/*
	A move in 3D of the 3D objects selected inside an entered scene, by a drag on them, as the
	office moves them: the way the mouse goes on the page is taken into the space the camera looks
	from, at the middle of the depth the scene is seen in, so the objects follow the mouse across
	the screen; with Alt the way down goes into the depth instead, away from the camera or towards
	it. While it runs the lines of the moved objects are drawn as the scene will look, and at the
	end the engine is told the new 3D transforms, as after a turn.
*/
class Move3DInteraction extends SelectionInteraction {
	private readonly data: cool.VectorPrimitivesData;
	private readonly sceneId: number;
	private readonly objectIds: number[];
	// from the page to the unit square the scene is seen on, and from there into the space the
	// camera looks from
	private readonly toTheSquare: cool.Matrix2D;
	private readonly fromTheSquare: cool.Matrix3D;
	private readonly orientationInverse: cool.Matrix3D;
	private readonly outerInverse: Map<number, cool.Matrix3D>;
	private last: cool.SimplePoint;
	private moved = new Map<number, cool.Matrix3D>();
	private ghost: { lines: cool.Polygon2D[]; frame: cool.Range2D } | null = null;

	private constructor(
		selection: SelectionSection,
		data: cool.VectorPrimitivesData,
		sceneId: number,
		objectIds: number[],
		toTheSquare: cool.Matrix2D,
		fromTheSquare: cool.Matrix3D,
		orientationInverse: cool.Matrix3D,
		outerInverse: Map<number, cool.Matrix3D>,
		start: cool.SimplePoint,
	) {
		super(selection);
		this.data = data;
		this.sceneId = sceneId;
		this.objectIds = objectIds;
		this.toTheSquare = toTheSquare;
		this.fromTheSquare = fromTheSquare;
		this.orientationInverse = orientationInverse;
		this.outerInverse = outerInverse;
		this.last = start;
	}

	/// Whether those objects move in 3D: they are 3D objects inside an entered scene.
	public static movesIn3D(objectIds: number[]): boolean {
		const what = Turn3DInteraction.turnsIn(objectIds);
		return !!what && !what.objectIds.includes(what.sceneId);
	}

	/// The move a press at that place on the selection begins, where it is 3D objects inside an
	/// entered scene; nothing for any other selection.
	public static begin(
		selection: SelectionSection,
		at: cool.SimplePoint,
	): Move3DInteraction | null {
		const data = RenderGeometrySection.currentPart();
		const what = Turn3DInteraction.turnsIn(selection.selectedObjects());
		if (!data || !what || what.objectIds.includes(what.sceneId)) return null;

		const view = data.objects.get(what.sceneId)?.scene3D;
		const toTheSquare = cool.Matrix2D.fromArray(view?.placement)?.invert();
		const projection = cool.Matrix3D.fromArray(view?.projection);
		const deviceToView = cool.Matrix3D.fromArray(view?.deviceToView);
		const orientationInverse = cool.Matrix3D.fromArray(
			view?.orientation,
		)?.invert();
		const fromTheSquare =
			projection && deviceToView ?
				projection.then(deviceToView).invert()
			:	null;
		if (!toTheSquare || !fromTheSquare || !orientationInverse) return null;

		const outerInverse = new Map<number, cool.Matrix3D>();
		for (const objectId of what.objectIds) {
			const inverse = cool.Scene3D.outerTransformOf(data, objectId).invert();
			if (!inverse) return null;
			outerInverse.set(objectId, inverse);
		}

		return new Move3DInteraction(
			selection,
			data,
			what.sceneId,
			what.objectIds,
			toTheSquare,
			fromTheSquare,
			orientationInverse,
			outerInverse,
			new cool.SimplePoint(at.x, at.y),
		);
	}

	/// A point of the page, or a way along it, in the space the camera looks from, at the middle
	/// of the depth.
	private intoTheEye(x: number, y: number): cool.Point3D {
		const onTheSquare = this.toTheSquare.apply(x, y);
		return this.fromTheSquare.apply(
			new cool.Point3D(onTheSquare.x, onTheSquare.y, 0.5),
		);
	}

	public move(to: cool.SimplePoint, event?: MouseEvent): void {
		/*
			As the office moves: the step since the last move, the place it goes to and the place
			it starts from, both taken into the eye, gives the way to go there; with Alt its
			second axis is the depth.
		*/
		let head = this.intoTheEye(to.x - this.last.x, to.y - this.last.y);
		let tail = this.intoTheEye(0, 0);
		this.last = new cool.SimplePoint(to.x, to.y);
		if (event?.altKey) {
			head = new cool.Point3D(head.x, head.z, head.y);
			tail = new cool.Point3D(tail.x, tail.z, tail.y);
		}

		for (const objectId of this.objectIds) {
			const toTheParent = this.orientationInverse.then(
				this.outerInverse.get(objectId) ?? cool.Matrix3D.IDENTITY,
			);
			const from = toTheParent.apply(tail);
			const there = toTheParent.apply(head);
			const now =
				this.moved.get(objectId) ??
				cool.Scene3D.transformOf(this.data, objectId);
			if (!now) continue;
			this.moved.set(
				objectId,
				now.then(
					cool.Matrix3D.translation(
						there.x - from.x,
						there.y - from.y,
						there.z - from.z,
					),
				),
			);
		}

		this.ghost = cool.Scene3D.outlineAfter(
			this.data,
			this.sceneId,
			this.moved,
			this.objectIds,
		);
		this.selection.containerObject?.requestReDraw();
	}

	public finish(to: cool.SimplePoint, event?: MouseEvent): void {
		this.move(to, event);
		if (!this.ghost) return;
		Turn3DInteraction.send(
			this.data,
			this.sceneId,
			this.moved,
			this.outline(),
			this.ghost?.frame ?? null,
		);
	}

	/// The handles hide while the objects move, as they stand where the objects were.
	public handles(known: SelectionHandle[]): SelectionHandle[] {
		return this.ghost ? [] : known;
	}

	public outline(): cool.ObjectPathPolygon[] | null {
		return this.ghost ?
				this.ghost.lines.map((line: cool.Polygon2D) => ({
					closed: line.closed,
					points: line.points.map((point: cool.Point) => ({
						x: point.x,
						y: point.y,
					})),
				}))
			:	null;
	}
}

/*
	A scale in 3D of the 3D objects selected inside an entered scene, by a drag of one of the eight,
	as the office scales them: the place the drag began, the mouse and the place that stays, the
	handle facing the one dragged, are taken into the space the camera looks from, and each
	object is scaled there about the place that stays, by how much farther from it the mouse is
	than the start was. A handle in the middle of a side scales along one axis only. Shift scales
	both axes alike, by the larger factor; Alt scales about the middle of the selection. The scale
	is worked out from the objects as they were at the press, every time.
*/
class Scale3DInteraction extends SelectionInteraction {
	private readonly data: cool.VectorPrimitivesData;
	private readonly sceneId: number;
	private readonly objectIds: number[];
	private readonly toTheSquare: cool.Matrix2D;
	private readonly fromTheSquare: cool.Matrix3D;
	private readonly orientation: cool.Matrix3D;
	private readonly orientationInverse: cool.Matrix3D;
	private readonly turnedOnes: (TurnedIn3D & { depth: number })[];
	private readonly box: cool.Range2D;
	// where the dragged handle sits on the box, from nought to one along each side
	private readonly place: cool.Point;
	public readonly start: cool.SimplePoint;
	private scaled = new Map<number, cool.Matrix3D>();
	private ghost: { lines: cool.Polygon2D[]; frame: cool.Range2D } | null = null;

	private constructor(
		selection: SelectionSection,
		data: cool.VectorPrimitivesData,
		sceneId: number,
		objectIds: number[],
		toTheSquare: cool.Matrix2D,
		fromTheSquare: cool.Matrix3D,
		orientation: cool.Matrix3D,
		orientationInverse: cool.Matrix3D,
		turnedOnes: (TurnedIn3D & { depth: number })[],
		box: cool.Range2D,
		place: cool.Point,
		start: cool.SimplePoint,
	) {
		super(selection);
		this.data = data;
		this.sceneId = sceneId;
		this.objectIds = objectIds;
		this.toTheSquare = toTheSquare;
		this.fromTheSquare = fromTheSquare;
		this.orientation = orientation;
		this.orientationInverse = orientationInverse;
		this.turnedOnes = turnedOnes;
		this.box = box;
		this.place = place;
		this.start = start;
	}

	/// The scale a press on one of the eight begins, where the selection is 3D objects inside an
	/// entered scene; nothing for any other selection.
	public static begin(
		selection: SelectionSection,
		handle: SelectionHandle,
	): Scale3DInteraction | null {
		return Scale3DInteraction.prepare(selection, handle, null);
	}

	/*
		An arrow key on one of the eight: the handle goes by the step the key gives, and the
		objects are scaled as a drag of it there would. A step that comes before the engine
		answered the last one goes on from where that one left the objects, their transforms and
		their frame, as the records do not show it yet.
	*/
	public static scaleByKey(
		selection: SelectionSection,
		handle: SelectionHandle,
		by: cool.Point,
	): void {
		const data = RenderGeometrySection.currentPart();
		const left =
			data ?
				Turn3DInteraction.whereTheKeysLeft(
					selection.selectedObjects(),
					data.version,
				)
			:	null;
		const scale = Scale3DInteraction.prepare(selection, handle, left);
		if (!scale) return;
		scale.finish(
			new cool.SimplePoint(scale.start.x + by.x, scale.start.y + by.y),
		);
	}

	/// The scale of one of the eight, from the objects as the records hold them or, where left
	/// is given, as the keys left them.
	private static prepare(
		selection: SelectionSection,
		handle: SelectionHandle,
		left: {
			transforms: Map<number, cool.Matrix3D>;
			frame: cool.Range2D | null;
		} | null,
	): Scale3DInteraction | null {
		const data = RenderGeometrySection.currentPart();
		const objectIds = selection.selectedObjects();
		if (!data || !Move3DInteraction.movesIn3D(objectIds)) return null;
		const what = Turn3DInteraction.turnsIn(objectIds);
		const recorded = Turn3DInteraction.boxOf(objectIds);
		const view = what && data.objects.get(what.sceneId)?.scene3D;
		if (!what || !recorded || !view) return null;

		// where the handle stands on the box, which is not always where its kind says: the
		// square of a 3D object can be drawn turned over
		const share = (at: number, from: number, size: number): number =>
			size > 0 ? Math.round(((at - from) / size) * 2) / 2 : 0.5;
		const place = new cool.Point(
			share(handle.point.x, recorded.minX, recorded.width),
			share(handle.point.y, recorded.minY, recorded.height),
		);
		// the box the objects stand in now, and the handle at its place there
		const box = left?.frame ?? recorded;
		const start = new cool.SimplePoint(
			box.minX + place.x * box.width,
			box.minY + place.y * box.height,
		);

		const toTheSquare = cool.Matrix2D.fromArray(view.placement)?.invert();
		const projection = cool.Matrix3D.fromArray(view.projection);
		const deviceToView = cool.Matrix3D.fromArray(view.deviceToView);
		const orientation = cool.Matrix3D.fromArray(view.orientation);
		const orientationInverse = orientation?.invert();
		const fromTheSquare =
			projection && deviceToView ?
				projection.then(deviceToView).invert()
			:	null;
		if (!toTheSquare || !fromTheSquare || !orientation || !orientationInverse)
			return null;

		const turnedOnes: (TurnedIn3D & { depth: number })[] = [];
		for (const objectId of what.objectIds) {
			const before =
				left?.transforms.get(objectId) ??
				cool.Scene3D.transformOf(data, objectId);
			const outer = cool.Scene3D.outerTransformOf(data, objectId);
			const outerInverse = outer.invert();
			const middle = cool.Scene3D.middleInItsOwnSpace(data, objectId);
			if (!before || !outerInverse || !middle || !projection || !deviceToView)
				return null;
			/*
				The depth on the screen the points of the drag are taken at: that of the object's
				middle as the camera sees it, so the place that stays lies on the object's edge as
				one sees it. The office takes the depth of the middle in the object's own space
				instead, which only matches for an object centred at nought.
			*/
			const seen = before
				.then(outer)
				.then(orientation)
				.then(projection)
				.then(deviceToView)
				.apply(middle);
			turnedOnes.push({
				id: objectId,
				before: before,
				outer: outer,
				outerInverse: outerInverse,
				depth: seen.z,
			});
		}

		return new Scale3DInteraction(
			selection,
			data,
			what.sceneId,
			what.objectIds,
			toTheSquare,
			fromTheSquare,
			orientation,
			orientationInverse,
			turnedOnes,
			box,
			place,
			// the drag starts at the handle itself, as the office's does
			start,
		);
	}

	public move(to: cool.SimplePoint, event?: MouseEvent): void {
		const fromTheMiddle = event?.altKey === true;
		const fixed =
			fromTheMiddle ?
				new cool.Point(
					(this.box.minX + this.box.maxX) / 2,
					(this.box.minY + this.box.maxY) / 2,
				)
			:	new cool.Point(
					this.box.minX + (1 - this.place.x) * this.box.width,
					this.box.minY + (1 - this.place.y) * this.box.height,
				);

		for (const one of this.turnedOnes) {
			const intoTheEye = (x: number, y: number): cool.Point3D => {
				const onTheSquare = this.toTheSquare.apply(x, y);
				return this.fromTheSquare.apply(
					new cool.Point3D(onTheSquare.x, onTheSquare.y, one.depth),
				);
			};
			const from = intoTheEye(this.start.x, this.start.y);
			const next = intoTheEye(to.x, to.y);
			const stays = intoTheEye(fixed.x, fixed.y);

			const factor = (was: number, now: number): number =>
				was !== 0 ? now / was : 1;
			// a handle in the middle of a side scales along its own axis only
			const acrossOnly = !fromTheMiddle && this.place.y === 0.5;
			const downOnly = !fromTheMiddle && this.place.x === 0.5;
			let x = downOnly ? 1 : factor(from.x - stays.x, next.x - stays.x);
			let y = acrossOnly ? 1 : factor(from.y - stays.y, next.y - stays.y);
			if (event?.shiftKey) {
				if (Math.abs(x) > Math.abs(y)) y = x;
				else x = y;
			}

			this.scaled.set(
				one.id,
				one.before
					.then(one.outer)
					.then(this.orientation)
					.then(cool.Matrix3D.translation(-stays.x, -stays.y, -stays.z))
					.then(cool.Matrix3D.scaling(x, y, 1))
					.then(cool.Matrix3D.translation(stays.x, stays.y, stays.z))
					.then(this.orientationInverse)
					.then(one.outerInverse),
			);
		}

		this.ghost = cool.Scene3D.outlineAfter(
			this.data,
			this.sceneId,
			this.scaled,
			this.objectIds,
		);
		this.selection.containerObject?.requestReDraw();
	}

	public finish(to: cool.SimplePoint, event?: MouseEvent): void {
		this.move(to, event);
		if (!this.ghost) return;
		Turn3DInteraction.send(
			this.data,
			this.sceneId,
			this.scaled,
			this.outline(),
			this.ghost?.frame ?? null,
		);
	}

	/// The handles hide while the objects are scaled, as they stand where the objects were.
	public handles(known: SelectionHandle[]): SelectionHandle[] {
		return this.ghost ? [] : known;
	}

	public outline(): cool.ObjectPathPolygon[] | null {
		return this.ghost ?
				this.ghost.lines.map((line: cool.Polygon2D) => ({
					closed: line.closed,
					points: line.points.map((point: cool.Point) => ({
						x: point.x,
						y: point.y,
					})),
				}))
			:	null;
	}
}
