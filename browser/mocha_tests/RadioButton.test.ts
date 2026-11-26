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

describe('JSDialog.RadioButton', function () {
	// The header of a 30x30 PNG, as the engine sends the error bar indicators.
	const bitmap =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAA==';
	let parent: HTMLElement;
	let builder: any;
	let realMakeHttpUrl: any;
	let realHTMLImageElement: any;

	beforeEach(function () {
		realHTMLImageElement = (globalThis as any).HTMLImageElement;
		(globalThis as any).HTMLImageElement = (window as any).HTMLImageElement;
		realMakeHttpUrl = (window as any).makeHttpUrl;
		(window as any).makeHttpUrl = (path: string) => 'http://localhost' + path;
		parent = document.createElement('div');
		document.body.appendChild(parent);
		builder = {
			options: { cssClass: 'jsdialog' },
			map: { on: () => {} },
			callback: () => {},
			_cleanText: (text: string) => text || '',
		};
	});

	afterEach(function () {
		parent.remove();
		(window as any).makeHttpUrl = realMakeHttpUrl;
		(globalThis as any).HTMLImageElement = realHTMLImageElement;
	});

	function build(data: any): HTMLElement {
		JSDialog.RadioButton(parent, data, builder);
		return parent.querySelector('#' + data.id) as HTMLElement;
	}

	it('shows its image in the label, as an icon of ours at the size of the bitmap', function () {
		const radio = build({
			id: 'radiobutton_positive',
			type: 'radiobutton',
			text: '',
			tooltip: 'Positive',
			icon: 'lc_errorup_30.svg',
			iconpath: 'chart2/res/errorup_30.png',
			image: bitmap,
		});

		const image = radio.querySelector('img') as HTMLImageElement;
		nodeassert.ok(image);
		nodeassert.strictEqual(image.parentElement!.tagName, 'LABEL');
		nodeassert.ok(image.src.endsWith('/errorup_30.svg'), image.src);
		nodeassert.strictEqual(image.style.width, '30px');
		nodeassert.strictEqual(image.style.height, '30px');
		// The choice has no text, the image names it.
		nodeassert.strictEqual(image.alt, 'Positive');
	});

	it('keeps the text of its label next to the image', function () {
		const radio = build({
			id: 'radiobutton_text',
			type: 'radiobutton',
			text: 'Negative',
			iconpath: 'chart2/res/errordown_30.png',
			image: bitmap,
		});

		const label = radio.querySelector('label') as HTMLLabelElement;
		nodeassert.strictEqual(label.textContent, 'Negative');
		nodeassert.strictEqual(label.firstChild!.nodeName, 'IMG');
		nodeassert.strictEqual((label.firstChild as HTMLImageElement).alt, '');
	});

	it('has no image without one', function () {
		const radio = build({
			id: 'radiobutton_plain',
			type: 'radiobutton',
			text: 'Plain',
		});

		nodeassert.strictEqual(radio.querySelector('img'), null);
		nodeassert.ok(!radio.classList.contains('has-image'));
	});
});
