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

namespace cool {
	/** One handle of an object that a reader cannot work out from what the object draws: the
	 * corner radius of a rectangle, kind 11, and the points a custom shape is shaped by, kind 22.
	 *
	 * The kind, with the polygon and the point it belongs to and whether it is the weight behind
	 * that point, is what names the handle wherever it is spoken about. The position is in twips.
	 */
	export interface ObjectHandle {
		kind: number;
		polygon?: number;
		point?: number;
		behindThePoint?: boolean;
		x: number;
		y: number;
	}

	/** One point of a path, in twips, with the weights of the curve it lies on where they are
	 * in use: the one behind the point and the one ahead of it, named as a handle names them.
	 */
	export interface ObjectPathPoint {
		x: number;
		y: number;
		behindX?: number;
		behindY?: number;
		aheadX?: number;
		aheadY?: number;
		/// How the curve carries on through the point: 1 when the two weights lie on one line
		/// through it, 2 when they lie on one line and are the same length as well. Absent when
		/// the curve turns a corner there. It is worked out by the engine on the model's own
		/// numbers, which are finer than the twips here.
		continuity?: 1 | 2;
	}

	/** One polygon of the path of an object, as the model holds it. The polygons and their
	 * points keep the model's order, which is the order that names a point when it is moved.
	 */
	export interface ObjectPathPolygon {
		closed?: boolean;
		points: ObjectPathPoint[];
	}

	/// One drawable object on a slide, carrying its primitive tree.
	export interface SlideObject {
		/// Stable identity of the object: the engine's SdrObject unique
		/// id, unchanged across edits to the same object.
		id?: number;
		/// The aids that mark out a placeholder: a dashed boundary around
		/// the area it occupies and, on a master page, the name of the
		/// area. They are drawn apart from the object's own content.
		aids?: Primitive[];
		/// "page" for the entry that stands for the slide itself: it is
		/// drawn first and holds the background, the page fill and the
		/// master page content, and its box is the slide.
		/// "texteditoverlay" for an entry that carries the text of a
		/// running text edit: it is drawn last, over the object it runs
		/// on, which hides its own text while the edit runs. There is one
		/// per view that is editing, and two of them can name the same
		/// object. Absent for a drawing object.
		kind?: 'page' | 'texteditoverlay';
		/// Which view's text edit an entry of kind "texteditoverlay"
		/// carries, so a reader can tell its own from another user's.
		viewId?: number;
		/// Id of the group the object sits in, 0 for an object directly
		/// on the slide and -1 on the entry of kind "page", which sits
		/// under nothing, so a walk up the parents ends there. A group's
		/// members follow it in the object list and draw its content, so
		/// a group with members has no primitives of its own.
		parent?: number;
		/// Id of the layer the object is on.
		layer?: number;
		/// True for a placeholder that holds no content of its own yet.
		emptyPlaceholder?: boolean;
		/// On the entry of kind "page" of a slide: the id of the master part
		/// the slide draws under itself. Absent when the page carries its
		/// master content inline.
		masterPartId?: VectorPartGuid;
		/// On the entry of kind "page" of a slide: the ids of the layers of
		/// its master the slide does not show. Absent when it shows them all.
		masterHiddenLayers?: number[];
		/// On an object of a slide: it is the slide's own copy of a master
		/// placeholder, rendered for this slide.
		masterContent?: boolean;
		/// On a master object: it is a layout prototype, or an empty
		/// placeholder with neither fill nor line.
		hiddenBehindSlide?: boolean;
		/// On a master object: its content differs per slide. Each slide
		/// carries its own copy of it, under this object's id.
		slideDependent?: boolean;
		/// True while a text edit is running on the object. It shows none of
		/// its own text then, and the entry of kind "texteditoverlay"
		/// carries what has been typed.
		textEdit?: boolean;
		/// Rectangle the object paints, in twips: the primitives' range,
		/// so it takes in the line width and a shadow.
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		/// Mapping of the unit square onto the object, in twips, as the
		/// six canvas matrix values [a, b, c, d, e, f].
		transform?: number[];
		/// The handles that shape the object, empty for an object that has none of them.
		handles?: ObjectHandle[];
		/// The path the object is drawn from, as the model holds it. Absent for an object
		/// that has no path of its own.
		path?: ObjectPathPolygon[];
		primitives?: Primitive[];
	}
}
