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
	One handle of a selection. The name is what the handle is called wherever it is spoken
	about, the engine included: the kind, the polygon and the point it belongs to, and "behind"
	for the weight that sits behind its point. The point is in twips.
*/
interface SelectionHandle {
	name: string;
	kind: string;
	pointer: string;
	point: cool.Point;
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

		const framing = this.framingHandles();
		if (!framing) return [];

		return [...framing, ...this.shapingHandles()];
	}

	/*
		The eight handles that frame what is selected, from the upper left one to the lower right
		one, worked out from the objects the client holds. One object is framed by its own
		mapping, so the handles turn with it; several are framed by one upright box around them
		all, and the whole selection is scaled by it. Nothing where the client holds no geometry
		for what is selected.
	*/
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
			return cool.Matrix2D.fromArray(
				RenderGeometrySection.objectOf(this.objectIds[0])?.transform,
			);

		let box: cool.Range2D | null = null;
		for (const objectId of this.objectIds) {
			const object = RenderGeometrySection.objectOf(objectId);
			if (!object || object.x === undefined || object.y === undefined)
				return null;

			const one = new cool.Range2D(
				object.x,
				object.y,
				object.x + (object.width ?? 0),
				object.y + (object.height ?? 0),
			);
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
				String(handle.point ?? 0) +
				(handle.behindThePoint ? '.behind' : ''),
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
