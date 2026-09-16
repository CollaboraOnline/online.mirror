// @ts-strict-ignore
/* -*- js-indent-level: 8; fill-column: 100 -*- */

/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare var JSDialog: any;

class GraphicSelection {
	/*
		The drawing objects the selection stands on, by the unique ids the engine gives them, empty
		while nothing is selected. They all sit at the same level: directly on the page, or in one
		and the same group.
	*/
	public static selectedObjectIDs: number[] = [];

	/*
		True when the selection that arrived last was made somewhere other than here - the
		keyboard, an undo, another user - and false when it is the one this client asked for.
	*/
	public static selectionCameFromElsewhere: boolean = false;
	public static rectangle: cool.SimpleRectangle | null = null;
	public static extraInfo: any = null;
	public static selectionAngle: number = 0;
	public static handlesSection: ShapeHandlesSection = null;
	public static chartContextToolbarSelectStyle: ChartContextButtonSection =
		null;
	public static chartContextToolbarSaveStyle: ChartContextButtonSection = null;
	public static diagramButton: DiagramButtonSection = null;
	/// The object the dark overlay was last laid out for.
	public static darkOverlayRectangle: cool.SimpleRectangle | null = null;

	public static hasActiveSelection() {
		return this.rectangle !== null;
	}

	public static onUpdatePermission() {
		this.rectangle = null;
		this.updateGraphicSelection();
	}

	/*
		Marks the drawing objects with the given unique ids, and nothing else. The engine is told
		which objects they are rather than where the click was, so what the client hit and what the
		engine marks are one thing. An empty list asks for no selection at all.
	*/
	public static selectObjects(objectIds: number[]) {
		this.selectedObjectIDs = objectIds.slice();
		app.socket.sendMessage('selectobjects ids=' + objectIds.join(','));
	}

	/*
		Takes up the selection the engine reports and says whether it is another one than the
		client holds. It is the same one whenever the client asked for it, since the answer names
		the objects it named itself.
	*/
	public static selectionChanged(objectIds: number[]): boolean {
		const changed =
			objectIds.length !== this.selectedObjectIDs.length ||
			objectIds.some(
				(objectId: number, index: number) =>
					objectId !== this.selectedObjectIDs[index],
			);

		this.selectedObjectIDs = objectIds.slice();
		this.selectionCameFromElsewhere = changed;
		return changed;
	}

	/// The objects the engine says are selected, in the order it marked them.
	private static selectedObjectIDsOf(extraInfo: any): number[] {
		const objectIds = extraInfo?.uniqueIds;
		return Array.isArray(objectIds) ? objectIds : [];
	}

	/*
		The boxes of the other objects of the page, in pixels, for a drag to snap to. While the
		document is drawn from objects the client works them out from what it holds; otherwise they
		are the ones the engine sends along with the selection. What is being dragged is left out,
		since a drag does not snap to itself.
	*/
	public static snapRectangles(): number[][] {
		if (RenderManager.isVectorRendering()) {
			// The boxes the client holds are twips already, where the ones the engine sends are
			// hundredths of a millimetre and are corrected on their way in.
			const scale = app.twipsToPixels;
			const rectangles: number[][] = [];

			RenderGeometrySection.objectBoxes().forEach(
				(box: number[], objectId: number) => {
					if (this.selectedObjectIDs.includes(objectId)) return;
					rectangles.push(box.map((value: number) => value * scale));
				},
			);

			return rectangles;
		}

		const rectangles = this.extraInfo?.ObjectRectangles;
		if (!Array.isArray(rectangles)) return [];

		const ordNum = this.extraInfo.OrdNum;
		return rectangles.filter((rectangle: number[]) => rectangle[4] !== ordNum);
	}

	/*
		The eight handles that frame what is selected, in the order the engine numbers them: upper
		left, upper, upper right, left, right, lower left, lower, lower right. One object is framed
		by its own shape, so a rotated object is framed at its rotated corners; several objects are
		framed by the upright box around all of them, which is what a drag on such a handle scales.
	*/
	private static framingHandles(objectIds: number[]): any[] | undefined {
		const corners: number[][] = [];

		if (objectIds.length === 1) {
			const transform = RenderGeometrySection.objectOf(objectIds[0])?.transform;
			if (!transform) return undefined;

			const unitSquare = RenderGeometrySection.unitRectangleCorners(transform);
			// The unit rectangle answers its four corners, and a framing handle sits on each of
			// them and halfway along each side.
			const [upperLeft, upperRight, lowerRight, lowerLeft] = unitSquare;
			const middle = (one: number[], other: number[]) => [
				(one[0] + other[0]) / 2,
				(one[1] + other[1]) / 2,
			];

			corners.push(
				upperLeft,
				middle(upperLeft, upperRight),
				upperRight,
				middle(upperLeft, lowerLeft),
				middle(upperRight, lowerRight),
				lowerLeft,
				middle(lowerLeft, lowerRight),
				lowerRight,
			);
		} else {
			let left = Infinity;
			let top = Infinity;
			let right = -Infinity;
			let bottom = -Infinity;

			for (const objectId of objectIds) {
				const object = RenderGeometrySection.objectOf(objectId);
				if (!object || object.x === undefined || object.y === undefined)
					return undefined;

				left = Math.min(left, object.x);
				top = Math.min(top, object.y);
				right = Math.max(right, object.x + (object.width ?? 0));
				bottom = Math.max(bottom, object.y + (object.height ?? 0));
			}

			const middleX = (left + right) / 2;
			const middleY = (top + bottom) / 2;
			corners.push(
				[left, top],
				[middleX, top],
				[right, top],
				[left, middleY],
				[right, middleY],
				[left, bottom],
				[middleX, bottom],
				[right, bottom],
			);
		}

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
		const hasWidth =
			upperLeft[0] !== upperRight[0] || upperLeft[1] !== upperRight[1];
		const hasHeight =
			upperLeft[0] !== lowerLeft[0] || upperLeft[1] !== lowerLeft[1];

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

		return corners.map((corner: number[], index: number) => ({
			id: String(index + 1) + '.0.0',
			name: String(index + 1) + '.0.0',
			kind: String(index + 1),
			pointer: String(pointers[index]),
			point: { x: Math.round(corner[0]), y: Math.round(corner[1]) },
		}));
	}

	/*
		The handles of the selection, worked out from the objects the client holds: the eight that
		frame it, and the ones that shape a single object, its corner radius and the points a
		custom shape is shaped by. Each of them is named by what it is, which is how the engine is
		told which handle a drag moved. Nothing where the client holds no geometry for what is
		selected, so that the engine's own handles are used instead.
	*/
	public static localHandles(): any | undefined {
		const objectIds = this.selectedObjectIDs;
		if (!objectIds.length) return undefined;

		const framing = GraphicSelection.framingHandles(objectIds);
		if (!framing) return undefined;

		const rectangle: any = {};
		framing.forEach((handle: any) => {
			rectangle[handle.kind] = [handle];
		});

		const shaping: any[] = [];
		if (objectIds.length === 1) {
			const object = RenderGeometrySection.objectOf(objectIds[0]);
			for (const handle of object?.handles ?? []) {
				const name =
					String(handle.kind) +
					'.' +
					String(handle.polygon ?? 0) +
					'.' +
					String(handle.point ?? 0) +
					(handle.behindThePoint ? '.behind' : '');

				shaping.push({
					id: name,
					name: name,
					kind: String(handle.kind),
					pointer: '28',
					point: { x: handle.x, y: handle.y },
				});
			}
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

	/// The handles the client last worked out, as text, to tell a set that moved from one that
	/// did not.
	private static lastLocalHandles: string | null = null;

	/*
		Puts the handles the client works out into the selection, and says whether they differ from
		the ones drawn now.
	*/
	public static applyLocalHandles(): boolean {
		if (!RenderManager.isVectorRendering() || !this.extraInfo) return false;

		const handles = GraphicSelection.localHandles();
		if (!handles) return false;

		this.extraInfo.handles = handles;

		const shape = JSON.stringify(handles);
		const moved = shape !== this.lastLocalHandles;
		this.lastLocalHandles = shape;
		return moved;
	}

	/*
		Works the handles out again from the objects as they stand now. The engine reports a
		selection as soon as it changes, while the objects it stands on arrive with the update
		that follows, so the handles of a shape that was just dragged are worked out once more when
		that update lands. Without it they would show where the shape was before.

		Objects change far more often than a selection does - one update per keystroke while
		someone types - so the sections that draw the handles are built again only when the
		handles really moved.
	*/
	public static refreshLocalHandles(): void {
		if (GraphicSelection.applyLocalHandles() && this.handlesSection)
			this.handlesSection.refreshInfo(this.extraInfo);
	}

	/*
		What tells one selection from another: the objects it stands on, so a selection of two
		shapes differs from a selection of one of them. The engine names every marked object, and
		the first of them again on its own, which is what a payload from an older engine carries.
	*/
	private static selectionKeyOf(extraInfo: any): string {
		const objectIds = GraphicSelection.selectedObjectIDsOf(extraInfo);
		return objectIds.length ? String(objectIds) : String(extraInfo?.id);
	}

	static resetSelectionRanges() {
		this.selectionChanged([]);
		this.lastLocalHandles = null;
		this.rectangle = null;
		this.extraInfo = null;

		if (this.handlesSection) {
			this.handlesSection.removeSubSections();
			app.sectionContainer.removeSection(this.handlesSection.name);
			this.handlesSection = null;
		}
	}

	// shows the video inside current selection marker
	static onEmbeddedVideoContent(textMsg: string) {
		if (!this.handlesSection) return;

		var videoDesc = JSON.parse(textMsg);

		if (this.hasActiveSelection()) {
			videoDesc.width = this.rectangle.cWidth;
			videoDesc.height = this.rectangle.cHeight;
		}

		// proxy cannot identify RouteToken if it is encoded
		var routeTokenIndex = videoDesc.url.indexOf('%26RouteToken=');
		if (routeTokenIndex != -1) {
			videoDesc.url = videoDesc.url.replace(
				'%26RouteToken=',
				'&amp;RouteToken=',
			);
		}

		var videoToInsert =
			'<?xml version="1.0" encoding="UTF-8"?>\
		<svg xmlns="http://www.w3.org/2000/svg" width="' +
			videoDesc.width +
			'" height="' +
			videoDesc.height +
			'">\
		<foreignObject overflow="visible" width="' +
			videoDesc.width +
			'" height="' +
			videoDesc.height +
			'">\
			<body xmlns="http://www.w3.org/1999/xhtml">\
				<video controls="controls" width="' +
			videoDesc.width +
			'" height="' +
			videoDesc.height +
			'">\
					<source src="' +
			videoDesc.url +
			'" type="' +
			videoDesc.mimeType +
			'"/>\
					<track src="' +
			videoDesc.srt +
			'" kind="subtitles"' +
			'"/>\
				</video>\
			</body>\
		</foreignObject>\
		</svg>';

		this.handlesSection.addEmbeddedVideo(videoToInsert);
	}

	static renderDarkOverlay(rectangle: cool.SimpleRectangle = this.rectangle) {
		this.darkOverlayRectangle = rectangle;

		const anchor = app.activeDocument.activeLayout.documentAnchorPosition;
		var topLeft = new cool.Point(
			rectangle.v1X - anchor[0],
			rectangle.v1Y - anchor[1],
		);
		var bottomRight = new cool.Point(
			rectangle.v4X - anchor[0],
			rectangle.v4Y - anchor[1],
		);

		var bounds = new cool.Bounds(topLeft, bottomRight);

		app.map._docLayer._oleCSelections.setPointSet(CPointSet.fromBounds(bounds));
	}

	static refreshDarkOverlay() {
		if (this.darkOverlayRectangle && this.hasDarkOverlay())
			this.renderDarkOverlay(this.darkOverlayRectangle);
	}

	static hasDarkOverlay(): boolean {
		return !app.map._docLayer._oleCSelections.empty();
	}

	// When a shape is selected, the rectangles of other shapes are also sent from the core side.
	// They are in twips units.
	static convertObjectRectangleTwipsToPixels() {
		if (this.extraInfo && this.extraInfo.ObjectRectangles) {
			for (let i = 0; i < this.extraInfo.ObjectRectangles.length; i++) {
				for (let j = 0; j < 4; j++)
					this.extraInfo.ObjectRectangles[i][j] *=
						app.twipsToPixels * app.impress.twipsCorrection;
			}
		}
	}

	static extractAndSetGraphicSelection(messageJSON: any) {
		var hasExtraInfo = messageJSON.length > 5;
		var hasGridOffset = false;
		var extraInfo = null;
		if (hasExtraInfo) {
			extraInfo = messageJSON[5];
			if (extraInfo.gridOffsetX || extraInfo.gridOffsetY) {
				app.map._docLayer._shapeGridOffset = new cool.SimplePoint(
					extraInfo.gridOffsetX,
					extraInfo.gridOffsetY,
				);
				hasGridOffset = true;
			}
		}

		const rawWidth = Math.abs(messageJSON[2]);
		// Calc RTL reports shapes with a negative X as its own sign-encoding convention.
		// Everywhere else (Impress, Writer, non-RTL Calc), a negative X is an ordinary
		// coordinate - for example a shape dragged partly off the left edge of a slide -
		// and must be kept as-is.
		const rectX =
			app.map._docLayer.isCalcRTL() && messageJSON[0] < 0
				? Math.abs(messageJSON[0]) - rawWidth
				: messageJSON[0];

		this.rectangle = new cool.SimpleRectangle(
			rectX,
			messageJSON[1],
			rawWidth,
			messageJSON[3],
		);

		if (hasGridOffset) {
			this.rectangle.moveBy([
				app.map._docLayer._shapeGridOffset.x,
				app.map._docLayer._shapeGridOffset.y,
			]);
		} else if (app.map._docLayer._docType === 'spreadsheet') {
			const tl = new cool.SimplePoint(
				Math.abs(this.rectangle.x1),
				this.rectangle.y1,
			);
			app.map._docLayer.sheetGeometry.convertToTileTwips(tl);
			this.rectangle.moveTo(tl.toArray());
		}

		this.extraInfo = extraInfo;

		if (app.map._docLayer._docType === 'presentation')
			this.convertObjectRectangleTwipsToPixels();
	}

	/// Push down the graphic selection on non-first pages of scrolling PDF view.
	static transformGraphicSelection(messageJSON: any) {
		const docLayer = app.map._docLayer;
		const verticalOffset = docLayer.getFiledBasedViewVerticalOffset();
		if (!verticalOffset) {
			return;
		}

		// y
		messageJSON[1] += verticalOffset;

		const extraInfo = messageJSON[5];
		const rectangle = extraInfo?.handles?.kinds?.rectangle;
		if (!rectangle) {
			return;
		}

		for (const key of ['1', '2', '3', '4', '5', '6', '7', '8']) {
			const y = parseInt(rectangle[key][0].point.y);
			rectangle[key][0].point.y = y + verticalOffset;
		}
	}

	public static updateGraphicSelection() {
		if (this.hasActiveSelection()) {
			// Hide the keyboard on graphic selection, unless cursor is visible.
			// Keep the focus in a dialog input or the search bar.
			if (!JSDialog.IsAnyInputFocused() && !app.map.isSearching())
				app.map.focus(app.file.textCursor.visible);

			let editMode = app.map.isEditMode();
			if (!editMode) {
				// If the just added signature line shape is selected, show the
				// graphic selection.
				editMode = this.extraInfo && this.extraInfo.isSignature;
			}

			if (
				!editMode &&
				!this.extraInfo.mimeType?.startsWith('video/') &&
				!this.extraInfo.mimeType?.startsWith('audio/')
			) {
				return;
			}

			var extraInfo = this.extraInfo;
			let addHandlesSection = false;

			if (!this.handlesSection) addHandlesSection = true;
			else if (
				GraphicSelection.selectionKeyOf(extraInfo) !==
				GraphicSelection.selectionKeyOf(
					this.handlesSection.sectionProperties.info,
				)
			) {
				// Another shape is selected.
				this.handlesSection.removeSubSections();
				app.sectionContainer.removeSection(this.handlesSection.name);
				this.handlesSection = null;
				addHandlesSection = true;
			}

			if (addHandlesSection) {
				this.handlesSection = new app.definitions.shapeHandlesSection({});
				app.sectionContainer.addSection(this.handlesSection);
			}

			this.handlesSection.setPosition(this.rectangle.pX1, this.rectangle.pY1);

			extraInfo.hasTableSelection =
				app.activeDocument.tableMiddleware.hasTableSelection(); // scaleSouthAndEastOnly

			this.handlesSection.refreshInfo(this.extraInfo);
			this.handlesSection.setShowSection(editMode);
			app.sectionContainer.requestReDraw();
		} else if (
			this.handlesSection &&
			app.sectionContainer.doesSectionExist(this.handlesSection.name)
		) {
			this.handlesSection.removeSubSections();
			app.sectionContainer.removeSection(this.handlesSection.name);
			this.handlesSection = null;
		}
		app.map._docLayer._updateCursorAndOverlay();
	}

	public static onShapeSelectionContent(textMsg: string) {
		textMsg = textMsg.substring('shapeselectioncontent:'.length + 1);

		var extraInfo = this.extraInfo;
		if (extraInfo && extraInfo.id) {
			app.map._cacheSVG[extraInfo.id] = textMsg;
		}

		// video is handled in _onEmbeddedVideoContent
		if (this.handlesSection) {
			if (this.handlesSection.sectionProperties.hasVideo)
				app.map._cacheSVG[extraInfo.id] = undefined;
			else this.handlesSection.setSVG(textMsg);

			if (!app.file.textCursor.visible) this.handlesSection.interactable = true;
		}
	}

	// Preview geometry sent by core while a shape handle is being dragged.
	public static onShapeDragPreview(textMsg: string) {
		if (!this.handlesSection) return;

		textMsg = textMsg.substring('shapedragpreview:'.length);
		try {
			this.handlesSection.onShapeDragPreview(JSON.parse(textMsg));
		} catch (error) {
			window.app.console.warn('cannot parse shapedragpreview message');
		}
	}

	private static checkDiagramData() {
		if (GraphicSelection.extraInfo && GraphicSelection.extraInfo.isDiagram) {
			if (!GraphicSelection.diagramButton) {
				// need to create DiagramButtonSection
				const subSection = app.sectionContainer.getSectionWithName(
					this.handlesSection.sectionProperties.subSectionPrefix + 'diagram',
				);
				var halfWidth: number = 0;

				if (subSection && subSection.sectionProperties) {
					// get distance that frame occupies from frame object
					halfWidth = subSection.sectionProperties.ownInfo.halfWidth;
				}

				GraphicSelection.diagramButton = new DiagramButtonSection(
					halfWidth * app.twipsToPixels,
				);
				GraphicSelection.diagramButton.forceNextReposition();
				app.sectionContainer.addSection(GraphicSelection.diagramButton);
			}

			GraphicSelection.diagramButton.updatePosition();
		} else if (GraphicSelection.diagramButton) {
			app.sectionContainer.removeSection(GraphicSelection.diagramButton.name);
			GraphicSelection.diagramButton = null;
		}
	}

	private static checkChartData() {
		// Chart Context Buttons are disabled now.
		// we will probably enable it when chart styles will work fine.
		var disabled = true;
		if (disabled) return;
		if (
			GraphicSelection.extraInfo &&
			GraphicSelection.extraInfo.isChartPage &&
			GraphicSelection.extraInfo.isChartPage === true
		) {
			if (!GraphicSelection.chartContextToolbarSelectStyle) {
				GraphicSelection.chartContextToolbarSelectStyle =
					new ChartContextButtonSection(0);
				GraphicSelection.chartContextToolbarSaveStyle =
					new ChartContextButtonSection(1);
				GraphicSelection.chartContextToolbarSelectStyle.forceNextReposition();
				GraphicSelection.chartContextToolbarSaveStyle.forceNextReposition();
				app.sectionContainer.addSection(
					GraphicSelection.chartContextToolbarSelectStyle,
				);
				app.sectionContainer.addSection(
					GraphicSelection.chartContextToolbarSaveStyle,
				);
			}
			GraphicSelection.chartContextToolbarSelectStyle.updatePosition();
			GraphicSelection.chartContextToolbarSaveStyle.updatePosition();

			if (GraphicSelection.chartContextToolbarSelectStyle) {
				GraphicSelection.chartContextToolbarSelectStyle.showChartContextToolbar();
				GraphicSelection.chartContextToolbarSaveStyle.showChartContextToolbar();
			}
		} else if (GraphicSelection.chartContextToolbarSelectStyle) {
			app.sectionContainer.removeSection(
				GraphicSelection.chartContextToolbarSelectStyle.name,
			);
			app.sectionContainer.removeSection(
				GraphicSelection.chartContextToolbarSaveStyle.name,
			);
			GraphicSelection.chartContextToolbarSelectStyle = null;
			GraphicSelection.chartContextToolbarSaveStyle = null;
		}
	}

	public static onMessage(textMsg: string) {
		URLPopUpSection.closeURLPopUp();

		if (textMsg.match('EMPTY')) {
			this.resetSelectionRanges();
		} else if (textMsg.match('INPLACE EXIT')) {
			app.map._docLayer._oleCSelections.clear();
			this.darkOverlayRectangle = null;
		} else if (textMsg.match('INPLACE')) {
			const startingInPlaceEditing = app.map._docLayer._oleCSelections.empty();

			textMsg = '[' + textMsg.substr('graphicselection:'.length) + ']';
			try {
				var msgData = JSON.parse(textMsg);
				if (msgData.length > 1) this.extractAndSetGraphicSelection(msgData);
			} catch (error) {
				window.app.console.warn('cannot parse graphicselection command');
			}

			// The frame comes in twips and the dark overlay holds it in pixels. A
			// message replayed for a new zoom level has to redo that conversion.
			if (this.rectangle) this.renderDarkOverlay();

			this.rectangle = null;
			if (startingInPlaceEditing) this.updateGraphicSelection();
		} else {
			textMsg = '[' + textMsg.substr('graphicselection:'.length) + ']';
			msgData = JSON.parse(textMsg);

			this.transformGraphicSelection(msgData);

			this.extractAndSetGraphicSelection(msgData);

			/*
				Which objects the selection is about. A selection the client asked for names the
				objects it named itself, so it arrives unchanged; one that differs was made
				elsewhere, by the keyboard, an undo or another user. Everything below is set up
				from the message either way, until the client builds it from what it holds.
			*/
			this.selectionChanged(
				GraphicSelection.selectedObjectIDsOf(
					msgData.length > 5 ? msgData[5] : null,
				),
			);

			/*
				While the document is drawn from objects, the handles are worked out here from the
				geometry the client holds and named by what they are. The ones the engine sent are
				used where the client holds nothing for what is selected.
			*/
			GraphicSelection.applyLocalHandles();

			// Update the dark overlay on zooming & scrolling
			if (!app.map._docLayer._oleCSelections.empty()) {
				app.map._docLayer._oleCSelections.clear();
				this.renderDarkOverlay();
			}

			this.selectionAngle = msgData.length > 4 ? msgData[4] : 0;

			if (this.extraInfo) {
				var dragInfo = this.extraInfo.dragInfo;
				if (dragInfo && dragInfo.dragMethod === 'PieSegmentDragging') {
					dragInfo.initialOffset /= 100.0;
					var dragDir = dragInfo.dragDirection;
					dragInfo.dragDirection = app.map._docLayer._twipsToPixels(
						new cool.Point(dragDir[0], dragDir[1]),
					);
					dragDir = dragInfo.dragDirection;
					dragInfo.range2 = dragDir.x * dragDir.x + dragDir.y * dragDir.y;
				}
			}

			// defaults
			var extraInfo = this.extraInfo;
			if (extraInfo) {
				if (extraInfo.isDraggable === undefined) extraInfo.isDraggable = true;
				if (extraInfo.isResizable === undefined) extraInfo.isResizable = true;
				if (extraInfo.isRotatable === undefined) extraInfo.isRotatable = true;
			}

			// Workaround for tdf#123874. For some reason the handling of the
			// shapeselectioncontent messages that we get back causes the WebKit process
			// to crash on iOS.
			if (
				!window.ThisIsTheiOSApp &&
				this.extraInfo.isDraggable &&
				!this.extraInfo.svg
			) {
				app.socket.sendMessage('rendershapeselection mimetype=image/svg+xml');
			}

			// scroll to selected graphics, if it has no cursor
			if (
				!app.map._docLayer.isWriter() &&
				this.rectangle &&
				app.map._docLayer._allowViewJump()
			) {
				if (
					(!app.isPointVisibleInTheDisplayedArea([
						this.rectangle.x1,
						this.rectangle.y1,
					]) ||
						!app.isPointVisibleInTheDisplayedArea([
							this.rectangle.x2,
							this.rectangle.y2,
						])) &&
					!TextSelections.getEndRectangle() &&
					!(app.isFollowingEditor() || app.isFollowingUser()) &&
					!app.map.calcInputBarHasFocus()
				) {
					app.map._docLayer.scrollToPos(
						new cool.SimplePoint(this.rectangle.x1, this.rectangle.y1),
					);
				}
			}
		}

		// Graphics are by default complex selections, unless Core tells us otherwise.
		if (app.map._clip) app.map._clip.onComplexSelection('');

		// Reset text selection - important for textboxes in Impress
		if (app.map._docLayer._selectionContentRequest)
			clearTimeout(app.map._docLayer._selectionContentRequest);
		app.map._docLayer._onMessage('textselectioncontent:');

		this.updateGraphicSelection();

		if (msgData && msgData.length > 5) {
			var extraInfo = msgData[5];
			if (
				extraInfo.mimeType?.startsWith('video/') ||
				extraInfo.mimeType?.startsWith('audio/')
			) {
				this.onEmbeddedVideoContent(JSON.stringify(extraInfo));
			}
		}

		GraphicSelection.checkChartData();
		GraphicSelection.checkDiagramData();
	}

	/*
		Some keywords: mousecontrol, _postMouseEvent, core side.
		Explanation:
			* User can edit a shape's text.
			* We need to send the mouse events to core in that case (for text selection, double click etc).
			* When cursor is visible, we assume text editing started.
			* And we set the "interactable" property of the shape handler section to false.
			* When "interactable" is false, canvas section container events pass through the section.
			* In our case, ShapeHandlesSection begins to be ignored.
			* And MouseControl catches all the events.
			* Users can select text, click, double click, triple click, quadruple click etc.
	*/
	public static onTextCursorVisibility(event: any) {
		if (this.hasActiveSelection()) {
			if (event.detail.visible) this.handlesSection.interactable = false;
			else this.handlesSection.interactable = true;
		}
	}
}

app.events.on(
	'updatepermission',
	GraphicSelection.onUpdatePermission.bind(GraphicSelection),
);

app.events.on(
	'TextCursorVisibility',
	GraphicSelection.onTextCursorVisibility.bind(GraphicSelection),
);

app.definitions.graphicSelection = GraphicSelection;
