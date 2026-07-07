/* global describe it cy beforeEach require */

var helper = require('../../common/helper');
var calcHelper = require('../../common/calc_helper');
var a11yHelper = require('../../common/a11y_helper');

// Opening the context menu from the keyboard must place it at the active cell
// and move keyboard focus into it, so it can be driven without the mouse.
describe(['tagdesktop'], 'Calc keyboard context menu', function () {
	beforeEach(function () {
		helper.setupAndLoadDocument('calc/context_menu.ods');

		// start with the keyboard focus in the sheet grid on a known cell
		calcHelper.clickOnFirstCell();
		helper.assertFocus('className', 'clipboard');
	});

	it('Shift+F10 opens the cell context menu with its first entry selected', function () {
		cy.realPress(['Shift', 'F10']);

		// the full cell menu, not the shorter edit menu
		cy.cGet('.context-menu-list:visible').should('exist');
		cy.cGet('.context-menu-item:visible').its('length').should('be.greaterThan', 10);
		// focus lands inside the menu instead of staying on the sheet grid
		a11yHelper.assertFocusWithin('.context-menu-root:visible');
		// the first entry opens already selected so the arrow keys act at once
		cy.cGet('.context-menu-item.context-menu-hover:visible').should('have.length', 1);
	});

	it('Arrow keys move the selection between entries within the menu', function () {
		cy.realPress(['Shift', 'F10']);
		cy.cGet('.context-menu-item.context-menu-hover:visible').should('have.length', 1);

		// arrowing down moves the selection on to a later entry, still in the
		// menu, so the highlighted entry's text changes
		cy.cGet('.context-menu-item.context-menu-hover:visible').invoke('text').then(function (firstEntryText) {
			cy.realPress('ArrowDown');
			a11yHelper.assertFocusWithin('.context-menu-root:visible');
			cy.cGet('.context-menu-item.context-menu-hover:visible')
				.invoke('text')
				.should('not.equal', firstEntryText);
		});
	});
});
