/* global describe it cy require beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

// All the page shows of a Writer comment is a bubble in the
// margin, so that is what these tests measure.
function bubbleOf(id) {
	return cy.cGet('#comment-container-' + id + ' .cool-annotation-img');
}

// The badge in the corner of a bubble, which says what the
// thread behind the bubble holds.
function badgeOf(id) {
	return cy.cGet('#comment-container-' + id + ' .cool-annotation-info-collapsed');
}

// Where the page starts and ends across the width of the window,
// in pixels. The first page is the one the tests write on.
function pageEdges() {
	return cy.cGet('#document-container').then(function ($container) {
		const viewLeft = $container[0].getBoundingClientRect().left;
		return cy.getFrameWindow().then(function (win) {
			const page = win.app.file.writer.pageRectangleList[0];
			const start = new win.cool.SimplePoint(page[0], 0);
			const end = new win.cool.SimplePoint(page[0] + page[2], 0);
			return {
				left: viewLeft + start.vX / win.app.dpiScale,
				right: viewLeft + end.vX / win.app.dpiScale,
			};
		});
	});
}

// The colour the document draws a design token in, read back
// from the browser so a test can compare against it.
function colourOfToken(win, token) {
	const probe = win.document.createElement('div');
	probe.style.backgroundColor = 'var(' + token + ')';
	win.document.body.appendChild(probe);
	const colour = win.getComputedStyle(probe).backgroundColor;
	probe.remove();
	return colour;
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

		// On the edge the page ends at, mostly inside the margin
		// and hanging a little past it.
		pageEdges().then(function(page) {
			bubbleOf(1).should(function($bubble) {
				const box = $bubble[0].getBoundingClientRect();
				expect(box.left, 'the near edge of the bubble against the end of the page')
					.to.be.lessThan(page.right);
				expect(box.right, 'the far edge of the bubble against the end of the page')
					.to.be.greaterThan(page.right);
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

				// Room is left between the two, so they read as
				// two comments rather than one long shape.
				const gap = second.top - first.bottom;
				expect(gap, 'the room left between one bubble and the next')
					.to.be.greaterThan(0);
				expect(gap, 'the room left between one bubble and the next')
					.to.be.lessThan(first.height);
			});
		});
	});

	it('no bubble is drawn against the one above it, at any zoom', function() {
		// Two comments a few lines down and two at the top: two
		// runs of bubbles, each to fit without meeting.
		helper.typeIntoDocument('{enter}{enter}{enter}a line further down');
		desktopHelper.insertComment('the first comment down here');
		desktopHelper.insertComment('the second comment down here');
		helper.typeIntoDocument('{ctrl+home}');
		desktopHelper.insertComment('the first comment up here');
		desktopHelper.insertComment('the second comment up here');

		// Zooming out draws the page smaller and brings its
		// comments closer, where bubbles used to meet.
		desktopHelper.selectZoomLevel('50', false);

		cy.cGet('body').should(function($body) {
			const boxes = [1, 2, 3, 4]
				.map(function(id) {
					return $body.find('#comment-container-' + id + ' .cool-annotation-img')[0]
						.getBoundingClientRect();
				})
				.sort(function(one, other) { return one.top - other.top; });

			for (let i = 1; i < boxes.length; i++)
				expect(boxes[i].top, 'the top of a bubble against the bottom of the one above it')
					.to.be.greaterThan(boxes[i - 1].bottom);
		});
	});

	it('a comment on its own that is still open carries no badge', function() {
		desktopHelper.insertComment('a comment on its own');

		bubbleOf(1).should('be.visible');
		// The bubble already stands for one comment still to be
		// read, so a badge has nothing to add to it.
		badgeOf(1).should('be.not.visible');
	});

	it('the badge on the bubble says how many comments the thread holds', function() {
		desktopHelper.insertComment('a comment with an answer');

		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('the answer');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', 'the answer');

		// The comment and the answer under it make two.
		badgeOf(1).should('be.visible');
		badgeOf(1).should('have.text', '2');
		badgeOf(1).should(function($badge) {
			const win = $badge[0].ownerDocument.defaultView;
			// Blue while any comment of the thread is still
			// open, and no tick where there is a number to give.
			expect(win.getComputedStyle($badge[0]).backgroundColor, 'the badge')
				.to.equal(colourOfToken(win, '--color-primary'));
			expect(win.getComputedStyle($badge[0], '::after').borderBottomWidth,
				'the stroke of the tick').to.equal('0px');
		});
	});

	it('the bubble of a comment on its own gets a green tick once it is resolved', function() {
		desktopHelper.insertComment('a comment to resolve');

		desktopHelper.pickCommentAction(1, 'Resolve');

		// Resolved comments are shown to begin with, so the
		// bubble stays once the thread is done.
		badgeOf(1).should('be.visible');
		// A thread of one has no number to give, so the badge
		// draws a tick instead.
		badgeOf(1).should('have.text', '');
		badgeOf(1).should(function($badge) {
			const win = $badge[0].ownerDocument.defaultView;
			expect(win.getComputedStyle($badge[0]).backgroundColor, 'the badge')
				.to.equal(colourOfToken(win, '--color-success'));
			expect(win.getComputedStyle($badge[0], '::after').borderBottomWidth,
				'the stroke of the tick').to.not.equal('0px');
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
