/* global describe it cy require beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Comments panel', function() {

	beforeEach(function() {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.ensureSidebarHidden();
	});

	function selectedCommentId() {
		return cy.getFrameWindow().then(function(win) {
			var section = win.app.sectionContainer.getSectionWithName(
				win.app.CSections.CommentList.name);
			var selected = section.sectionProperties.selectedComment;
			return selected ? String(selected.sectionProperties.data.id) : null;
		});
	}

	const openCommentsTab = desktopHelper.openCommentsTab;

	function openFilters() {
		cy.cGet('.comments-panel-filters-summary').click();
		cy.cGet('.comments-panel-filters-body').should('be.visible');
	}

	function replyToFirstComment(text) {
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type(text);
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', text);
	}

	function resolveFirstComment() {
		desktopHelper.pickCommentAction(1, 'Resolve');
	}

	it('a comment of the document has a row of its own', function() {
		desktopHelper.insertComment('first comment');
		desktopHelper.insertComment('second comment');

		openCommentsTab();

		cy.cGet('.comments-panel-thread').should('have.length', 2);
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-comment-text').should('have.text', 'first comment');
		cy.cGet('.comments-panel-thread').eq(1)
			.find('.comments-panel-comment-text').should('have.text', 'second comment');
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-comment-author').should('not.have.text', '');
	});

	it('a comment longer than its row is read in full on request', function() {
		// A row gives a comment three lines, so this one has
		// words to spare.
		desktopHelper.insertComment('This comment carries far more words than the '
			+ 'three lines a row of the list has room for, so the list holds the '
			+ 'end of it back until the reader asks to see the whole of it.');

		openCommentsTab();

		cy.cGet('.comments-panel-comment-open').should('be.visible');
		cy.cGet('.comments-panel-comment-open').should('have.text', '...');
		cy.cGet('.comments-panel-comment-text').should('not.have.class', 'is-opened');

		cy.cGet('.comments-panel-comment-open').click();

		cy.cGet('.comments-panel-comment-text').should('have.class', 'is-opened');
		cy.cGet('.comments-panel-comment-open').should('have.text', 'Show less');

		cy.cGet('.comments-panel-comment-open').click();

		cy.cGet('.comments-panel-comment-text').should('not.have.class', 'is-opened');
	});

	it('a comment that fits in its row is shown whole', function() {
		desktopHelper.insertComment('a short comment');

		openCommentsTab();

		cy.cGet('.comments-panel-comment-text').should('have.text', 'a short comment');
		cy.cGet('.comments-panel-comment-open').should('not.be.visible');
	});

	it('a comment added while the tab is up shows up in it', function() {
		openCommentsTab();
		cy.cGet('.comments-panel-placeholder').should('be.visible');

		desktopHelper.insertComment('a fresh comment');

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment-text').should('have.text', 'a fresh comment');
		cy.cGet('.comments-panel-placeholder').should('not.be.visible');
	});

	it('picking a row takes the document to that comment', function() {
		desktopHelper.insertComment('the comment to reach');
		openCommentsTab();

		cy.cGet('.comments-panel-comment-button').click();

		cy.cGet('.comments-panel-comment').should('have.class', 'is-selected');
		selectedCommentId().then(function(id) {
			expect(id).to.equal('1');
		});
	});

	it('a thread says how many replies it holds', function() {
		desktopHelper.insertComment('a comment with an answer');
		replyToFirstComment('the answer');

		openCommentsTab();

		// The reply belongs to the thread of the comment it
		// answers, so the two make up one thread.
		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment-replies').should('have.text', '1 reply');
	});

	it('a reply is shown under the comment it answers', function() {
		desktopHelper.insertComment('a comment with an answer');
		replyToFirstComment('the answer');

		openCommentsTab();

		cy.cGet('.comments-panel-comment').should('have.length', 2);
		cy.cGet('.comments-panel-comment').eq(0)
			.should('have.class', 'is-first')
			.find('.comments-panel-comment-text')
			.should('have.text', 'a comment with an answer');
		cy.cGet('.comments-panel-comment').eq(1)
			.should('have.class', 'is-reply')
			.find('.comments-panel-comment-text')
			.should('have.text', 'the answer');

		// The reply is stepped in from the comment it answers.
		cy.cGet('.comments-panel-comment').eq(1)
			.should('have.css', 'margin-inline-start', '14px');
	});

	it('two comments of their own start two threads', function() {
		desktopHelper.insertComment('one comment');
		desktopHelper.insertComment('another comment');

		openCommentsTab();

		cy.cGet('.comments-panel-thread').should('have.length', 2);
		cy.cGet('.comments-panel-comment.is-reply').should('not.exist');
	});

	it('the search keeps the threads that hold the word', function() {
		desktopHelper.insertComment('a comment about apples');
		desktopHelper.insertComment('a comment about pears');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-search').type('pears');

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment-text').should('have.text', 'a comment about pears');
	});

	it('the search reaches the words of a reply', function() {
		desktopHelper.insertComment('a comment with an answer');
		replyToFirstComment('the answer mentions pears');
		desktopHelper.insertComment('a comment about apples');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-search').type('pears');

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment.is-first .comments-panel-comment-text')
			.should('have.text', 'a comment with an answer');
	});

	it('the status filter tells the resolved threads from the rest', function() {
		desktopHelper.insertComment('a comment to resolve');
		desktopHelper.insertComment('a comment to leave alone');
		resolveFirstComment();

		openCommentsTab();
		openFilters();

		cy.cGet('input[name="comments-panel-status"][value="unresolved"]').check();
		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment-text')
			.should('have.text', 'a comment to leave alone');

		cy.cGet('input[name="comments-panel-status"][value="resolved"]').check();
		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment-text')
			.should('have.text', 'a comment to resolve');

		cy.cGet('input[name="comments-panel-status"][value="all"]').check();
		cy.cGet('.comments-panel-thread').should('have.length', 2);
	});

	it('the replies filter keeps the threads somebody answered', function() {
		desktopHelper.insertComment('a comment with an answer');
		replyToFirstComment('the answer');
		desktopHelper.insertComment('a comment nobody answered');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-replies').check();

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment.is-first .comments-panel-comment-text')
			.should('have.text', 'a comment with an answer');
	});

	it('the author filter offers the authors of the comments', function() {
		desktopHelper.insertComment('a comment of mine');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-authors .comments-panel-filter-check')
			.should('have.length', 1);
		cy.cGet('.comments-panel-filter-authors input[type="checkbox"]').check();
		cy.cGet('.comments-panel-thread').should('have.length', 1);
	});

	it('the label counts the filters that are on, and Clear turns them off', function() {
		desktopHelper.insertComment('a comment about apples');
		desktopHelper.insertComment('a comment about pears');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-search').type('pears');
		cy.cGet('.comments-panel-filters-count').should('have.text', '1');

		cy.cGet('input[name="comments-panel-status"][value="resolved"]').check();
		cy.cGet('.comments-panel-filters-count').should('have.text', '2');
		// Neither thread is resolved, so the list says why it is
		// empty.
		cy.cGet('.comments-panel-thread').should('have.length', 0);
		cy.cGet('.comments-panel-placeholder')
			.should('be.visible')
			.should('have.text', 'No comment matches the filters.');

		cy.cGet('.comments-panel-filters-clear').click();

		cy.cGet('.comments-panel-filters-count').should('not.be.visible');
		cy.cGet('.comments-panel-thread').should('have.length', 2);
		cy.cGet('.comments-panel-filter-search').should('have.value', '');
	});

	it('the rows can be ordered by the date a thread was started', function() {
		desktopHelper.insertComment('the older comment');
		// The date is kept to the second, so the two must be
		// written in different seconds to be told apart.
		cy.wait(1100);
		desktopHelper.insertComment('the newer comment');

		openCommentsTab();

		// The document holds the comments in the order they sit
		// on the page.
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-comment-text').should('have.text', 'the older comment');

		cy.cGet('#comments-panel-sort-select').select('newest');
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-comment-text').should('have.text', 'the newer comment');
		cy.cGet('.comments-panel-thread').eq(1)
			.find('.comments-panel-comment-text').should('have.text', 'the older comment');

		cy.cGet('#comments-panel-sort-select').select('oldest');
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-comment-text').should('have.text', 'the older comment');
		cy.cGet('.comments-panel-thread').eq(1)
			.find('.comments-panel-comment-text').should('have.text', 'the newer comment');
	});

	it('the sort and the filters hold at the same time', function() {
		desktopHelper.insertComment('apples came first');
		cy.wait(1100);
		desktopHelper.insertComment('pears came second');
		cy.wait(1100);
		desktopHelper.insertComment('apples again, last');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-search').type('apples');
		cy.cGet('#comments-panel-sort-select').select('newest');

		cy.cGet('.comments-panel-thread').should('have.length', 2);
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-comment-text').should('have.text', 'apples again, last');
		cy.cGet('.comments-panel-thread').eq(1)
			.find('.comments-panel-comment-text').should('have.text', 'apples came first');
	});

	it('a row offers the actions the document has for the comment', function() {
		desktopHelper.insertComment('a comment to resolve from the list');

		openCommentsTab();

		cy.cGet('.comments-panel-comment-menu').click();
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Resolve').click();

		cy.cGet('.comments-panel-comment-resolved').should('exist');
	});

	it('a reply written from the list joins the thread', function() {
		desktopHelper.insertComment('a comment to answer from the list');

		openCommentsTab();

		cy.cGet('.comments-panel-comment-menu').click();
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Reply').click();
		cy.cGet('#annotation-reply-textarea-1').type('the answer from the list');
		cy.cGet('#annotation-reply-1').click();

		cy.cGet('.comments-panel-comment').should('have.length', 2);
		cy.cGet('.comments-panel-comment.is-reply .comments-panel-comment-text')
			.should('have.text', 'the answer from the list');
	});

	it('the box to answer a comment in sits in the comment\'s row', function() {
		desktopHelper.insertComment('a comment to answer');

		desktopHelper.pickCommentAction(1, 'Reply');

		cy.cGet('.comments-panel-comment[data-comment-id="1"] #annotation-reply-textarea-1')
			.should('be.visible');
		// Nothing of the comment comes up over the page to be
		// written in.
		cy.cGet('#comment-container-1').should('be.not.visible');
	});

	it('the box to edit a comment in holds the words of the comment', function() {
		desktopHelper.insertComment('a comment to edit');

		desktopHelper.pickCommentAction(1, 'Modify');

		cy.cGet('.comments-panel-comment[data-comment-id="1"] #annotation-modify-textarea-1')
			.should('be.visible')
			.should('have.text', 'a comment to edit');
		// The words are in the box being written in, so the row
		// does not show them twice over.
		cy.cGet('.comments-panel-comment[data-comment-id="1"]')
			.should('have.class', 'is-being-written')
			.find('.comments-panel-comment-text').should('not.exist');
	});

	it('the box goes away again once the answer is written', function() {
		desktopHelper.insertComment('a comment to answer');

		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('.comments-panel-comment[data-comment-id="1"] #annotation-reply-textarea-1')
			.should('be.visible')
			.type('the answer');
		cy.cGet('#annotation-reply-1').click();

		// The answer has a row of its own, and no row is left
		// with a box to write in.
		cy.cGet('.comments-panel-comment').should('have.length', 2);
		cy.cGet('.comments-panel-comment .cool-annotation-edit').should('not.exist');
		cy.cGet('.comments-panel-comment.is-being-written').should('not.exist');
	});

	it('a comment is written in a row of its own before it is in the document', function() {
		// Left unsaved, so the comment is still the one being
		// written.
		desktopHelper.insertComment('the words of a new comment', false);

		// The comments tab comes up by itself, because that is
		// where the words go.
		cy.cGet('#comments-dock-wrapper').should('be.visible');
		cy.cGet('.comments-panel-comment[data-comment-id="new"]')
			.should('have.class', 'is-being-written')
			.find('#annotation-modify-textarea-new')
			.should('be.visible')
			.should('have.text', 'the words of a new comment');
		// Nothing of the comment comes up over the page.
		cy.cGet('#comment-container-new').should('be.not.visible');
	});

	it('a comment written in the list joins the document when it is saved', function() {
		desktopHelper.insertComment('a comment written in the list');

		cy.cGet('.comments-panel-comment[data-comment-id="new"]').should('not.exist');
		cy.cGet('.comments-panel-comment[data-comment-id="1"] .comments-panel-comment-text')
			.should('have.text', 'a comment written in the list');
	});

	it('a comment given up on leaves no row behind', function() {
		desktopHelper.insertComment('a comment to give up on', false);
		cy.cGet('.comments-panel-comment[data-comment-id="new"]').should('exist');

		cy.cGet('#annotation-cancel-new').click();

		cy.cGet('.comments-panel-comment').should('not.exist');
		cy.cGet('.comments-panel-placeholder')
			.should('be.visible')
			.should('have.text', 'This document has no comments.');
	});

	it('a resolved thread is marked as resolved', function() {
		desktopHelper.insertComment('a comment to resolve');
		resolveFirstComment();

		openCommentsTab();

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-comment-resolved').should('exist');
	});

	it('picking a resolved comment leaves the resolved ones on show', function() {
		desktopHelper.insertComment('a comment to resolve');
		resolveFirstComment();

		openCommentsTab();

		function resolvedAreShown() {
			return cy.getFrameWindow().then(function(win) {
				const value = win.app.map.stateChangeHandler
					.getItemValue('.uno:ShowResolvedAnnotations');
				return value === true || value === 'true';
			});
		}

		resolvedAreShown().should('equal', true);

		// Picking the row twice used to turn the setting off and
		// then on again, which took the comment off the page.
		cy.cGet('.comments-panel-comment[data-comment-id="1"]').click();
		resolvedAreShown().should('equal', true);

		cy.cGet('.comments-panel-comment[data-comment-id="1"]').click();
		resolvedAreShown().should('equal', true);

		cy.cGet('#comment-container-1 .cool-annotation-img')
			.should('have.css', 'visibility', 'visible');
	});
});
