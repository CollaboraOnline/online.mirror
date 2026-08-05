/* global describe it cy beforeEach require */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagmultiuser'], 'Multiuser Annotation Tests', function () {

	beforeEach(function() {
		helper.setupAndLoadDocument('writer/annotation.odt',true);
		cy.viewport(2400,800);
		desktopHelper.switchUIToNotebookbar();
		cy.cSetActiveFrame('#iframe1');
		cy.cGet('#sidebar-dock-wrapper').should('be.visible');
		desktopHelper.sidebarToggle();
		desktopHelper.selectZoomLevel('50', false);
		cy.cSetActiveFrame('#iframe2');
		cy.cGet('#sidebar-dock-wrapper').should('be.visible');
		desktopHelper.sidebarToggle();
		desktopHelper.selectZoomLevel('50', false);
	});

	describe(['tagmultiuser'], 'Annotation Tests', function () {

	it('Insert', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');
	});

	it('Modify', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#annotation-save-1').click();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0, some other text');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0, some other text');
	});

	it('Reply', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain','some reply text');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('#annotation-content-area-2').should('contain','some reply text');
	});

	it('Remove', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('.cool-annotation-content > div').should('contain','some text');
		desktopHelper.pickCommentAction(1, 'Remove');
		cy.cGet('.cool-annotation-content-wrapper').should('not.exist');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('not.exist');
	});

	it('Only author sees Modify', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#comment-annotation-menu-edit-1').should('exist');
		desktopHelper.openCommentMenu(1);
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Modify').should('exist');
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Reply').should('exist');
		cy.cGet('body').type('{esc}');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#comment-annotation-menu-edit-1').should('not.exist');
		desktopHelper.openCommentMenu(1);
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Modify').should('not.exist');
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Reply').should('exist');
	});
	});

	describe(['tagmultiuser'], 'Annotation Autosave Tests', function() {

	it('Insert autosave', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
	});

	it('Insert autosave save', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-save-1').click();
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
	});

	it('Insert autosave cancel', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-cancel-1').click();
		cy.cGet('#comment-container-1').should('not.exist');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('not.exist');
		cy.cGet('#comment-container-1').should('not.exist');
	});

	it('Modify autosave', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0, some other text');
	});

	it('Modify autosave save', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-save-1').click();
		cy.cGet('#annotation-content-area-1').should('have.text','some text0, some other text');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0, some other text');
	});

	it('Modify autosave cancel', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-cancel-1').click();
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.not.visible');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
	});

	it('Reply autosave', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-2').should('have.text','some reply text');
	});

	it('Reply autosave save', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('have.text','some reply text');
		cy.cGet('#annotation-save-2').click();
		cy.cGet('#annotation-modify-textarea-2').should('be.not.visible');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('#annotation-content-area-2').should('have.text','some reply text');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-2').should('have.text','some reply text');
	});

	it('Reply autosave cancel', function() {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('have.text','some reply text');
		cy.cGet('#annotation-cancel-2').click();
		cy.cGet('#annotation-modify-textarea-2').should('not.exist');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('#annotation-content-area-2').should('not.exist');
		cy.cGet('#comment-container-1 .annotation-button-autosaved').should('not.exist');
		cy.cGet('#comment-container-1 .annotation-button-delete').should('not.exist');
		cy.cGet('#comment-container-2 .annotation-button-autosaved').should('not.exist');
		cy.cGet('#comment-container-2 .annotation-button-delete').should('not.exist');

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('#annotation-content-area-2').should('not.exist');
	});

	it('Reply autosave different author', function () {
		cy.cSetActiveFrame('#iframe1');
		desktopHelper.insertComment();

		cy.cSetActiveFrame('#iframe2');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text', 'some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');

		cy.cSetActiveFrame('#iframe1');
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-2').should('have.text', 'some reply text');
	});

	});
});
