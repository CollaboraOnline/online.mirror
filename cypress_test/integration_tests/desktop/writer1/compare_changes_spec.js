/* global describe it cy require expect Cypress */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop', 'tagnextcloud', 'tagproxy'], 'Compare Changes view.', function() {

	function loadDocument(fileName) {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/' + fileName);
		desktopHelper.switchUIToNotebookbar();
		cy.cGet('#Review-tab-label').click();
	}

	function enterCompareChangesMode() {
		desktopHelper.getNbIconArrow('TrackChanges', 'Review').click();
		cy.cGet('#compare-tracked-change-button').filter(':visible').click();
		cy.cGet('#compare-tracked-change-entry-1').click();
		cy.cGet('.compare-changes-labels').should('not.have.css', 'display', 'none');
	}

	// The bubble that stands for a comment belongs in the margin
	// of the version it was written in, on the trailing side.
	function bubbleSitsInTheTrailingPage() {
		// All the page carries of a comment is its bubble, so
		// that is what says whether the comment is on show.
		cy.cGet('#comment-container-1 .cool-annotation-img').should(function($el) {
			var style = $el[0].ownerDocument.defaultView.getComputedStyle($el[0]);
			expect(style.visibility, 'the bubble').to.equal('visible');
			expect($el[0].getBoundingClientRect().width, 'the width of the bubble')
				.to.be.greaterThan(0);
		});

		cy.getFrameWindow().then(function(win) {
			var layout = win.app.activeDocument.activeLayout;
			var pageStart = new win.cool.SimplePoint(0, 0);
			pageStart.mode = 2; // TileMode.RightSide
			var pageEnd = new win.cool.SimplePoint(win.app.activeDocument.fileSize.x, 0);
			pageEnd.mode = 2;
			var start = layout.documentToViewX(pageStart) / win.app.dpiScale;
			var end = layout.documentToViewX(pageEnd) / win.app.dpiScale;

			cy.cGet('#document-container').then(function($container) {
				var viewLeft = $container[0].getBoundingClientRect().left;
				cy.cGet('#comment-container-1 .cool-annotation-img').should(function($el) {
					var box = $el[0].getBoundingClientRect();
					expect(box.left - viewLeft, 'bubble vs the start of the page')
						.to.be.at.least(start);
					expect(box.right - viewLeft, 'bubble vs the end of the page')
						.to.be.at.most(end);
				});
			});
		});
	}

	it('A bubble in the page margin stands for a comment.', function() {
		// Given a document with a comment, sidebar is visible:
		loadDocument('track_changes_comment.docx');
		cy.cGet('#sidebar-dock-wrapper').should('be.visible');

		// When changing to doc compare mode:
		enterCompareChangesMode();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Then the two versions are side by side and no comment
		// box is beside them.
		cy.cGet('#comment-container-1').should('not.be.visible');

		bubbleSitsInTheTrailingPage();
	});

	it('The two versions share the whole width of the window.', function() {
		// Given a document with a comment, in doc compare mode:
		loadDocument('track_changes_comment.docx');
		enterCompareChangesMode();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Then what is left past the trailing page is a margin,
		// not a column wide enough to hold a comment.
		cy.getFrameWindow().then(function(win) {
			var layout = win.app.activeDocument.activeLayout;
			var pageEnd = new win.cool.SimplePoint(win.app.activeDocument.fileSize.x, 0);
			pageEnd.mode = 2; // TileMode.RightSide
			var end = layout.documentToViewX(pageEnd) / win.app.dpiScale;
			var commentWidth = win.cool.CommentSection.getCommentWidth() / win.app.dpiScale;

			cy.cGet('#document-container').should(function($el) {
				expect($el.width() - end, 'room left past the trailing page')
					.to.be.lessThan(commentWidth / 2);
			});
		});
	});

	it('Picking the bubble of a comment reads it in the navigation panel.', function() {
		loadDocument('track_changes_comment.docx');
		enterCompareChangesMode();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Picking the mode can leave an overlay over the page.
		// Take it away, so the bubble underneath can be picked.
		cy.cGet('body').then(function($body) {
			if ($body.find('.jsdialog-overlay.cancellable').length)
				cy.cGet('.jsdialog-overlay.cancellable').click();
		});
		cy.cGet('.jsdialog-overlay').should('not.exist');

		cy.cGet('#comment-container-1 .cool-annotation-img').click();

		cy.cGet('#comments-dock-wrapper').should('be.visible');
		cy.cGet('#tab-comments').should('have.class', 'selected');
		cy.cGet('.comments-panel-comment.is-selected').should('exist');

		// Reading a comment still leaves the pages to
		// themselves.
		cy.cGet('#comment-container-1').should('not.be.visible');
	});

	// Regression test for: compare changes view: fix "scroll by pressing scrollbar" feature.
	// Bug: In CompareChanges view, viewedRectangle.pY1 can be negative (due to
	// yStart offset) even when scrolling is possible, so the scrollbar click was
	// blocked. The fix uses canScrollVertical/canScrollHorizontal instead.
	it('Scrollbar vertical scroll works in compare changes mode.', function() {
		loadDocument('track_changes.odt');
		enterCompareChangesMode();

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Record initial viewY.
		var initialViewY;
		cy.getFrameWindow().then(function(win) {
			var layout = win.app.activeDocument.activeLayout;
			expect(layout.type).to.equal('ViewLayoutCompareChanges');
			initialViewY = layout.scrollProperties.viewY;
		});

		// Scroll down using the scroll section offset API (simulates scrollbar drag).
		cy.getFrameWindow().then(function(win) {
			win.app.sectionContainer.getSectionWithName('scroll').scrollVerticalWithOffset(200);
		});

		// viewY should increase even though viewedRectangle.pY1 might be negative.
		cy.getFrameWindow().then(function(win) {
			cy.wrap(null).should(function() {
				var layout = win.app.activeDocument.activeLayout;
				expect(layout.scrollProperties.viewY, 'viewY after vertical scroll').to.be.greaterThan(initialViewY);
			});
		});
	});

	// Verify that canScrollVertical returns true in compare changes mode
	// even when viewedRectangle.pY1 is negative (due to yStart offset).
	it('canScrollVertical is true in compare changes mode.', function() {
		loadDocument('track_changes.odt');
		enterCompareChangesMode();

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		cy.getFrameWindow().then(function(win) {
			var layout = win.app.activeDocument.activeLayout;
			var documentAnchor = win.app.sectionContainer.getSectionWithName(win.app.CSections.Tiles.name);

			// canScrollVertical should be true (the document is taller than the viewport).
			expect(layout.canScrollVertical(documentAnchor), 'canScrollVertical').to.be.true;
		});
	});

	// Regression test for: comparechanges view: fix onresize and vertical scroll.
	// Bug: When the browser window was resized, the compare changes layout was not
	// refreshed, so the two side-by-side views were not repositioned correctly.
	// The fix adds a resize handler that updates halfWidth and refreshes the view.
	it('Resize updates compare changes layout.', function() {
		loadDocument('track_changes.odt');
		enterCompareChangesMode();

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Ensure sidebar is closed so we start from a known state.
		cy.cGet('#sidebar-dock-wrapper').then(function($el) {
			if (Cypress.dom.isVisible($el[0])) {
				desktopHelper.sidebarToggle();
				cy.cGet('#sidebar-dock-wrapper').should('not.be.visible');
			}
		});

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Record halfWidth with sidebar closed (full canvas width).
		cy.getFrameWindow().then(function(win) {
			var layout = win.app.activeDocument.activeLayout;
			expect(layout.halfWidth, 'initial halfWidth').to.be.greaterThan(0);
			cy.wrap(layout.halfWidth).as('initialHalfWidth');
		});

		// Open sidebar to reduce canvas width, which fires the resize event.
		desktopHelper.sidebarToggle();
		cy.cGet('#sidebar-dock-wrapper').should('be.visible');

		// After sidebar opens, halfWidth should decrease since the
		// document anchor section is narrower.
		cy.get('@initialHalfWidth').then(function(initialHalfWidth) {
			cy.getFrameWindow().then(function(win) {
				cy.wrap(null, {timeout: 10000}).should(function() {
					var newHalfWidth = win.app.activeDocument.activeLayout.halfWidth;
					expect(newHalfWidth, 'halfWidth after sidebar toggle').to.not.equal(initialHalfWidth);
				});
			});
		});
	});

	// Verify that viewSize covers both left and right document pages.
	// Bug: viewSize.pX was calculated using halfWidth instead of full canvas width,
	// so the horizontal extent did not account for both pages.
	it('View size covers both pages in compare changes mode.', function() {
		loadDocument('track_changes.odt');
		enterCompareChangesMode();

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		cy.getFrameWindow().then(function(win) {
			var layout = win.app.activeDocument.activeLayout;
			var documentAnchor = win.app.sectionContainer.getSectionWithName(win.app.CSections.Tiles.name);

			// viewSize.pX should be at least as wide as the canvas (both pages fit).
			expect(layout.viewSize.pX, 'viewSize.pX').to.be.at.least(documentAnchor.size[0]);
		});
	});

	// Regression test for: compare changes view: tile rendering issue.
	// Bug: The visible area rectangle (viewedRectangle) was too narrow, so tiles
	// for the left page were not requested. The fix widens it to cover the full
	// document width so that both left-side and right-side tiles are rendered.
	it('Visible area covers full document width for tile rendering.', function() {
		loadDocument('track_changes.odt');
		enterCompareChangesMode();

		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// The viewedRectangle should be wide enough to cover the full document.
		cy.getFrameWindow().then(function(win) {
			cy.wrap(null).should(function() {
				var layout = win.app.activeDocument.activeLayout;
				var docWidth = win.app.activeDocument.fileSize.pX;

				// viewedRectangle width must cover the full document width (both pages
				// need tiles from the same X range). The fix added margin, so the
				// rectangle width should be >= document width.
				expect(layout.viewedRectangle.width, 'viewedRectangle covers document width').to.be.at.least(docWidth);
			});
		});
	});

	// Verify both tile modes (LeftSide and RightSide) have content after the
	// tile rendering fix. This complements the existing "View Changes mode has
	// tiles for both modes" test by checking specifically after the visible area fix.
	it('Both left and right side tiles have content after visible area fix.', function() {
		loadDocument('track_changes.odt');
		enterCompareChangesMode();

		// Wait for tiles to be rendered.
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		cy.getFrameWindow().then(function(win) {
			cy.wrap(null).should(function() {
				var tiles = win.RenderManager.getTiles();
				var hasMode1 = false;
				var hasMode2 = false;
				tiles.forEach(function(tile) {
					if (tile.coords.mode === 1 && tile.hasContent() && tile.distanceFromView < Number.MAX_SAFE_INTEGER) {
						hasMode1 = true;
					}
					if (tile.coords.mode === 2 && tile.hasContent() && tile.distanceFromView < Number.MAX_SAFE_INTEGER) {
						hasMode2 = true;
					}
				});
				expect(hasMode1, 'mode=1 (LeftSide) tiles with content').to.be.true;
				expect(hasMode2, 'mode=2 (RightSide) tiles with content').to.be.true;
			});
		});
	});

	it('The bubble of a comment stays clear of the sidebar in compare mode.', function() {
		// Given a document with a comment, sidebar hidden, in doc compare mode:
		loadDocument('track_changes_comment.docx');
		desktopHelper.sidebarToggle();
		cy.cGet('#sidebar-dock-wrapper').should('not.be.visible');
		enterCompareChangesMode();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// And then turning the sidebar on:
		desktopHelper.sidebarToggle();
		cy.cGet('#sidebar-dock-wrapper').should('be.visible');
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
		});

		// Then the pages have made room for the sidebar and the
		// bubble has gone with its page, so neither is under it.
		bubbleSitsInTheTrailingPage();
		cy.cGet('#sidebar-dock-wrapper').then(function($sidebar) {
			var sidebarLeft = $sidebar[0].getBoundingClientRect().left;

			cy.cGet('#comment-container-1 .cool-annotation-img').should(function($el) {
				expect($el[0].getBoundingClientRect().right, 'bubble right vs sidebar left')
					.to.be.at.most(sidebarLeft);
			});
		});
	});
});
