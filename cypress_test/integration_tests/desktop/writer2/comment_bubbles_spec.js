/* global describe it cy require beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

// All the page shows of a Writer comment is a bubble in the
// margin, so that is what these tests measure.
function bubbleOf(id) {
	return cy.cGet('#comment-container-' + id + ' .cool-annotation-img');
}

// Where the page ends across the width of the window, in pixels.
function pageEdges() {
	return cy.cGet('#document-container').then(function($container) {
		const left = $container[0].getBoundingClientRect().left;
		return cy.getFrameWindow().then(function(win) {
			const end = new win.cool.SimplePoint(win.app.activeDocument.fileSize.x, 0);
			return { left: left, right: left + end.vX / win.app.dpiScale };
		});
	});
}

describe(['tagdesktop'], 'Comment bubbles in the page margin', function() {

	beforeEach(function() {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.ensureSidebarHidden();
	});

	it('a comment is a bubble inside the margin of its page', function() {
		desktopHelper.insertComment('a comment to find in the margin');

		bubbleOf(1).should('be.visible');
		cy.cGet('#comment-container-1').should('be.not.visible');

		// Inside the page, towards the edge it ends at rather
		// than at the place in the text the comment belongs to.
		pageEdges().then(function(page) {
			bubbleOf(1).should(function($bubble) {
				const box = $bubble[0].getBoundingClientRect();
				expect(box.right, 'the far edge of the bubble against the end of the page')
					.to.be.at.most(page.right);
				expect(box.left, 'the near edge of the bubble against the middle of the page')
					.to.be.greaterThan(page.left + (page.right - page.left) * 0.8);
			});
		});
	});

	it('the bubble sits at the height of the words the comment belongs to', function() {
		helper.typeIntoDocument('{enter}{enter}{enter}a line to comment on');
		desktopHelper.insertComment('a comment three lines down');

		cy.cGet('#document-container').then(function($container) {
			const top = $container[0].getBoundingClientRect().top;
			cy.getFrameWindow().then(function(win) {
				const section = win.app.sectionContainer.getSectionWithName(
					win.app.CSections.CommentList.name);
				const anchor = section.getComment('1').sectionProperties.data.anchorSPoint;
				const anchorTop = top + anchor.vY / win.app.dpiScale;

				bubbleOf(1).should(function($bubble) {
					expect($bubble[0].getBoundingClientRect().top, 'the top of the bubble')
						.to.be.closeTo(anchorTop, 2);
				});
			});
		});
	});

	it('picking a bubble brings the comment up in the navigation panel', function() {
		desktopHelper.insertComment('a comment to reach from its bubble');

		bubbleOf(1).click();

		cy.cGet('#comments-dock-wrapper').should('be.visible');
		cy.cGet('#tab-comments').should('have.class', 'selected');
		cy.cGet('.comments-panel-comment.is-selected')
			.find('.comments-panel-comment-text')
			.should('have.text', 'a comment to reach from its bubble');
	});

	it('a picked comment is joined to its bubble by a line', function() {
		desktopHelper.insertComment('a comment with a line to its bubble');

		bubbleOf(1).click();

		cy.cGet('#comment-arrow-line').should('exist');

		// The line and the bubble are placed against the same
		// corner, so both are read on each try.
		cy.cGet('body').should(function($body) {
			const viewLeft = $body.find('#document-container')[0].getBoundingClientRect().left;
			const bubbleLeft = $body.find('#comment-container-1 .cool-annotation-img')[0]
				.getBoundingClientRect().left - viewLeft;
			const lineEnd = Number($body.find('#comment-arrow-line').attr('x2'));

			expect(lineEnd, 'the end of the line against the near edge of the bubble')
				.to.be.closeTo(bubbleLeft, 3);
		});
	});

	it('a reply stands behind the bubble of the comment it answers', function() {
		desktopHelper.insertComment('a comment with an answer');

		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('the answer');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', 'the answer');

		// One bubble stands for the whole conversation.
		bubbleOf(1).should('be.visible');
		bubbleOf(2).should('be.not.visible');
	});

	it('bubbles of comments written close together are drawn at half size', function() {
		desktopHelper.insertComment('the first comment here');

		// A bubble that has the margin to itself is drawn at
		// full size.
		bubbleOf(1).then(function($alone) {
			const fullHeight = $alone[0].getBoundingClientRect().height;

			// The second comment is written at the same place,
			// so the two bubbles are drawn at half size.
			desktopHelper.insertComment('the second comment here');

			cy.cGet('body').should(function($body) {
				const first = $body.find('#comment-container-1 .cool-annotation-img')[0]
					.getBoundingClientRect();
				const second = $body.find('#comment-container-2 .cool-annotation-img')[0]
					.getBoundingClientRect();

				expect(first.height, 'the height of a crowded bubble')
					.to.be.closeTo(fullHeight / 2, 2);
				expect(second.height, 'the height of the bubble under it')
					.to.be.closeTo(fullHeight / 2, 2);
				expect(second.top, 'the top of the bubble under it')
					.to.be.closeTo(first.bottom, 2);
			});
		});
	});

	it('no bubble is left when the comments are turned off', function() {
		desktopHelper.insertComment('a comment to hide');

		bubbleOf(1).should('be.visible');

		desktopHelper.toggleComments();

		bubbleOf(1).should('be.not.visible');
	});
});

describe(['tagdesktop'], 'Comment bubbles in the multi page view', function() {

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

	it('the bubble stays in the margin of its page when several pages are on screen', function() {
		desktopHelper.insertComment('a comment to keep in the margin');

		switchToMultiPageView();

		// The pages have the whole width here, so a box has
		// nowhere to sit. The bubble needs none and stays.
		bubbleOf(1).should('be.visible');
		cy.cGet('#comment-container-1').should('be.not.visible');
	});

	it('the bubble comes back in the single page view', function() {
		desktopHelper.insertComment('a comment to come back');
		bubbleOf(1).should('be.visible');

		switchToMultiPageView();
		bubbleOf(1).should('be.visible');

		// The same button takes the view back to one page at a
		// time.
		cy.cGet('#multi-page-view-button').click();
		cy.getFrameWindow().then(function(win) {
			helper.processToIdle(win);
			expect(win.app.activeDocument.activeLayout.type).to.equal('ViewLayoutWriter');
		});

		bubbleOf(1).should('be.visible');
	});
});
