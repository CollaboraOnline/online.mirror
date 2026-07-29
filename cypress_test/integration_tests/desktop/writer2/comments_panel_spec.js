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

	function openCommentsTab() {
		cy.cGet('#navigator-floating-icon').click();
		cy.cGet('#tab-comments').click();
		cy.cGet('#comments-dock-wrapper').should('be.visible');
	}

	function openFilters() {
		cy.cGet('.comments-panel-filters-summary').click();
		cy.cGet('.comments-panel-filters-body').should('be.visible');
	}

	function replyToFirstComment(text) {
		cy.cGet('#comment-annotation-menu-1').click();
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Reply').click();
		cy.cGet('#annotation-reply-textarea-1').type(text);
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', text);
	}

	function resolveFirstComment() {
		cy.cGet('#comment-annotation-menu-1').click();
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Resolve').click();
	}

	it('a comment of the document has a row of its own', function() {
		desktopHelper.insertComment('first comment');
		desktopHelper.insertComment('second comment');

		openCommentsTab();

		cy.cGet('.comments-panel-thread').should('have.length', 2);
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-thread-text').should('have.text', 'first comment');
		cy.cGet('.comments-panel-thread').eq(1)
			.find('.comments-panel-thread-text').should('have.text', 'second comment');
		cy.cGet('.comments-panel-thread').eq(0)
			.find('.comments-panel-thread-author').should('not.have.text', '');
	});

	it('a comment added while the tab is up shows up in it', function() {
		openCommentsTab();
		cy.cGet('.comments-panel-placeholder').should('be.visible');

		desktopHelper.insertComment('a fresh comment');

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-thread-text').should('have.text', 'a fresh comment');
		cy.cGet('.comments-panel-placeholder').should('not.be.visible');
	});

	it('picking a row takes the document to that comment', function() {
		desktopHelper.insertComment('the comment to reach');
		openCommentsTab();

		cy.cGet('.comments-panel-thread-button').click();

		cy.cGet('.comments-panel-thread').should('have.class', 'is-selected');
		selectedCommentId().then(function(id) {
			expect(id).to.equal('1');
		});
	});

	it('a thread says how many replies it holds', function() {
		desktopHelper.insertComment('a comment with an answer');
		replyToFirstComment('the answer');

		openCommentsTab();

		// The reply belongs to the thread of the comment it
		// answers, so the list holds one row for both.
		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-thread-replies').should('have.text', '1 reply');
	});

	it('the search keeps the threads that hold the word', function() {
		desktopHelper.insertComment('a comment about apples');
		desktopHelper.insertComment('a comment about pears');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-search').type('pears');

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-thread-text').should('have.text', 'a comment about pears');
	});

	it('the search reaches the words of a reply', function() {
		desktopHelper.insertComment('a comment with an answer');
		replyToFirstComment('the answer mentions pears');
		desktopHelper.insertComment('a comment about apples');

		openCommentsTab();
		openFilters();

		cy.cGet('.comments-panel-filter-search').type('pears');

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-thread-text')
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
		cy.cGet('.comments-panel-thread-text')
			.should('have.text', 'a comment to leave alone');

		cy.cGet('input[name="comments-panel-status"][value="resolved"]').check();
		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-thread-text')
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
		cy.cGet('.comments-panel-thread-text')
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

	it('a resolved thread is marked as resolved', function() {
		desktopHelper.insertComment('a comment to resolve');
		resolveFirstComment();

		openCommentsTab();

		cy.cGet('.comments-panel-thread').should('have.length', 1);
		cy.cGet('.comments-panel-thread-resolved').should('exist');
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
