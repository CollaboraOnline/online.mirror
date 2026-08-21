/* global describe it cy beforeEach require */

const helper = require('../../common/helper');
const desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Notebookbar tests', function() {

	beforeEach(function() {
		helper.setupAndLoadDocument('draw/insert_position.fodg');
		desktopHelper.switchUIToNotebookbar();
		// Wide enough that the View tab does not push the zoom group into
		// its overflow menu.
		cy.viewport(1920, 1080);
	});

	it('The View tab Full Screen button toggles full screen', function() {
		// The browser only enters full screen on a real user gesture, which
		// Cypress cannot produce, so watch the call the button has to make.
		cy.getFrameWindow().then(function(win) {
			cy.stub(win.app.util, 'toggleFullScreen').as('toggleFullScreen');
		});

		// Clicking a tab that is already open collapses the strip, hiding the
		// icons we are after.
		cy.cGet('body').then(function($body) {
			if (!$body.find('#View-container:visible').length)
				cy.cGet('#View-tab-label').click();
		});
		cy.cGet('#View-container').should('be.visible');
		// The zoom overflow group renders a second, hidden copy of the button.
		cy.cGet('#View-container .unotoolbutton.unoFullScreen')
			.filter(':visible').click();

		cy.get('@toggleFullScreen').should('have.been.calledOnce');
	});
});
