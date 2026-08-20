/* -*- js-indent-level: 8 -*- */
/* global describe it require cy beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Comment on a cell outside the frozen area', function() {

	beforeEach(function() {
		// comment_frozen_panes.fods holds a comment on E10, the one every test
		// here jumps to, and a second one far away on K60. Each test freezes the
		// rows and columns it needs, so E10 scrolls with both axes.
		helper.setupAndLoadDocument('calc/comment_frozen_panes.fods');
		desktopHelper.switchUIToNotebookbar();
		cy.getFrameWindow().then((win) => {
			this.win = win;
			helper.processToIdle(win);
		});
	});

	// The comment on E10, the one every test here jumps to. A spreadsheet
	// carries its comment ids as numbers, while the identifier that goes into
	// the jump message is text, so the two are compared as text.
	const commentId = '1';

	function getCommentCellRectangle(win) {
		const section = win.app.sectionContainer.getSectionWithName(
			win.app.CSections.CommentList.name);
		const comment = section.sectionProperties.commentList.find(
			(candidate) => String(candidate.sectionProperties.data.id) === commentId);
		return win.app.map._docLayer._cellRangeToTwipRect(
			comment.sectionProperties.data.cellRange).toRectangle();
	}

	// Freezes at the given cell, so the rows above it and the columns left of it
	// keep their place on screen.
	function freezeAt(win, address) {
		helper.typeIntoInputField(helper.addressInputSelector, address);
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
			Values: { Id: commentId }
		}), '*');
		return helper.processToIdle(win);
	}

	// Both jumps stay in one test on purpose. The second one repeats the command
	// with the cell cursor already on the comment's cell, and only the first jump
	// puts the cursor there. A jump that finds the cursor already in place is the
	// case where nothing but the jump itself can bring the cell back on screen.
	it('jumping to the comment brings its cell on screen', function() {
		const win = this.win;

		freezeAt(win, 'B2');

		// Scrolling has to take the cell away first, or the jump would have
		// nothing to bring back and the check below would hold either way.
		cy.then(function() { return scrollFarAway(win); });
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOffScreen(frameWindow);
		});
		cy.then(function() { return goToComment(win); });

		cy.cGet('#comment-container-' + commentId).should('be.visible');
		cy.cGet(helper.addressInputSelector).should('have.prop', 'value', 'E10');
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOnScreen(frameWindow);
		});

		cy.then(function() { return scrollFarAway(win); });
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOffScreen(frameWindow);
		});
		cy.then(function() { return goToComment(win); });

		cy.cGet('#comment-container-' + commentId).should('be.visible');
		cy.getFrameWindow().should((frameWindow) => {
			assertCommentCellIsOnScreen(frameWindow);
		});
	});

	// Freezing at E10 puts the comment's own cell on both split lines. A cell that
	// starts exactly where the frozen rows and columns end belongs to the pane that
	// scrolls, so it goes off screen with it and the jump has to fetch it back.
	it('jumping to a comment on the first cell after the split brings it on screen',
		function() {
			const win = this.win;

			freezeAt(win, 'E10');

			cy.then(function() { return scrollFarAway(win); });
			cy.getFrameWindow().should((frameWindow) => {
				assertCommentCellIsOffScreen(frameWindow);
			});
			cy.then(function() { return goToComment(win); });

			cy.cGet('#comment-container-' + commentId).should('be.visible');
			cy.getFrameWindow().should((frameWindow) => {
				assertCommentCellIsOnScreen(frameWindow);
			});
		});

	// The document opens with E10 on screen while the second comment, on K60, is
	// far outside the view. Showing the comments walks the whole list, and no
	// comment in it may drag the view along.
	it('jumping to a comment already on screen leaves the view where it is', function() {
		const win = this.win;
		let before;

		cy.getFrameWindow().then((frameWindow) => {
			assertCommentCellIsOnScreen(frameWindow);
			before = frameWindow.app.activeDocument.activeLayout.viewedRectangle.toArray();
		});

		cy.then(function() { return goToComment(win); });

		cy.cGet('#comment-container-' + commentId).should('be.visible');
		cy.getFrameWindow().should((frameWindow) => {
			expect(frameWindow.app.activeDocument.activeLayout.viewedRectangle.toArray(),
				'viewed rectangle').to.deep.equal(before);
		});
	});
});
