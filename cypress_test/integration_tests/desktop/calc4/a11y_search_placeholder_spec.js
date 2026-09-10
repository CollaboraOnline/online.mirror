/* global describe expect it cy before require Cypress */

const helper = require('../../common/helper');
const calcHelper = require('../../common/calc_helper');
const a11yHelper = require('../../common/a11y_helper');

// A list long enough to be searched carries a search field, and the only thing
// naming it on screen is its placeholder. The ratio is read off the page rather
// than listed here, so it follows whatever palette the run is under.
describe(['tagdesktop'], 'Search placeholder', { testIsolation: false }, function () {
	let win;

	before(function () {
		cy.viewport(1920, 1080);
		const brand = Cypress.env('brandTheme');
		helper.setupAndLoadDocument('calc/switch.ods', false, false, undefined,
			brand ? 'theme=' + brand : undefined);

		cy.getFrameWindow().then(function (frameWindow) { win = frameWindow; });

		calcHelper.dblClickOnFirstCell();
		cy.then(function () { win.app.map.sendUnoCommand('.uno:FormatCellDialog'); });
		cy.cGet('.ui-dialog[role="dialog"]').should('have.length', 1);
		cy.then(function () { return helper.processToIdle(win); });
	});

	function fields() {
		return win.document.querySelectorAll('.ui-dialog .ui-treeview-search-input');
	}

	function assertReadable(theme) {
		const found = fields();
		expect(found.length, theme + ': the dialog has search fields').to.be.greaterThan(0);

		found.forEach(function (field) {
			const colour = win.getComputedStyle(field, '::placeholder').color;
			const ratio = a11yHelper.contrastRatio(
				colour, a11yHelper.effectiveBackground(win, field));

			expect(ratio, theme + ': ' + field.id + ', ' + colour).to.be.at.least(4.5);
		});
	}

	it('is readable against the field it names', function () {
		assertReadable('light');
	});

	it('and in dark mode too', function () {
		cy.then(function () { win.app.map.uiManager.toggleDarkMode(); });
		cy.cframe().find('html').should('have.attr', 'data-theme', 'dark');
		cy.then(function () { return helper.processToIdle(win); });

		cy.then(function () { assertReadable('dark'); });
	});
});
