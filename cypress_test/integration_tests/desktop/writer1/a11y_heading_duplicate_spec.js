/* global describe expect it cy before require */

const helper = require('../../common/helper');
const a11yHelper = require('../../common/a11y_helper');

describe(['tagdesktop'], 'Writer headings that share their text', { testIsolation: false }, function () {
	let win;

	before(function () {
		helper.setupAndLoadDocument('writer/duplicate_headings.fodt');

		cy.getFrameWindow().then(function (frameWindow) {
			win = frameWindow;
		});

		cy.then(function () {
			win.app.map.setAccessibilityState(true);
			return a11yHelper.processToIdleWithA11yContext(win);
		});
	});

	it('activating the second of two unnumbered headings with the same text moves the caret to it', function () {
		helper.typeIntoDocument('{ctrl}{home}');
		cy.then(function () {
			return a11yHelper.processToIdleWithA11yContext(win);
		});
		cy.cGet('#readable-content').should('have.text', 'Top of the document.');

		cy.then(function () {
			const same = win.app.map._textInput._headings.filter(function (heading) {
				return heading.text === 'Notes';
			});
			expect(same.map(function (heading) { return heading.target; }), 'the targets of the two headings')
				.to.have.length(2).and.satisfy(function (targets) { return targets[0] === targets[1]; });
		});

		cy.cGet('#a11y-headings-below a').should('have.length', 2).last().click({ force: true });
		cy.then(function () {
			return a11yHelper.processToIdleWithA11yContext(win);
		});
		cy.cGet('#readable-content').should('have.text', 'Notes');
		cy.cGet('#a11y-context-after > span').first().should('have.text', 'Second notes.');
	});
});
