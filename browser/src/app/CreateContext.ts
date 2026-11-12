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
	Creating a shape by a drag, as the office does: a shape chosen from the shapes grid is not
	added in the middle of the slide, it puts one into this mode. A press sets one corner of the
	shape and the drag sets its size; letting go asks the engine for the shape in that rectangle,
	and the mode is over. A click without a drag, Escape, a command or a press anywhere else ends
	the mode without a shape.

	Before the press a cross marks where the drag would begin, snapped as the drag snaps, with its
	place beside it; during the drag the frame of the shape is drawn with its size beside it. As
	in the office, Shift makes the shape as wide as high, Alt drags it from its middle, and Ctrl
	turns the snap over.
*/
class ClassicCreateContext implements InteractionMode {
	/// The command that makes the shape, without its .uno: prefix, as BasicShapes.rectangle.
	private shape: string;
	/// The part the mode was entered on; it ends when another one is shown.
	private part: number;
	/// Where the mouse stands snapped, in twips, while no drag runs; null off the page.
	private hover: cool.Point | null = null;
	/// The corner the drag began at, snapped, in twips; null while no drag runs.
	private from: cool.Point | null = null;
	/// The rectangle of the drag, in twips, as the shape would get it.
	private box: cool.Range2D | null = null;
	/// The rectangle sent to the engine, drawn until the engine's answer brings the shape.
	private sent: cool.Range2D | null = null;
	private sentWait: ReturnType<typeof setTimeout> | null = null;
	/// What is found to snap to, drawn as lines.
	private snap: SelectionSnap = new SelectionSnap();
	/// A press anywhere outside the page ends the mode.
	private pressedOutside: (event: PointerEvent) => void;
	/// Where the mouse was last, in twips, as it came, and whether the button was down.
	private lastAt: cool.Point | null = null;
	private lastPressed: boolean = false;

	/// The groups of the shapes grid that make a shape by a drag.
	private static readonly shapeGroups: string[] = [
		'BasicShapes',
		'SymbolShapes',
		'ArrowShapes',
		'StarShapes',
		'CalloutShapes',
		'FlowChartShapes',
	];

	/// The least size a drag gives, in CSS pixels; a smaller one is a click.
	private static readonly leastSize: number = 3;

	/// How long the frame sent stays drawn when no answer brings the shape, in milliseconds.
	private static readonly longestWait: number = 5000;

	/// Whether the answers of the engine are followed, which they are once.
	private static listening: boolean = false;

	constructor(shape: string) {
		this.shape = shape;
		this.part = app.map._docLayer._selectedPart;
		this.pressedOutside = (event: PointerEvent) => {
			if (event.target !== document.getElementById('document-canvas'))
				Interaction.leaveMode();
		};
		document.addEventListener('pointerdown', this.pressedOutside, true);
	}

	/// Whether that command of the shapes grid can be created by a drag here.
	public static canCreate(shape: string): boolean {
		const group = shape.split('.')[0];
		return (
			shape.indexOf('.') > 0 &&
			ClassicCreateContext.shapeGroups.indexOf(group) >= 0 &&
			RenderGeometrySection.answersPointer() &&
			app.map.isEditMode()
		);
	}

	/// Enters the mode for that shape.
	public static start(shape: string): void {
		ClassicCreateContext.listen();
		Interaction.enterMode(new ClassicCreateContext(shape));
	}

	/// Follows the answers of the engine, so the frame sent goes once the shape is drawn.
	private static listen(): void {
		if (ClassicCreateContext.listening) return;
		ClassicCreateContext.listening = true;
		RenderManager.onVectorChanged(() => ClassicCreateContext.answered());
	}

	/// The frame waiting for the engine, of the mode last on.
	private static waiting: ClassicCreateContext | null = null;

	private static answered(): void {
		const waiting = ClassicCreateContext.waiting;
		if (!waiting) return;
		waiting.forgetTheSent();
	}

	private forgetTheSent(): void {
		if (this.sentWait !== null) app.timerRegistry.clearTimeout(this.sentWait);
		this.sentWait = null;
		this.sent = null;
		if (ClassicCreateContext.waiting === this)
			ClassicCreateContext.waiting = null;
		InteractionModeSection.follow();
	}

	// the context under the mode, where the selection stands
	private under(): InteractionContext {
		return Interaction.contextAt(
			Interaction.placeOf(GraphicSelection.selectedObjectIDs),
		);
	}

	// a length in CSS pixels, in twips
	private static twips(cssPixels: number): number {
		return cssPixels * app.dpiScale * app.pixelsToTwips;
	}

	/// Whether the last snap was to the grid, where every point snaps.
	private snappedToTheGrid: boolean = false;

	/// That point of the page snapped as the drag snaps, to the grid or to the other objects.
	private snapped(at: cool.Point, modifier: number): cool.Point {
		const point = new cool.SimplePoint(at.x, at.y);
		const turnedOver =
			(modifier & (app.UNOModifier.CTRL | app.UNOModifier.CTRLMAC)) !== 0;
		const gridOn =
			app.map.stateChangeHandler.getItemValue('.uno:GridUse') === 'true';
		this.snappedToTheGrid = gridOn !== turnedOver;
		this.snap.look([0, 0], [point.pX, point.pY], [0, 0], turnedOver);
		if (!this.snap.found()) return at;
		const corner = this.snap.corner(point.pX, point.pY);
		const snapped = cool.SimplePoint.fromCorePixels(corner);
		return new cool.Point(snapped.x, snapped.y);
	}

	/// The rectangle from the corner the drag began at to that point, with Shift and Alt.
	private boxTo(to: cool.Point, modifier: number): cool.Range2D | null {
		if (!this.from) return null;
		let width = to.x - this.from.x;
		let height = to.y - this.from.y;
		if (modifier & app.UNOModifier.SHIFT) {
			const side = Math.max(Math.abs(width), Math.abs(height));
			width = width < 0 ? -side : side;
			height = height < 0 ? -side : side;
		}
		// with Alt the drag began at the middle of the shape
		const fromMiddle = (modifier & app.UNOModifier.ALT) !== 0;
		const x1 = fromMiddle ? this.from.x - width : this.from.x;
		const y1 = fromMiddle ? this.from.y - height : this.from.y;
		return cool.Range2D.fromPoints([
			new cool.Point(x1, y1),
			new cool.Point(this.from.x + width, this.from.y + height),
		]);
	}

	// the size of the drag as it goes, which is negative towards the upper left
	private signedSize: cool.Point | null = null;

	mouseAt(at: cool.Point, modifier: number, pressed: boolean): void {
		if (this.leftThePart()) return;
		this.lastAt = at;
		this.lastPressed = pressed;
		const point = this.snapped(at, modifier);
		if (!pressed || !this.from) {
			this.hover = point;
			return;
		}
		this.box = this.boxTo(point, modifier);
		this.signedSize = new cool.Point(
			point.x - this.from.x,
			point.y - this.from.y,
		);
	}

	mouseDown(at: cool.Point, modifier: number): void {
		if (this.leftThePart()) return;
		this.from = this.snapped(at, modifier);
		this.hover = null;
		this.box = null;
		this.signedSize = null;
	}

	mouseUp(at: cool.Point, modifier: number, dragged: boolean): void {
		if (!this.from) return;
		this.mouseAt(at, modifier, true);
		const box = this.box;
		const least = ClassicCreateContext.twips(ClassicCreateContext.leastSize);
		// a click, or a drag too small for a shape, ends the mode without one
		if (!dragged || !box || box.width < least || box.height < least) {
			Interaction.leaveMode();
			return;
		}
		this.send(box);
	}

	dragCancelled(): void {
		Interaction.leaveMode();
	}

	mouseLeft(): void {
		this.hover = null;
		this.snap.forget();
	}

	pointer(): string {
		// the office shows the plain cross while a custom shape is created
		return 'crosshair';
	}

	/*
		Asks the engine for the shape in that rectangle and ends the mode. The mode is left first,
		so the command that goes out does not end it again. The frame stays drawn until the
		engine's answer brings the shape.
	*/
	private send(box: cool.Range2D): void {
		this.sent = box;
		ClassicCreateContext.waiting = this;
		this.sentWait = app.timerRegistry.setTimeout(
			'createdshapeanswer',
			() => this.forgetTheSent(),
			ClassicCreateContext.longestWait,
		);
		Interaction.leaveMode();
		const value = (twips: number) => ({
			type: 'long',
			value: String(Math.round(twips)),
		});
		app.map.sendUnoCommand('.uno:' + this.shape, {
			X: value(box.minX),
			Y: value(box.minY),
			Width: value(box.width),
			Height: value(box.height),
		});
	}

	/// Ends the mode where another part is shown than the one it was entered on.
	private leftThePart(): boolean {
		if (app.map._docLayer._selectedPart === this.part) return false;
		Interaction.leaveMode();
		return true;
	}

	stillDraws(): boolean {
		return this.sent !== null;
	}

	ended(): void {
		document.removeEventListener('pointerdown', this.pressedOutside, true);
		this.lastAt = null;
		this.from = null;
		this.box = null;
		this.hover = null;
		this.snap.forget();
	}

	/*
		The length in the unit the sidebar measures positions and sizes in: inches where the
		ruler says so or the language is American English, centimetres otherwise.
	*/
	private static inTheUnit(twips: number): string {
		const ruler = app.map.stateChangeHandler.getItemValue(
			'.uno:LeftRightParaMargin',
		);
		const unit =
			ruler && typeof ruler === 'object' && ruler.unit
				? ruler.unit
				: (window.coolParams?.get('lang') || navigator.language) === 'en-US'
					? 'inch'
					: 'cm';
		if (unit === 'inch') return (twips / 1440).toFixed(2) + '"';
		if (unit === 'mm') return (twips / 56.7).toFixed(1) + ' mm';
		return (twips / 567).toFixed(2) + ' cm';
	}

	/*
		Writes a reading beside that point of the canvas, as the turn angle is: below and to the
		right of it, or to the left and above where the drag goes that way, so it stays outside
		the frame.
	*/
	private static writeAt(
		context: CanvasRenderingContext2D,
		text: string,
		at: cool.SimplePoint,
		toTheLeft: boolean,
		above: boolean,
	): void {
		const scale = app.dpiScale;
		const x = at.vX + (toTheLeft ? -8 : 16) * scale;
		const y = at.vY + (above ? -8 : 24) * scale;
		context.font = Math.round(11 * scale) + 'px sans-serif';
		context.textAlign = toTheLeft ? 'right' : 'left';
		context.textBaseline = above ? 'bottom' : 'middle';
		context.strokeStyle = '#FFFFFF';
		context.lineWidth = 3;
		context.strokeText(text, x, y);
		context.fillStyle = HandleLook.outlineColour;
		context.fillText(text, x, y);
	}

	draw(section: CanvasSectionObject): void {
		const context = section.context;
		context.save();
		context.setTransform(1, 0, 0, 1, 0, 0);

		const frame = this.box ?? this.sent;
		if (frame) {
			const from = new cool.SimplePoint(frame.minX, frame.minY);
			const to = new cool.SimplePoint(frame.maxX, frame.maxY);
			context.strokeStyle = HandleLook.outlineOfADrag;
			context.lineWidth = 1;
			context.strokeRect(
				Math.round(from.vX) + 0.5,
				Math.round(from.vY) + 0.5,
				Math.round(to.vX - from.vX),
				Math.round(to.vY - from.vY),
			);
		}

		if (this.box && this.from && this.signedSize) {
			// the size beside the corner the mouse holds
			const corner = new cool.SimplePoint(
				this.from.x + this.signedSize.x,
				this.from.y + this.signedSize.y,
			);
			ClassicCreateContext.writeAt(
				context,
				'(' +
					ClassicCreateContext.inTheUnit(this.signedSize.x) +
					', ' +
					ClassicCreateContext.inTheUnit(this.signedSize.y) +
					')',
				corner,
				this.signedSize.x < 0,
				this.signedSize.y < 0,
			);
		} else if (this.hover && !this.sent) {
			// lines across the whole view through where the drag would begin, with its place above
			// and to the left; they have a light edge, so they show on any page and object
			const at = new cool.SimplePoint(this.hover.x, this.hover.y);
			const x = Math.round(at.vX) + 0.5;
			const y = Math.round(at.vY) + 0.5;
			const canvas = context.canvas;
			// the line of an axis that met an edge of another object takes the colour of the lines
			// a snap shows; on the grid every point snaps, so that says nothing there
			if (!HelperLineStyles.smartGuidesStyle) HelperLineStyles.initiate();
			const snappedAt = this.snappedToTheGrid ? [null, null] : this.snap.at();
			const across = (
				fromX: number,
				fromY: number,
				toX: number,
				toY: number,
			) => {
				context.beginPath();
				context.moveTo(fromX, fromY);
				context.lineTo(toX, toY);
			};
			const line = (snapped: boolean, draw: () => void) => {
				draw();
				context.strokeStyle = '#FFFFFF';
				context.lineWidth = 3;
				context.stroke();
				draw();
				context.strokeStyle = snapped
					? HelperLineStyles.smartGuidesStyle
					: HandleLook.outlineOfADrag;
				context.lineWidth = 1;
				context.stroke();
			};
			line(snappedAt[1] !== null, () => across(0, y, canvas.width, y));
			line(snappedAt[0] !== null, () => across(x, 0, x, canvas.height));
			ClassicCreateContext.writeAt(
				context,
				'(' +
					ClassicCreateContext.inTheUnit(this.hover.x) +
					', ' +
					ClassicCreateContext.inTheUnit(this.hover.y) +
					')',
				at,
				true,
				true,
			);
		}
		context.restore();
	}

	// What the mode answers of the actions of a context: it takes every press and key itself,
	// and the rest is answered as where the selection stands.

	press(_hit: number | undefined, _modifier: number): boolean {
		return true;
	}
	takesHoldFor(_hit: number, _modifier: number): number | undefined {
		return undefined;
	}
	doublePress(_hit: number | undefined): boolean {
		return true;
	}
	altPress(_hits: number[], _backwards: boolean): boolean {
		return true;
	}
	arrowKey(_towards: cool.Point, _event: KeyboardEvent): boolean {
		return true;
	}
	/*
		Shift, Ctrl and Alt change the drag and the snap at once, also while the mouse stands
		still. Escape ends the mode; any other key ends it too and goes on as it would.
	*/
	keyEvent(event: KeyboardEvent, modifier: number): boolean {
		if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(event.key) >= 0) {
			if (this.lastAt) {
				this.mouseAt(this.lastAt, modifier, this.lastPressed);
				app.sectionContainer?.requestReDraw();
			}
			return true;
		}
		if (event.type !== 'keydown') return true;
		if (event.key === 'Escape') return this.escape();
		Interaction.leaveMode();
		return false;
	}

	escape(): boolean {
		Interaction.leaveMode();
		return true;
	}
	enterKey(): boolean {
		return true;
	}
	leaveKey(): boolean {
		return true;
	}
	commandStates(): { [command: string]: boolean } {
		return this.under().commandStates();
	}
	showsGroupBands(): boolean {
		return this.under().showsGroupBands();
	}
	theOnesThatHaveASay(objectIds: number[]): number[] {
		return this.under().theOnesThatHaveASay(objectIds);
	}
	theOnesAChangeNames(objectIds: number[]): number[] {
		return this.under().theOnesAChangeNames(objectIds);
	}
	heldToItsWay(objectIds: number[], by: cool.Point): cool.Point {
		return this.under().heldToItsWay(objectIds, by);
	}
	ungroup(): boolean {
		return true;
	}
	tabKey(_forwards: boolean): boolean {
		return true;
	}
	frameSelects(
		_frame: cool.Range2D,
		_extending: boolean,
	): number[] | undefined {
		return undefined;
	}
	toAnEnd(_first: boolean): boolean {
		return true;
	}
	groupEntered(): void {
		this.under().groupEntered();
	}
	enteredBy(
		selection: number[],
		hits?: number[],
		backwards?: boolean,
	): number[] {
		return this.under().enteredBy(selection, hits, backwards);
	}
	whatIsLeft(selected: number[], groupsAbove: number[]): number[] {
		return this.under().whatIsLeft(selected, groupsAbove);
	}
}
