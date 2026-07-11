/* global describe it cy expect require */

var helper = require('../../common/helper');

describe(['tagdesktop'], 'Presentation Minimizer in a read-only view.', function () {

	function loadReadOnly() {
		var filePath = helper.setupDocument('impress/slide_navigation.odp');
		helper.loadDocument(filePath, true, undefined, undefined, 'permission=readonly');
		cy.cGet('#document-canvas').should('be.visible');
		cy.getFrameWindow().then(function (win) {
			helper.processToIdle(win);
		});
	}

	it('A read-only view reports the minimize command as unavailable', function () {
		loadReadOnly();

		cy.getFrameWindow().should(function (win) {
			expect(win.app.map['stateChangeHandler']
				.getItemValue('.uno:PresentationMinimizer')).to.equal('disabled');
		});
	});

	it('A read-only view keeps the presentation when the minimize command arrives', function () {
		loadReadOnly();

		// The wizard would replace the content of the presentation, so a
		// read-only view must not even reach it.
		cy.getFrameWindow().then(function (win) {
			win.app.map.sendUnoCommand('.uno:PresentationMinimizer');
			helper.processToIdle(win);
		});

		cy.cGet('.jsdialog-window').should('not.exist');
	});
});
