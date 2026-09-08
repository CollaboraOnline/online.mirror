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
 * Class Tooltip - tooltip manager
 */

/* global app */

class Tooltip {
	constructor(options) {
		// hoverGrace: how long the tooltip outlives the pointer leaving the
		// widget, so the pointer can cross the gap and reach it.
		this._options = window.L.extend({ timeout: 150, hoverGrace: 600 }, options);
		let win = this._options.window ? this._options.window : window;
		this._container = this._options.container
			? this._options.container
			: window.L.DomUtil.create('div', 'cooltip-text', win.document.body);
		this._container.id = 'cooltip';
		// The container does not take pointer events, so whether the pointer is
		// on it is answered by its rectangle rather than by enter and leave.
		win.document.addEventListener(
			'mousemove',
			window.L.bind(this.pointerMoved, this),
			{ capture: true, passive: true },
		);

		win.addEventListener('keydown', window.L.bind(this.keyDown, this), {
			capture: true,
		});
	}

	beginShow(elem) {
		if (this._cancel || this._disabled) return;

		let win = this._options.window ? this._options.window : window;
		win.clearTimeout(this._showTimeout);
		this._showTimeout = win.setTimeout(
			window.L.bind(this.show, this, elem),
			this._options.timeout,
		);
	}

	beginHide() {
		if (this._cancel || this._disabled) return;

		let win = this._options.window ? this._options.window : window;
		win.clearTimeout(this._showTimeout);
		win.clearTimeout(this._hideTimeout);
		// Armed for what is on screen, not for what the pointer left.
		if (this._current)
			this._hideTimeout = win.setTimeout(
				window.L.bind(this.hide, this, this._current),
				this._options.hoverGrace,
			);
	}

	// Switch the tooltip subsystem off entirely and hide live tooltip if any.
	disable() {
		if (this._disabled) return;
		let win = this._options.window ? this._options.window : window;
		this._disabled = true;
		win.clearTimeout(this._showTimeout);
		win.clearTimeout(this._hideTimeout);
		this._container.style.visibility = 'hidden';
		this._current = null;
		this._cancel = false;
	}

	enable() {
		this._disabled = false;
	}

	/**
	 * Calculate one of the 8 different position
	 * of the tooltip, around the elem parameter
	 *
	 * - bottom-right, bottom-left, top-right, top-left
	 * - and their left/right aligned versions
	 *
	 * @param elem - element that the cursor is over
	 * @param popup - tooltip rectangle
	 * @param index - used to determine one of the 8 tooltip location
	 * @returns tooltip rectangle with its location calculated
	 */
	position(elem, popup, index) {
		let rect = new DOMRect();
		switch (index) {
			case 0: // below cursor, bottom-right (aligned to left)
				rect.x = elem.left;
				rect.y = elem.bottom + 12;
				break;
			case 1: // below cursor, bottom-left (aligned to right)
				rect.x = elem.right - popup.width;
				rect.y = elem.bottom + 12;
				break;
			case 2: // above cursor, top-right (aligned to left)
				rect.x = elem.left;
				rect.y = elem.top - popup.height - 8;
				break;
			case 3: // above cursor, top-left (aligned to right)
				rect.x = elem.right - popup.width;
				rect.y = elem.top - popup.height - 8;
				break;
			case 4: // below cursor, bottom-right
				rect.x = elem.right;
				rect.y = elem.bottom + 4;
				break;
			case 5: // below cursor, bottom-left
				rect.x = elem.left - popup.width;
				rect.y = elem.bottom + 4;
				break;
			case 6: // above cursor, top-right
				rect.x = elem.right;
				rect.y = elem.top - popup.height - 4;
				break;
			case 7: // above cursor, top-left
				rect.x = elem.left - popup.width;
				rect.y = elem.top - popup.height - 4;
				break;
			default:
				break;
		}

		rect.width = popup.width;
		rect.height = popup.height;

		return rect;
	}

	show(elem, textContent) {
		if (this._disabled) return;
		// `textContent` adds flexibility, enabling custom messages like document "Saved" instead of the fixed "cool-tooltip."
		let content = textContent ? textContent : elem.dataset.cooltip,
			rectView = new DOMRect(0, 0, window.innerWidth, window.innerHeight),
			rectElem = elem.getBoundingClientRect(),
			rectCont,
			rectTooltip,
			index = 0;

		this._container.textContent = content;
		if (!this._container.textContent) return;

		rectCont = this._container.getBoundingClientRect();

		do {
			rectTooltip = this.position(rectElem, rectCont, index++);
		} while (index < 8 && !app.LOUtil.containsDOMRect(rectView, rectTooltip));
		// containsDOMRect() checks if the tooltip box(rectTooltip) is inside the boundaries of the window(rectView)

		this._container.style.left = rectTooltip.left + 'px';
		this._container.style.top = rectTooltip.top + 'px';
		this._container.style.visibility = 'visible';
		this._current = elem;
	}

	hide(elem) {
		if (this._cancel) return;
		// Stale for another live widget; a rebuilt widget leaves a detached node.
		if (
			elem &&
			elem !== this._current &&
			this._current &&
			this._current.isConnected
		)
			return;

		this._container.style.visibility = 'hidden';
		this._current = null;
	}

	pointerMoved(e) {
		if (this._disabled || !this._current) return;

		const box = this._container.getBoundingClientRect();
		const on =
			e.clientX >= box.left &&
			e.clientX <= box.right &&
			e.clientY >= box.top &&
			e.clientY <= box.bottom;

		if (on) this.mouseEnter();
		else if (this._cancel) this.mouseLeave();
	}

	mouseEnter() {
		if (this._disabled) return;
		if (this._current) {
			let win = this._options.window ? this._options.window : window;
			this._cancel = true;
			win.clearTimeout(this._hideTimeout);
			win.clearTimeout(this._showTimeout);
		}
	}

	mouseLeave() {
		if (this._disabled) return;
		this._cancel = false;
		this.beginHide();
	}

	keyDown(e) {
		if (this._disabled || !this._current) return;
		if (this._container.style.visibility !== 'visible') return;

		if (e.key.toUpperCase() === 'ESCAPE') {
			this._cancel = false;
			this.hide();
			e.stopPropagation();
			if (e.cancelable) e.preventDefault();
			return;
		}

		// The grace period can leave a tooltip up after the pointer has gone, and
		// by then the keyboard is elsewhere. Typing is not aimed at it, so drop it
		// and leave the key to whatever holds the focus.
		this._cancel = false;
		this.hide();
	}

	static attachEventListener(elem, map) {
		if (!map.tooltip) {
			return;
		}

		elem.addEventListener('mouseenter', function () {
			map.tooltip.beginShow(elem);
		});
		elem.addEventListener('mouseleave', function () {
			map.tooltip.beginHide();
		});
		elem.addEventListener('click', function () {
			map.tooltip.mouseLeave();
		});
	}
}

window.L.control.tooltip = function (options) {
	return new Tooltip(options);
};

window.L.control.attachTooltipEventListener = Tooltip.attachEventListener;
