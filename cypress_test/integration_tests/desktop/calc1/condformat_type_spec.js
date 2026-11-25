/* global describe it cy beforeEach require expect */

const helper = require('../../common/helper');

// A rebuilt entry keeps the widget ids of the entry it replaces.
const typeBox = '#type-input';
function input(name) {
	return '#' + name + '-input';
}

describe(['tagdesktop'], 'Conditional format dialog type change', function() {
	beforeEach(function() {
		helper.setupAndLoadDocument('calc/cell_cursor.ods');
		cy.getFrameWindow().then(function(win) {
			this.win = win;
		}.bind(this));
		cy.getFrameWindow().then(function(win) {
			win.app.map.sendUnoCommand('.uno:ConditionalFormatDialog');
		});
		cy.cGet('#ConditionalFormatDialog').should('be.visible');
		cy.cGet(typeBox).should('have.value', '1');
	});

	it('Type change rebuilds the entry and keeps focus on the type box', function() {
		cy.cGet(typeBox).focus();
		cy.cGet(typeBox).select('2');
		helper.processToIdle(this.win);
		cy.cGet(input('formula')).should('be.visible');
		cy.cGet(typeBox).should('have.value', '2');
		cy.cGet(typeBox).should('have.focus');

		cy.cGet(typeBox).select('0');
		helper.processToIdle(this.win);
		cy.cGet(input('colorformat')).should('be.visible');
		cy.cGet(typeBox).should('have.value', '0');
		cy.cGet(typeBox).should('have.focus');

		cy.cGet(typeBox).select('3');
		helper.processToIdle(this.win);
		cy.cGet(input('datetype')).should('be.visible');
		cy.cGet(typeBox).should('have.value', '3');
		cy.cGet(typeBox).should('have.focus');
	});

	it('Two type changes sent together apply the last one', function() {
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

		function selectTogether(first, second) {
			cy.cGet(typeBox).then(function(items) {
				const box = items[0];
				box.value = first;
				box.dispatchEvent(new Event('change'));
				box.value = second;
				box.dispatchEvent(new Event('change'));
			});
		}

		// Both selections leave in the same tick, so the kit usually handles both before
		// the posted event of the first one runs. Repeat it, as the kit does not always
		// take both messages in one go.
		cy.cGet(typeBox).focus();
		for (let i = 0; i < 5; i++) {
			selectTogether('2', '3');
			helper.processToIdle(this.win);
			cy.cGet(input('datetype')).should('be.visible');
			cy.cGet(input('formula')).should('not.be.visible');
			cy.cGet(typeBox).should('have.value', '3');

			selectTogether('0', '1');
			helper.processToIdle(this.win);
			cy.cGet(input('datetype')).should('not.be.visible');
			cy.cGet(input('colorformat')).should('not.be.visible');
			cy.cGet(typeBox).should('have.value', '1');
		}

		cy.cGet('#cancel-button').click();
		cy.cGet('#ConditionalFormatDialog').should('not.exist');
		cy.then(function() {
			expect(closeMessages, 'close messages').to.deep.equal([]);
		});
	});
});
