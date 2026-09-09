/* global describe it cy beforeEach require */

const helper = require('../../common/helper');
const desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Notebookbar tests', function() {

	beforeEach(function() {
		helper.setupAndLoadDocument('draw/navigator.odg');
		desktopHelper.switchUIToNotebookbar();
	});

	it('The folded zoom group lists its buttons while the page is full screen', function() {
		// Narrow enough that the View tab folds the zoom group into its
		// overflow menu, the layout a zoomed-in browser produces.
		cy.viewport(800, 1080);

		// Cypress cannot enter full screen, so report the page root as the
		// fullscreen element the way the browser does after View > Full Screen.
		cy.getFrameWindow().then(function(win) {
			Object.defineProperty(win.document, 'fullscreenElement', {
				configurable: true,
				get: function() { return win.document.documentElement; },
			});
		});

		desktopHelper.selectNotebookbarTab('View');
		// The button id carries a uniqueness suffix, so match on its prefix.
		cy.cGet('#View-container [id^="overflow-button-view-zoom"].menubutton')
			.should('be.visible')
			.find('.arrowbackground').click();

		// The menu holds the real Full Screen button moved over from the folded
		// group.
		cy.cGet('[id^="overflow-button-view-zoom-dropdown"] .unotoolbutton.unoFullScreen')
			.should('be.visible');
	});
});
