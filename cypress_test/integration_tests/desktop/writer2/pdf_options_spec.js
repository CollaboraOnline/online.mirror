/* -*- js-indent-level: 8 -*- */
/* global describe it cy require */

var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop', 'tagnextcloud', 'tagproxy'], 'PDF Options dialog', { testIsolation: false }, function() {

	desktopHelper.shareDocumentAcrossTests('writer/notebookbar.odt', {
		notebookbar: true,
		viewport: [1920, 1080],
	});

	function openSecurityTab() {
		cy.cGet('#File-tab-label').click();
		cy.cGet('#File-container .unodownloadas button').click();
		cy.cGet('.exportpdf-submenu-icon').click();

		cy.cGet('.ui-dialog #security').should('exist');
		cy.cGet('.ui-dialog .ui-tab').contains('Security').click();
		cy.cGet('#setpassword').should('be.visible');
	}

	// The core disables the Printing, Changes and Content groups by calling
	// set_sensitive() on their frames, and enables them again once a permission
	// password has been set - the options inside have to follow that state.
	it('permission options follow the permission password', function() {
		openSecurityTab();

		cy.cGet('#printnone-input').should('be.disabled');
		cy.cGet('#changenone-input').should('be.disabled');
		cy.cGet('#enablecopy-input').should('be.disabled');

		cy.cGet('#setpassword').click();

		// the permission password is the second group of the password dialog
		cy.cGet('#PasswordDialog').should('be.visible');
		cy.cGet('#pass2ed-input').type('secret');
		cy.cGet('#confirm2ed-input').type('secret');
		cy.cGet('#PasswordDialog #ok').click();
		cy.cGet('#PasswordDialog').should('not.exist');

		cy.cGet('#printnone-input').should('not.be.disabled');
		cy.cGet('#changenone-input').should('not.be.disabled');
		cy.cGet('#enablecopy-input').should('not.be.disabled');

		// and they can be used
		cy.cGet('#changeany-input').check();
		cy.cGet('#changeany-input').should('be.checked');

		cy.cGet('.ui-dialog-titlebar-close').click();
	});
});
