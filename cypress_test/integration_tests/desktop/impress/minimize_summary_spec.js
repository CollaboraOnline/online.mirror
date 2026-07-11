/* global describe it cy beforeEach require */

var helper = require('../../common/helper');

describe(['tagdesktop'], 'Presentation Minimizer summary page.', function () {

	beforeEach(function () {
		// this presentation carries several images, so the summary page lists
		// the change that optimizes them
		helper.setupAndLoadDocument('impress/navigator.odp');
		cy.getFrameWindow().then(function (frameWindow) {
			this.win = frameWindow;
		});
	});

	function openSummaryPage(win) {
		cy.then(function () {
			win.app.map.sendUnoCommand('.uno:PresentationMinimizer');
		});
		cy.cGet('#STR_INTRODUCTION_T').should('be.visible');

		for (var i = 0; i < 4; i++) {
			cy.cGet('#next button').should('not.be.disabled').click();
			cy.then(function () { helper.processToIdle(win); });
		}
		cy.cGet('#STR_SUMMARY_TITLE').should('be.visible');
	}

	it('A cleared change stays cleared while the sizes are worked out again', function () {
		var win;
		cy.then(function () { win = this.win; });
		cy.then(function () { openSummaryPage(win); });

		// the change that optimizes the images starts included
		cy.cGet('#CHECK1').should('contain.text', 'images');
		cy.cGet('#CHECK1 input').should('be.checked');
		cy.cGet('#CURRENT_FILESIZE').should('contain.text', 'MB');
		cy.cGet('#ESTIMATED_FILESIZE').should('contain.text', 'MB');

		// Leaving the images out works the sizes out again. The choice
		// survives that, so the change can be put back.
		cy.cGet('#CHECK1 input').uncheck();
		cy.then(function () { helper.processToIdle(win); });
		cy.cGet('#CHECK1 input').should('not.be.checked');
		cy.cGet('#CHECK1').should('contain.text', 'images');
		cy.cGet('#ESTIMATED_FILESIZE').should('contain.text', 'MB');

		cy.cGet('#CHECK1 input').check();
		cy.then(function () { helper.processToIdle(win); });
		cy.cGet('#CHECK1 input').should('be.checked');
		cy.cGet('#ESTIMATED_FILESIZE').should('contain.text', 'MB');
	});
});
