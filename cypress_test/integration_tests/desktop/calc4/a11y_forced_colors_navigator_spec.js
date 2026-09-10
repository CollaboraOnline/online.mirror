/* global describe it cy before expect require Cypress */

const helper = require('../../common/helper');

// With forced colours the user picks the palette, and anything that keeps a
// colour of its own is what they cannot read. The expander chevron of a
// collapsed row was darkened by a filter, and it is read off the page under
// the emulated media query rather than trusted from the stylesheet.
describe(['tagdesktop'], 'Navigator under forced colours', { testIsolation: false }, function () {
	let win;

	before(function () {
		cy.viewport(1920, 1080);
		helper.setupAndLoadDocument('calc/navigator.ods');
		cy.getFrameWindow().then(function (frameWindow) { win = frameWindow; });
		cy.then(function () { win.app.map.sendUnoCommand('.uno:Navigator'); });
		cy.cGet('#contentbox').should('be.visible');
		cy.then(function () { return helper.processToIdle(win); });

		cy.then(function () {
			return Cypress.automation('remote:debugger:protocol', {
				command: 'Emulation.setEmulatedMedia',
				params: { features: [{ name: 'forced-colors', value: 'active' }] },
			});
		});
		cy.then(function () { return helper.processToIdle(win); });
		cy.then(function () {
			expect(win.matchMedia('(forced-colors: active)').matches,
				'the forced colours media query is on').to.be.true;
		});
	});

	function collapsedExpanders() {
		const rows = win.document.querySelectorAll('#contentbox [aria-expanded="false"]');
		return Array.prototype.map.call(rows, function (row) {
			return row.querySelector('.ui-treeview-expander');
		}).filter(Boolean);
	}

	function assertChevrons(theme) {
		const found = collapsedExpanders();
		expect(found.length, theme + ': the Navigator has collapsed rows').to.be.greaterThan(0);

		// What matters is that nothing dims it. Light drops the filter, dark
		// keeps an identity brightness so the theme's own handling survives.
		found.forEach(function (expander, i) {
			const filter = win.getComputedStyle(expander, '::before').filter;
			const dimmed = /brightness\(0(\.\d+)?\)/.test(filter);
			expect(dimmed, theme + ': row ' + i + ', the chevron is dimmed by ' + filter)
				.to.be.false;
		});
	}

	it('every collapsed row keeps its chevron out of the filter', function () {
		cy.then(function () { assertChevrons('light'); });
	});

	// The rule carries a [data-theme='dark'] variant that sets a filter of its
	// own, so the dark pass is not a formality.
	it('and in dark mode too', function () {
		cy.then(function () { win.app.map.uiManager.toggleDarkMode(); });
		cy.cframe().find('html').should('have.attr', 'data-theme', 'dark');
		cy.then(function () { return helper.processToIdle(win); });

		cy.then(function () { assertChevrons('dark'); });
	});
});
