/* global describe it cy before expect require */

const helper = require('../../common/helper');

describe(['tagdesktop'], 'Sheet tab context menu by keyboard', { testIsolation: false }, function () {
	let win;

	before(function () {
		cy.viewport(1920, 1080);
		helper.setupAndLoadDocument('calc/switch.ods');
		cy.getFrameWindow().then(function (frameWindow) { win = frameWindow; });
		cy.then(function () { return helper.processToIdle(win); });
	});

	it('Shift+F10 opens the menu of the focused tab and Enter runs an entry', function () {
		let before = 0;

		cy.then(function () {
			const tab = win.document.querySelectorAll('#spreadsheet-tab-scroll .spreadsheet-tab')[0];
			before = win.document.querySelectorAll('#spreadsheet-tab-scroll .spreadsheet-tab').length;
			tab.focus();
			expect(win.document.activeElement.id, 'the tab took the focus').to.equal(tab.id);
		});

		cy.realPress(['Shift', 'F10']);

		cy.cGet('.context-menu-list').should('be.visible');
		cy.cGet('.context-menu-list .context-menu-item').should('have.length.greaterThan', 0);
		cy.cGet('#spreadsheet-tab0').should('have.class', 'context-menu-active');

		cy.realPress('ArrowDown');
		cy.cGet('.context-menu-list .context-menu-hover').should('exist');

		cy.realPress('Enter');
		cy.then(function () { return helper.processToIdle(win); });

		cy.then(function () {
			cy.cGet('#spreadsheet-tab-scroll .spreadsheet-tab')
				.should('have.length', before + 1);
		});
	});
});
