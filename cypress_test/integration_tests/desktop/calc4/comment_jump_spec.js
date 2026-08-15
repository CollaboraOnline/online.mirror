/* -*- js-indent-level: 8 -*- */
/* global describe it require cy beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Comment on a cell outside the frozen area', function() {

	beforeEach(function() {
		// comment_frozen_panes.fods holds one comment, on E10. The test freezes
		// row 1 and column A, so the comment's cell scrolls with both axes.
		helper.setupAndLoadDocument('calc/comment_frozen_panes.fods');
		desktopHelper.switchUIToNotebookbar();
		cy.getFrameWindow().then((win) => {
			this.win = win;
			helper.processToIdle(win);
		});
	});

	function getCommentCellRectangle(win) {
		const section = win.app.sectionContainer.getSectionWithName(
			win.app.CSections.CommentList.name);
		const comment = section.sectionProperties.commentList[0];
		return win.app.map._docLayer._cellRangeToTwipRect(
			comment.sectionProperties.data.cellRange).toRectangle();
	}

	// The comment's cell counts as on screen only when it sits inside one of the
	// panes. The frozen row and column each form their own pane, so a cell can be
	// off screen while sitting between a pane's edge and the split line.
	function commentCellPlacement(win) {
		const cellRectangle = getCommentCellRectangle(win);
		const panes = win.app.getViewRectangles();
		return {
			onScreen: panes.some((pane) => pane.containsRectangle(cellRectangle)),
			description: 'cell ' + JSON.stringify(cellRectangle) + ' is inside one of '
				+ JSON.stringify(panes.map((pane) => pane.toArray())),
		};
	}

	function assertCommentCellIsOnScreen(win) {
		const placement = commentCellPlacement(win);
		expect(placement.onScreen, placement.description).to.be.true;
	}

	function assertCommentCellIsOffScreen(win) {
		const placement = commentCellPlacement(win);
		expect(placement.onScreen, placement.description).to.be.false;
	}

	function scrollFarAway(win) {
		win.app.activeDocument.activeLayout.scroll(4000, 8000);
		return helper.processToIdle(win);
	}

	function goToComment(win) {
		win.postMessage(JSON.stringify({
			MessageId: 'Action_GoToComment',
			Values: { Id: '1' }
		}), '*');
		return helper.processToIdle(win);
	}

	// Both jumps stay in one test on purpose. The second one repeats the command
	// with the cell cursor already on the comment's cell, and only the first jump
	// puts the cursor there. A jump that finds the cursor already in place is the
	// case where nothing but the jump itself can bring the cell back on screen.
	it('jumping to the comment brings its cell on screen', function() {
		const win = this.win;

		// The freeze splits at the cursor, so B2 freezes row 1 and column A.
		helper.typeIntoInputField(helper.addressInputSelector, 'B2');
		cy.then(function() {
			win.app.map.sendUnoCommand('.uno:FreezePanes');
		});
		helper.waitForMapState('.uno:FreezePanes', 'true');
		// The split position arrives with its own message, so let it settle.
		cy.getFrameWindow().should((frameWindow) => {
			expect(frameWindow.app.calc.splitCoordinate.x, 'frozen columns').to.be.greaterThan(0);
			expect(frameWindow.app.calc.splitCoordinate.y, 'frozen rows').to.be.greaterThan(0);
		});
		cy.then(function() { return helper.processToIdle(win); });

		// Scrolling has to take the cell away first, or the jump would have
		// nothing to bring back and the check below would hold either way.
		cy.then(function() { return scrollFarAway(win); });
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOffScreen(frameWindow);
		});
		cy.then(function() { return goToComment(win); });

		cy.cGet('#comment-container-1').should('be.visible');
		cy.cGet(helper.addressInputSelector).should('have.prop', 'value', 'E10');
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOnScreen(frameWindow);
		});

		cy.then(function() { return scrollFarAway(win); });
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOffScreen(frameWindow);
		});
		cy.then(function() { return goToComment(win); });

		cy.cGet('#comment-container-1').should('be.visible');
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOnScreen(frameWindow);
		});
	});
});
