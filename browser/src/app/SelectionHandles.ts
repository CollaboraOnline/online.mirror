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
	One handle of a selection. The name is what the handle is called wherever it is spoken about,
	and whoever makes the handles says what it is made of: a handle the engine moves carries the
	kind, the polygon and the point the engine knows it by, a handle of a path carries the place
	its point has in that path. The point is in twips.
*/
interface SelectionHandle {
	name: string;
	kind: string;
	pointer: string;
	point: cool.Point;
	/// The name of the group of handles it came from, which is what draws it, what a press on it
	/// asks and what a key on it asks. Absent for a handle that stands outside the groups.
	group?: string;
}

/*
	Something that has handles: a selected object, a selection of several, the editor of a
	polyPolygon. One of them can hold others, so that an object being edited offers its own
	handles and the points of a path that belongs to it at the same time.
*/
interface HandleSource {
	/// The handles it has, in the order they are drawn and traveled.
	handles(): SelectionHandle[];
}

/*
	The points a connector can tie itself to: the ones someone added to an object, and the four an
	object falls back on, which lie in the middle of each side of the box around it.

	They are shown and no more: there is no name by which one of them could be spoken about, so the
	keyboard passes them by and the mouse cannot take hold of one.
*/
class GluePointHandles {
	/// One point to tie to, at that place, of the kind that says where it comes from.
	private static handleAt(x: number, y: number, kind: string): SelectionHandle {
		return {
			name: '',
			kind: kind,
			pointer: '0',
			point: new cool.Point(x, y).round(),
		};
	}

	/*
		The points someone added to that object, where the object carries them. They are named by
		the place they have in the object's own list, so the keyboard can walk them, and the
		mouse finds them where they lie.
	*/
	public static ownPointsOf(objectId: number): SelectionHandle[] {
		const object = RenderGeometrySection.objectOf(objectId);
		const transform = RenderGeometrySection.transformOf(objectId);
		if (!transform) return [];

		return (object?.gluePoints ?? []).map(
			(point: { x: number; y: number }, at: number) => {
				const onThePage = transform.apply(point.x, point.y);

				return {
					...GluePointHandles.handleAt(onThePage.x, onThePage.y, 'GluePoint'),
					name: 'GluePoint.' + String(at),
				};
			},
		);
	}

	/*
		The four points an object falls back on, in the middle of each side of the box around it.
		The box is upright, as the drawing layer takes it for these: an object that is turned is
		reached at the sides of the box it stands in, not at the sides it was given.
	*/
	public static defaultPointsOf(objectId: number): SelectionHandle[] {
		const transform = RenderGeometrySection.transformOf(objectId);
		if (!transform) return [];

		const box = cool.Range2D.fromPoints(
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
			].map(([x, y]: number[]) => transform.apply(x, y)),
		);

		const fallback = 'DefaultGluePoint';

		return [
			GluePointHandles.handleAt(box.centerX, box.minY, fallback),
			GluePointHandles.handleAt(box.maxX, box.centerY, fallback),
			GluePointHandles.handleAt(box.centerX, box.maxY, fallback),
			GluePointHandles.handleAt(box.minX, box.centerY, fallback),
		];
	}
}

/*
	The handles of a selection of objects, worked out from the geometry the client holds: the
	eight that frame the selection, and the ones that shape a single object, its corner radius
	and the points a custom shape is shaped by.
*/
class ObjectHandles implements HandleSource {
	private objectIds: number[];

	constructor(objectIds: number[]) {
		this.objectIds = objectIds;
	}

	public handles(): SelectionHandle[] {
		if (!this.objectIds.length) return [];

		if (this.isATiedConnector())
			return [...this.shapingHandles(), ...this.ownGluePoints()];

		const framing = ObjectHandles.framingOf(this.objectIds);
		if (!framing) return [];

		return [...framing, ...this.shapingHandles(), ...this.ownGluePoints()];
	}

	/*
		The points someone added to the object for a connector to tie itself to. They belong to the
		object, so they are shown while it is selected, after the handles that shape it and before
		the points of its path.
	*/
	private ownGluePoints(): SelectionHandle[] {
		if (this.objectIds.length !== 1) return [];

		return GluePointHandles.ownPointsOf(this.objectIds[0]);
	}

	/// The number the drawing layer gives a connector among the kinds of object.
	private static readonly connectorKind: number = 24;

	/// Whether the object of that id is a connector.
	public static isAConnector(objectId: number): boolean {
		return (
			RenderGeometrySection.objectOf(objectId)?.objectKind ===
			ObjectHandles.connectorKind
		);
	}

	/// Whether the object of that id is a connector that is tied to an object at either end.
	public static isATiedConnector(objectId: number): boolean {
		if (!ObjectHandles.isAConnector(objectId)) return false;

		const object = RenderGeometrySection.objectOf(objectId);

		return object?.tiedAtStart === true || object?.tiedAtEnd === true;
	}

	/// Whether what is selected is one connector that is tied to an object.
	private isATiedConnector(): boolean {
		return (
			this.objectIds.length === 1 &&
			ObjectHandles.isATiedConnector(this.objectIds[0])
		);
	}

	/*
		The eight handles that frame what is selected, from the upper left one to the lower right
		one, worked out from the objects the client holds. One object is framed by its own
		mapping, so the handles turn with it; several are framed by one upright box around them
		all, and the whole selection is scaled by it. Nothing where the client holds no geometry
		for what is selected.
	*/
	public static framingOf(objectIds: number[]): SelectionHandle[] | undefined {
		/*
			A connector that is tied to an object runs from where it is tied, so scaling it or
			turning it leads nowhere: it is offered the points along its way alone, and neither
			the eight nor the handle that turns them, which is made from the eight.
		*/
		if (objectIds.length === 1 && ObjectHandles.isATiedConnector(objectIds[0]))
			return undefined;

		return new ObjectHandles(objectIds).framingHandles();
	}

	/// The handles that shape the objects, which only one object on its own has.
	public static shapingOf(objectIds: number[]): SelectionHandle[] {
		return new ObjectHandles(objectIds).shapingHandles();
	}

	private framingHandles(): SelectionHandle[] | undefined {
		const mapping = this.framingMapping();
		if (!mapping) return undefined;

		// A framing handle sits on each corner of the unit square and halfway along each side,
		// taken onto the page by the mapping.
		const corners = [
			[0, 0],
			[0.5, 0],
			[1, 0],
			[0, 0.5],
			[1, 0.5],
			[0, 1],
			[0.5, 1],
			[1, 1],
		].map(([x, y]: number[]) => mapping.apply(x, y));

		// The pointer the engine asks for at each of the eight, in the same order.
		const pointers = [11, 7, 12, 9, 10, 13, 8, 14];

		/*
			An object without width or height would have handles on top of each other, so only the
			ones that stand apart are made: the corners go where there is both width and height,
			the handle in the middle of a side where the side has a length, and an object that is
			a point keeps the upper left one alone. The engine draws them by the same rule.
		*/
		const [upperLeft, upperRight, lowerLeft] = [
			corners[0],
			corners[2],
			corners[5],
		];
		const hasWidth = !upperLeft.equals(upperRight);
		const hasHeight = !upperLeft.equals(lowerLeft);

		const wanted = (kind: number): boolean => {
			if (!hasWidth && !hasHeight) return kind === 1;
			// The corners, and the middle of a side across the direction that has a length.
			if (kind === 2 || kind === 7) return hasWidth;
			if (kind === 4 || kind === 5) return hasHeight;
			return hasWidth && hasHeight;
		};

		/*
			What draws the handles expects the whole set of eight and reads them by kind, so an
			object that would have fewer of them is left to the engine, which sends the handles
			that object really has.
		*/
		if (![1, 2, 3, 4, 5, 6, 7, 8].every(wanted)) return undefined;

		return corners.map((corner: cool.Point, index: number) => ({
			name: String(index + 1) + '.0.0',
			kind: String(index + 1),
			pointer: String(pointers[index]),
			point: corner.round(),
		}));
	}

	/*
		The mapping of the unit square onto what the framing handles stand around. One object is
		framed by its own mapping, so the handles turn with it; several are framed by one upright
		box around them all. Nothing where the client holds no geometry for what is selected.
	*/
	private framingMapping(): cool.Matrix2D | null {
		if (this.objectIds.length === 1)
			return RenderGeometrySection.transformOf(this.objectIds[0]);

		let box: cool.Range2D | null = null;
		for (const objectId of this.objectIds) {
			const one = RenderGeometrySection.boxOf(objectId);
			if (!one) return null;

			box = box ? box.union(one) : one;
		}

		return box ? cool.Matrix2D.fromRange(box) : null;
	}

	/*
		The handles that shape one object, which it carries itself: the corner radius of a
		rectangle and the points a custom shape is shaped by. A selection of several objects
		shapes none of them, it only frames them.
	*/
	private shapingHandles(): SelectionHandle[] {
		if (this.objectIds.length !== 1) return [];

		const object = RenderGeometrySection.objectOf(this.objectIds[0]);

		return (object?.handles ?? []).map((handle: cool.ObjectHandle) => ({
			name:
				String(handle.kind) +
				'.' +
				String(handle.polygon ?? 0) +
				'.' +
				String(handle.point ?? 0),
			kind: String(handle.kind),
			pointer: '28',
			point: new cool.Point(handle.x, handle.y),
		}));
	}

	/*
		The handles grouped by kind, which is the shape the section that draws a selection from
		tiles reads them in. It names each handle by an id as well, which that section uses to
		name the piece of canvas it gives the handle. It goes when the tile path goes.
	*/
	public static asKinds(handles: SelectionHandle[]): any | undefined {
		if (!handles.length) return undefined;

		/*
			That section reads the eight by their kind and stands on their being there, so a set
			without them is not for it: an object shaped by its own points keeps the set the
			engine sent, which is what that section was written for.
		*/
		const framing = handles.filter((handle: SelectionHandle) => {
			const kind = Number(handle.kind);
			return kind >= 1 && kind <= 8;
		});
		if (framing.length !== 8) return undefined;

		const withId = (handle: SelectionHandle) => ({
			...handle,
			id: handle.name,
		});

		const rectangle: any = {};
		const shaping: any[] = [];
		for (const handle of handles) {
			if (Number(handle.kind) <= 8) rectangle[handle.kind] = [withId(handle)];
			else shaping.push(withId(handle));
		}

		const kinds: any = {
			rectangle: rectangle,
			poly: '',
			anchor: '',
			others: '',
		};
		if (shaping.length) kinds.custom = { '22': shaping };

		return { kinds: kinds };
	}
}
