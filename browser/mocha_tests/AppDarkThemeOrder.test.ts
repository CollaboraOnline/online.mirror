/* -*- js-indent-level: 8; fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// The app pages carry the dark theme in app-dark-theme.js, which sets data-theme on <html>
// from the darkTheme parameter the native shell puts in the URL. The browser cannot paint
// before a classic script in <head> has run, so where that script sits decides whether a dark
// document opens dark or flashes white first. It once sat at the end of the markup's <head>,
// after the stylesheets - and after the hidden <input> elements, which are not allowed in
// <head> and close it, so the script and the stylesheets all landed in <body>. The page then
// painted in the light palette and turned dark only ~130ms later.

describe('the dark theme of an app page', function () {
	const fs = require('fs');
	const path = require('path');
	const jsdom = require('jsdom');

	function dist(): string {
		return (
			process.env.COOL_DIST_DIR || path.join(__dirname, '..', '..', 'dist')
		);
	}

	function parse(page: string): Document | null {
		const file = path.join(dist(), page);
		if (!fs.existsSync(file)) return null;
		return new jsdom.JSDOM(fs.readFileSync(file, 'utf8')).window.document;
	}

	function stylesheets(document: Document): HTMLLinkElement[] {
		return Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
	}

	// The app page is only built with --enable-qtapp.
	const qtPage = parse('cool-qt.html');

	it('runs the theme script before anything can paint', function () {
		if (!qtPage) this.skip();

		const script = qtPage.querySelector('script[src="app-dark-theme.js"]');
		nodeassert.ok(script, 'cool-qt.html loads app-dark-theme.js');
		// In <body> it would run after the page has painted.
		nodeassert.strictEqual(
			script!.parentElement?.tagName,
			'HEAD',
			'the theme script is in <head>, not pushed into <body> by an element before it',
		);
		// Either attribute would let the parser reach the body, and the page paint, first.
		nodeassert.ok(
			!script!.hasAttribute('defer') && !script!.hasAttribute('async'),
			'the theme script is parser-blocking',
		);
	});

	it('runs the theme script before the stylesheets', function () {
		if (!qtPage) this.skip();

		const script = qtPage.querySelector('script[src="app-dark-theme.js"]')!;
		for (const link of stylesheets(qtPage))
			nodeassert.ok(
				script.compareDocumentPosition(link) &
					qtPage.DOCUMENT_POSITION_FOLLOWING,
				`${link.getAttribute('href')} is loaded after the theme script`,
			);
	});

	it('only sets the attribute, leaving the palettes to the page', function () {
		// A color-palette-dark.css link would be wrong now that it runs before
		// the page's links: the dark palette would come first, and
		// [data-theme='dark'] and :root have the same specificity, so the light palette
		// would win on source order and the page would open light.
		const source = fs.readFileSync(
			path.join(__dirname, '..', '..', 'js', 'app-dark-theme.js'),
			'utf8',
		);
		const dom = new jsdom.JSDOM(
			'<!doctype html><html><head></head><body></body></html>',
			{
				url: 'https://example.invalid/cool.html?darkTheme=true',
				runScripts: 'outside-only',
			},
		);
		dom.window.eval(source);

		nodeassert.strictEqual(
			dom.window.document.documentElement.getAttribute('data-theme'),
			'dark',
			'the attribute carries the darkTheme parameter',
		);
		nodeassert.strictEqual(
			dom.window.document.querySelectorAll('link').length,
			0,
			'and nothing else is added to the page',
		);
	});
});
