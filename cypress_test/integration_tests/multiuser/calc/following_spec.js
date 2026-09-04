/* global describe it cy beforeEach require expect */

var helper = require('../../common/helper');
var calcHelper = require('../../common/calc_helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagmultiuser'], 'Check following the other views', function() {

	beforeEach(function() {
		helper.setupAndLoadDocument('calc/following.ods',true);
		desktopHelper.switchUIToNotebookbar();
	});

	it('Stop following on click', function() {
		// second view follow the first one
		cy.cSetActiveFrame('#iframe2');
		cy.cGet('#userListHeader').click();
		cy.cGet('.user-list-item').eq(1).click();
		cy.cGet('.jsdialog-overlay').should('not.exist');

		// second view clicks on the cell
		cy.cGet('#followingChip').should('be.visible');
		calcHelper.clickOnFirstCell();

		// following is off
		cy.cGet('#followingChip').should('not.be.visible');
	});

	it('Stop following on formulabar', function() {
		// second view follow the first one
		cy.cSetActiveFrame('#iframe2');
		cy.cGet('#userListHeader').click();
		cy.cGet('.user-list-item').eq(1).click();
		cy.cGet('.jsdialog-overlay').should('not.exist');

		// second view activates the formulabar
		cy.cGet('#followingChip').should('be.visible');
		cy.cGet('#sc_input_window').click();

		// following is off
		cy.cGet('#followingChip').should('not.be.visible');
	});

	// Write into one view's cell, leaving the text committed and the core idle.
	function writeIntoCell(frame, address, text) {
		const formulaBar = '#sc_input_window .ui-custom-textarea-text-layer';

		cy.cSetActiveFrame(frame);
		cy.getFrameWindow().then(function(win) {
			calcHelper.enterCellAddressAndConfirm(win, address);
		});
		cy.cGet(formulaBar).click();
		cy.cGet(formulaBar).type(text + '{enter}');
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});
	}

	it('Follow a view that wrote far down the sheet', function() {
		const FOLLOWED_ROW_INDEX = 289919;

		writeIntoCell('#iframe1', 'C289920', 'far');
		writeIntoCell('#iframe2', 'C7', 'near');

		// The second view starts following the first one.
		cy.cGet('#userListHeader').click();
		cy.cGet('.user-list-item').eq(1).click();
		cy.cGet('.jsdialog-overlay').should('not.exist');

		// The second view is looking at the row the first view is on.
		cy.getFrameWindow().then(function(win2) {
			cy.wrap(win2).should(function(win) {
				const rows = win.app.map._docLayer.sheetGeometry.getRowsGeometry();
				const viewed = win.app.activeDocument.activeLayout.viewedRectangle;
				const firstRow = rows.getIndexFromPos(viewed.y1, 'tiletwips');
				const lastRow = rows.getIndexFromPos(viewed.y2, 'tiletwips');
				expect(firstRow, 'first visible row').to.be.at.most(FOLLOWED_ROW_INDEX);
				expect(lastRow, 'last visible row').to.be.at.least(FOLLOWED_ROW_INDEX);
			});
		});
	});
});
