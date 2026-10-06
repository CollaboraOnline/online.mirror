/* global describe expect it cy before require Cypress */

const helper = require('../../common/helper');
const a11yHelper = require('../../common/a11y_helper');

describe(['tagdesktop'], 'Writer heading in a table cell', { testIsolation: false }, function () {
	let win;

	function move(keys) {
		helper.typeIntoDocument(keys);
		cy.then(function () {
			return a11yHelper.processToIdleWithA11yContext(win);
		});
	}

	function described() {
		return a11yHelper.getAXNodes().then(function (nodes) {
			return nodes.filter(function (node) {
				return !node.ignored && node.description;
			}).map(function (node) { return node.description; }).join(' | ');
		});
	}

	before(function () {
		helper.setupAndLoadDocument('writer/heading_in_cell.fodt');

		cy.getFrameWindow().then(function (frameWindow) {
			win = frameWindow;
		});

		cy.then(function () {
			win.app.map.setAccessibilityState(true);
			return a11yHelper.processToIdleWithA11yContext(win);
		});
	});

	it('the level of a heading in a cell is told with the cell and after it', function () {
		// The cell announcement lasts a second, which a slow run spends before it can read the tree.
		const toldOnEntering = [];
		let observer;
		cy.then(function () {
			const editable = win.document.getElementById('clipboard-area');
			observer = new win.MutationObserver(function () {
				toldOnEntering.push(editable.getAttribute('aria-description') || '');
			});
			observer.observe(editable, { attributes: true, attributeFilter: ['aria-description'] });
		});
		move('{ctrl}{home}{downarrow}');
		cy.cGet('#readable-content').should('have.text', 'Heading in a cell');

		cy.then(function () {
			observer.disconnect();
			const told = 'Heading level 2';
			const withCell = toldOnEntering.some(function (text) {
				return text.indexOf('Row 1') !== -1 && text.indexOf(told) !== -1;
			});
			expect(withCell, 'what the reader is told on entering the cell: ' + toldOnEntering.join(' / ')).to.equal(true);
			// Queued after the table announcement's own one second timer, so it runs after it.
			return new Cypress.Promise(function (resolve) { win.setTimeout(resolve, 1000); });
		});
		cy.then(described).then(function (text) {
			expect(text, 'what the reader is told once the cell is announced').to.contain('Heading level 2')
				.and.not.contain('Row 1');
		});
	});

	it('a plain cell next to it is not told a level', function () {
		move('{end}{rightarrow}');
		cy.cGet('#readable-content').should('have.text', 'Plain cell');

		cy.then(function () {
			return described().then(function (text) {
				expect(text, 'what the reader is told in the plain cell').to.not.contain('Heading level');
			});
		});
	});
});
