/* global describe it cy beforeEach require */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');
var impressHelper = require('../../common/impress_helper');

describe(['tagdesktop'], 'Arrow styles of a reloaded shape', function() {

	beforeEach(function() {
		helper.setupAndLoadDocument('impress/arrow_style_reload.fodp');
		desktopHelper.switchUIToNotebookbar();
	});

	function openShapeTab() {
		// Selecting a shape already switches to the Shape tab. Clicking a selected
		// tab collapses the notebookbar, so only click when it is not selected.
		cy.cGet('#Shape-tab-label').should('be.visible').then(function($tab) {
			if (!$tab.hasClass('selected'))
				cy.wrap($tab).click();
		});
		cy.cGet('#Shape-container').should('be.visible');
	}

	it('Start and end arrow styles are recognized after reload', function() {
		impressHelper.selectTextShapeInTheCenter();
		openShapeTab();

		// The document was saved with a crow's foot arrowhead at the start and a
		// plain arrow at the end. Both must be picked up from the saved polygons.
		cy.cGet('#Shape-container #startarrowstyle input')
			.should('have.value', 'CF Zero Many');
		cy.cGet('#Shape-container #endarrowstyle input')
			.should('have.value', 'Arrow');
	});

	it('Line dialog lists the arrow styles of the reloaded shape', function() {
		impressHelper.selectTextShapeInTheCenter();

		cy.getFrameWindow().then(function(win) {
			win.app.map.sendUnoCommand('.uno:FormatLine');
		});
		cy.cGet('#LineDialog').should('be.visible');

		cy.cGet('#LineDialog #LB_START_STYLE input')
			.should('have.value', 'CF Zero Many');
		cy.cGet('#LineDialog #LB_END_STYLE input')
			.should('have.value', 'Arrow');

		cy.cGet('#LineDialog #cancel').click();
		cy.cGet('#LineDialog').should('not.exist');
	});
});
