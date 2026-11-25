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
	the engine will give the scene, and the frame grows and shrinks with them. At the end the
	engine is told the new 3D transforms, which it applies as one step.
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

	// the angles reached, in degrees, snapped where a key asks for it
	private angles: number[] = [0, 0];
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
		const onTheSquare = toTheSquare.apply(handle.point.x, handle.point.y);
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
			new cool.SimplePoint(handle.point.x, handle.point.y),
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

		const pair = Turn3DInteraction.pairs[Turn3DInteraction.pairInUse];
		const turn = Turn3DInteraction.turnAbout(pair[0], this.angles[0]).then(
			Turn3DInteraction.turnAbout(pair[1], this.angles[1]),
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
		this.turned = new Map<number, cool.Matrix3D>();
		for (const one of this.turnedOnes)
			this.turned.set(
				one.id,
				one.before
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
		this.selection.containerObject?.requestReDraw();
	}

	public finish(to: cool.SimplePoint, event?: MouseEvent): void {
		this.move(to, event);
		if (this.angles[0] === 0 && this.angles[1] === 0) return;

		const transforms: string[] = [];
		for (const [objectId, transform] of this.turned)
			transforms.push(
				String(objectId) + ',' + transform.toArray().map(String).join(','),
			);
		ChangeOutbox.sendAChange(
			'setobjecttransform to=' + transforms.join(';') + ' as=turn3d',
		);
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

	/// The handle in the middle hides while it turns, the others stay where they stand.
	public handles(known: SelectionHandle[]): SelectionHandle[] {
		return known.filter(
			(handle: SelectionHandle) => handle.kind !== Turn3DHandle.kind,
		);
	}

	public outline(): cool.ObjectPathPolygon[] | null {
		if (!this.ghost) return null;

		const polygons: cool.ObjectPathPolygon[] = this.ghost.lines.map(
			(line: cool.Polygon2D) => ({
				closed: line.closed,
				points: line.points.map((point: cool.Point) => ({
					x: point.x,
					y: point.y,
				})),
			}),
		);
		const frame = this.ghost.frame;
		polygons.push({
			closed: true,
			points: [
				{ x: frame.minX, y: frame.minY },
				{ x: frame.maxX, y: frame.minY },
				{ x: frame.maxX, y: frame.maxY },
				{ x: frame.minX, y: frame.maxY },
			],
		});
		return polygons;
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
