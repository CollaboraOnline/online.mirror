/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

class DiagramButtonSection extends GenericButtonSection {
	static readonly namePrefix: string = 'DiagramContextButton_';
	static readonly className: string = 'general-select-theme';
	static readonly unoCommand: string = 'uno .uno:EditDiagram';
	// Predefined sizes in pixel
	static readonly sizeButtons: number = 32;
	static readonly sizeSpaceBetweenButtons: number = 5;
	// fixed size pixels for the frame distance
	halfWidthPixels: number = 0;

	constructor(_halfWidthPixels: number) {
		super(
			DiagramButtonSection.namePrefix,
			DiagramButtonSection.sizeButtons,
			DiagramButtonSection.sizeButtons,
			DiagramButtonSection.className,
			DiagramButtonSection.unoCommand,
		);

		this.halfWidthPixels = _halfWidthPixels;
		this.sectionProperties.lastInputEvent = null;

		// force update Position
		this.updatePosition();
	}

	/*
		Puts the button where it belongs now. A drag carries the selection across the page without
		the zoom changing, so the button follows it from here rather than through updatePosition,
		which waits for a new zoom before it moves anything.
	*/
	public follow(): void {
		const at = this.calculatePositionPixel();

		this.setPosition(at[0], at[1]);
		this.adjustHTMLObjectPosition();
	}

	/*
		Where the button stands: to the right of what is selected and level with the top of it.
		While the document is drawn from objects the selection says where it is itself, since the
		engine sends no rectangle along with it then.
	*/
	calculatePositionPixel(): Array<number> {
		const band = GraphicSelection.selectionSection?.surroundBox();

		if (band) {
			/*
				The button stands clear of the band, by the space it always stood clear of the
				frame by. That space is a fixed number of pixels and does not follow the band as
				the band is made wider or narrower, so the button keeps its own distance.
			*/
			return [
				Math.round(
					band[0] +
						band[2] +
						HandleLook.reachOfASurround() +
						DiagramButtonSection.sizeSpaceBetweenButtons,
				),
				Math.round(band[1]),
			];
		}

		Util.ensureValue(GraphicSelection.rectangle);
		// calculate & return top-left position
		return [
			Math.round(
				GraphicSelection.rectangle.x2 * app.twipsToPixels +
					this.halfWidthPixels +
					DiagramButtonSection.sizeSpaceBetweenButtons,
			),
			Math.round(GraphicSelection.rectangle.y1 * app.twipsToPixels),
		];
	}
}
