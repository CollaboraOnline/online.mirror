/* global describe it cy beforeEach require expect */

const helper = require('../../common/helper');

describe(['tagdesktop'], 'Accessibility check deck', function() {

	beforeEach(function() {
		helper.setupAndLoadDocument('writer/sidebar.odt');
		cy.getFrameWindow().then(function(win) {
			this.win = win;
		}.bind(this));
	});

	function openDeck() {
		cy.getFrameWindow().then(function(win) {
			win.app.map.sendUnoCommand('.uno:SidebarDeck.A11yCheckDeck');
		});
		cy.cGet('#updateLinkButton').should('be.visible');
	}

	it('Update runs the check', function() {
		openDeck();
		cy.cGet('#updateLinkButton').click();
		helper.processToIdle(this.win);
		cy.cGet('#expand_document-label').should('exist');
		cy.cGet('#expand_other').should('exist');
	});

	it('Closing the deck together with Update', function() {
		// A kit that dies makes the server close the document with a close: message,
		// after which the document is loaded again in a new kit.
		const closeMessages = [];
		cy.getFrameWindow().then(function(win) {
			const onCloseMsg = win.app.socket._onCloseMsg.bind(win.app.socket);
			win.app.socket._onCloseMsg = function(textMsg) {
				closeMessages.push(textMsg);
				onCloseMsg(textMsg);
			};
		});

		// The deck toggle closes the sidebar from a posted event, and the Update click
		// right after it posts the check. Both leave in the same tick, so the kit
		// usually handles both before the close runs, and the check would then run on
		// the closed deck's panel. Repeat it, as the kit does not always take both
		// messages in one go.
		for (let i = 0; i < 10; i++) {
			openDeck();
			cy.getFrameWindow().then(function(win) {
				win.app.map.sendUnoCommand('.uno:SidebarDeck.A11yCheckDeck');
				win.document.getElementById('updateLinkButton').click();
			});
			helper.processToIdle(this.win);
			cy.cGet('#sidebar-dock-wrapper').should('not.be.visible');
		}

		// The kit is still alive, and the deck opens again and runs the check.
		openDeck();
		cy.cGet('#updateLinkButton').click();
		helper.processToIdle(this.win);
		cy.cGet('#expand_document-label').should('exist');
		cy.then(function() {
			expect(closeMessages, 'close messages').to.deep.equal([]);
		});
	});
});
