/* global describe expect it cy before require */

const helper = require('../../common/helper');

const options = { testIsolation: false };

describe(['tagdesktop'], 'Writer link popup from the keyboard', options, function () {
	let win;
	const LINK_URL = 'https://www.collaboraonline.com/';

	const expectFocusOutsidePopup = function () {
		cy.cGet('#hyperlink-pop-up').should(function ($link) {
			const popup = $link[0].closest('.hyperlink-pop-up-container');
			expect(popup.contains(win.document.activeElement), 'the focus in the popup')
				.to.equal(false);
		});
	};

	before(function () {
		helper.setupAndLoadDocument('writer/a11y_hyperlink.fodt');

		cy.getFrameWindow().then(function (frameWindow) {
			win = frameWindow;
		});
	});

	it('F6 goes into the popup and on, and Escape back to the document', function () {
		// the caret into the link shows its popup
		helper.typeIntoDocument('{ctrl}{home}');
		helper.typeIntoDocument('{rightarrow}'.repeat(8));
		cy.cGet('#hyperlink-pop-up').should('be.visible');

		cy.realPress('F6');
		cy.cGet('#hyperlink-pop-up').should('have.focus').and('have.attr', 'href', LINK_URL);
		cy.cGet('#hyperlink-pop-up-copy').should('match', 'button')
			.and('have.attr', 'aria-label', 'Copy link location');
		cy.cGet('#hyperlink-pop-up-edit').should('match', 'button')
			.and('have.attr', 'aria-label', 'Edit link');
		cy.cGet('#hyperlink-pop-up-remove').should('match', 'button')
			.and('have.attr', 'aria-label', 'Remove link');
		// still the round icons, not styled as dialog buttons
		cy.cGet('#hyperlink-pop-up-edit').should('have.css', 'height', '26px')
			.and('have.css', 'width', '26px').and('have.css', 'border-top-style', 'none');

		cy.realPress('F6');
		expectFocusOutsidePopup();
		cy.realPress(['Shift', 'F6']);
		cy.cGet('#hyperlink-pop-up').should('have.focus');

		let paragraph;
		cy.then(function () {
			paragraph = win.document.getElementById('clipboard-area').textContent;
		});
		// Tab moves between the popup controls
		cy.realPress('Tab');
		cy.cGet('#hyperlink-pop-up-copy').should('have.focus');
		cy.realPress('Tab');
		cy.cGet('#hyperlink-pop-up-edit').should('have.focus');
		cy.realPress('Tab');
		cy.cGet('#hyperlink-pop-up-remove').should('have.focus');
		cy.realPress(['Shift', 'Tab']);
		cy.cGet('#hyperlink-pop-up-edit').should('have.focus');

		cy.realPress('Escape');
		cy.cGet('#clipboard-area').should('have.focus');
		cy.cGet('#clipboard-area').should(function ($area) {
			expect($area.text(), 'no Tab in the text').to.equal(paragraph);
		});
		cy.cGet('#hyperlink-pop-up').should('be.visible');
	});

	it('Enter on the link of the popup asks before it opens', function () {
		let location;
		cy.then(function () {
			location = win.location.href;
			win.__opened = [];
			win.open = function (url) { win.__opened.push(String(url)); return null; };
		});
		cy.realPress('F6');
		cy.cGet('#hyperlink-pop-up').should('have.focus');
		cy.realPress('Enter');
		cy.cGet('#modal-dialog-openlink').should('be.visible');
		cy.then(function () {
			expect(win.location.href, 'the page, not followed').to.equal(location);
			expect(win.__opened, 'nothing opened before the answer').to.deep.equal([]);
		});
		cy.cGet('#openlink-response-button').click();
		cy.then(function () {
			expect(win.__opened, 'the link opened').to.deep.equal([LINK_URL]);
		});
	});
});
