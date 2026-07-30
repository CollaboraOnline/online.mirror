/* global describe it cy require beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Comment markers in the page margin', function() {

	beforeEach(function() {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.ensureSidebarHidden();
	});

	it('a comment is marked where it was written', function() {
		desktopHelper.insertComment('a comment to find again');

		cy.cGet('.comment-margin-marker').should('have.length', 1);
	});

	it('the marker sits in the margin of the page, past the words', function() {
		desktopHelper.insertComment('a comment to find again');

		cy.cGet('#document-canvas').then(function(canvas) {
			var page = canvas[0].getBoundingClientRect();
			cy.cGet('.comment-margin-marker').then(function(marker) {
				var box = marker[0].getBoundingClientRect();
				// Inside the view, towards its trailing edge rather than at the
				// place in the text the comment belongs to.
				expect(box.left).to.be.greaterThan(page.left + page.width / 2);
				expect(box.right).to.be.lessThan(page.right);
			});
		});
	});

	it('one marker stands for the comments written in the same place', function() {
		// Both comments are written at the same place in the text, so their
		// markers would cover each other and one marker stands for the two.
		desktopHelper.insertComment('the first comment here');
		desktopHelper.insertComment('the second comment here');

		cy.cGet('.comment-margin-marker').should('have.length', 1);
		cy.cGet('.comment-margin-marker').should('have.class', 'has-many');
		cy.cGet('.comment-margin-marker-count').should('have.text', '2');
	});

	it('a marker counts the replies under the comment as well', function() {
		desktopHelper.insertComment('a comment with an answer');

		cy.cGet('#comment-annotation-menu-1').click();
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Reply').click();
		cy.cGet('#annotation-reply-textarea-1').type('the answer');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', 'the answer');

		cy.cGet('.comment-margin-marker').should('have.length', 1);
		cy.cGet('.comment-margin-marker-count').should('have.text', '2');
	});

	it('a single comment keeps a marker without a number', function() {
		desktopHelper.insertComment('the only comment here');

		cy.cGet('.comment-margin-marker').should('not.have.class', 'has-many');
		cy.cGet('.comment-margin-marker-count').should('not.exist');
	});

	it('the marker of a resolved comment carries a tick', function() {
		desktopHelper.insertComment('a comment to resolve');

		cy.cGet('.comment-margin-marker').should('not.have.class', 'is-resolved');
		cy.cGet('.comment-margin-marker-resolved').should('not.exist');

		cy.cGet('#comment-annotation-menu-1').click();
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Resolve').click();

		cy.cGet('.comment-margin-marker').should('have.class', 'is-resolved');
		cy.cGet('.comment-margin-marker-resolved').should('exist');
	});

	it('picking a marker opens the comment in the navigation panel', function() {
		desktopHelper.insertComment('a comment to reach from its marker');

		cy.cGet('.comment-margin-marker').click();

		cy.cGet('#comments-dock-wrapper').should('be.visible');
		cy.cGet('#tab-comments').should('have.class', 'selected');
		cy.cGet('.comments-panel-comment.is-selected')
			.find('.comments-panel-comment-text')
			.should('have.text', 'a comment to reach from its marker');
	});

	it('a picked comment is joined to its marker by a line', function() {
		desktopHelper.insertComment('a comment with a line to its marker');

		cy.cGet('.comment-margin-marker').click();

		cy.cGet('#comment-arrow-line').should('exist');

		// The line and the marker are both placed against the top left corner of
		// the document view, so the end of the line and the near edge of the
		// marker are the same number there.
		cy.cGet('#document-container').then(function(container) {
			var viewLeft = container[0].getBoundingClientRect().left;
			cy.cGet('.comment-margin-marker').then(function(marker) {
				var markerLeft = marker[0].getBoundingClientRect().left - viewLeft;
				cy.cGet('#comment-arrow-line').should(function(line) {
					expect(Math.abs(Number(line.attr('x2')) - markerLeft))
						.to.be.lessThan(2);
				});
			});
		});
	});

	it('no marker is left when the comments are turned off', function() {
		desktopHelper.insertComment('a comment to hide');

		cy.cGet('.comment-margin-marker').should('have.length', 1);

		desktopHelper.toggleComments();

		cy.cGet('.comment-margin-marker').should('have.length', 0);
	});
});

describe(['tagdesktop'], 'Comments in the multi page view', function() {

	beforeEach(function() {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.ensureSidebarHidden();
	});

	function switchToMultiPageView() {
		cy.cGet('#multi-page-view-button').click();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
			expect(win.app.activeDocument.activeLayout.type).to.equal('ViewLayoutMultiPage');
		});
	}

	it('the pages are left to themselves and the marker stands for the comment', function() {
		desktopHelper.insertComment('a comment to leave in the margin');

		switchToMultiPageView();

		cy.cGet('#comment-container-1').should('not.be.visible');
		cy.cGet('.comment-margin-marker').should('be.visible');
	});

	it('a comment comes back beside the page in the single page view', function() {
		desktopHelper.insertComment('a comment to come back');

		switchToMultiPageView();
		cy.cGet('#comment-container-1').should('not.be.visible');

		// The same button takes the view back to one page at a time.
		cy.cGet('#multi-page-view-button').click();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
			expect(win.app.activeDocument.activeLayout.type).to.equal('ViewLayoutWriter');
		});

		cy.cGet('.comment-margin-marker').click();
		cy.cGet('#comment-container-1').should('be.visible');
	});
});
