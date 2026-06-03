/* global describe it cy beforeEach require expect */

var helper = require('../../common/helper');
var calcHelper = require('../../common/calc_helper');

describe(['tagdesktop'], 'Calc autofill marker drag.', function() {

	beforeEach(function() {
		helper.setupAndLoadDocument('calc/autofill.fods');
	});

	// Drag the autofill marker two cells down by invoking its handlers
	// directly. Cypress synthetic DOM events are guarded against by the
	// canvas section container (mouseIsInside, button-state checks), so
	// this is the same approach as the mobile autofill marker test.
	function dragMarkerTwoCellsDown(eventInit) {
		calcHelper.clickOnFirstCell();
		cy.cGet('[id="test-div-auto fill marker"]').should('exist');

		cy.getFrameWindow().then(function(win) {
			var marker = win.app.sectionContainer.getSectionWithName('auto fill marker');
			expect(marker, 'autofill marker section').to.exist;

			var halfWidth = Math.floor(marker.size[0] / 2);
			var halfHeight = Math.floor(marker.size[1] / 2);
			var cellHeight = win.app.calc.cellCursorRectangle.pHeight;

			var localStart = win.cool.SimplePoint.fromCorePixels([halfWidth, halfHeight]);
			marker.onMouseDown(localStart, new win.MouseEvent('mousedown', eventInit));

			var localEnd = win.cool.SimplePoint.fromCorePixels([halfWidth, halfHeight + cellHeight * 2]);
			marker.onMouseMove(localEnd, [0, cellHeight * 2], new win.MouseEvent('mousemove', eventInit));
			marker.onMouseUp(localEnd, new win.MouseEvent('mouseup', eventInit));
		});

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// After the drag, core opens the auto fill options menu
		// (Copy Cells / Fill Series). On this branch that menu is the
		// jQuery context menu rather than a jsdialog dropdown, so close
		// it by pressing Escape on the visible menu without choosing an
		// entry, leaving the filled values as the drag produced them.
		cy.cGet('.context-menu-list:visible').should('have.length', 1);
		cy.cGet('.context-menu-list:visible').type('{esc}');
		cy.cGet('.context-menu-list:visible').should('have.length', 0);
	}

	// Assert the document contents via clipboard copy rather than via
	// the formulabar: in the copy case A2/A3 hold the same text as A1,
	// so core never re-sends the formulabar setText and the assertion
	// would depend on the load-time message that can be lost in a slow
	// session (i.e. in CI). Select the range via the address input
	// instead of selectEntireSheet, whose row header clicks are not
	// reliable right after the autofill drag.
	function assertCellContents(expectedData) {
		helper.setDummyClipboardForCopy();
		calcHelper.selectCellsInRange('A1:A3');
		helper.copy();
		calcHelper.assertDataClipboardTable(expectedData);
	}

	it('Drag autofill marker fills cells with incremented numbers', function() {
		dragMarkerTwoCellsDown({ button: 0 });

		assertCellContents(['1', '2', '3']);
	});

	it('Ctrl+drag autofill marker copies the source cell', function() {
		dragMarkerTwoCellsDown({ button: 0, ctrlKey: true });

		assertCellContents(['1', '1', '1']);
	});
});
