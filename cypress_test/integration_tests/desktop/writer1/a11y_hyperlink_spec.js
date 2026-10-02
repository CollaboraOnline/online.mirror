/* global describe expect it cy before require */

const helper = require('../../common/helper');
const a11yHelper = require('../../common/a11y_helper');

describe(['tagdesktop'], 'Writer hyperlinks for the reader', { testIsolation: false }, function () {
	let win;

	const PARAGRAPH = 'Visit the Collabora website for details.';
	const LINK_TEXT = 'the Collabora website';
	const LINK_URL = 'https://www.collaboraonline.com/';

	function links(selector) {
		return a11yHelper.getAXNodesWithin(selector || '#clipboard-area').then(function (nodes) {
			return nodes.filter(function (node) {
				return !node.ignored && node.role === 'link';
			});
		});
	}

	before(function () {
		helper.setupAndLoadDocument('writer/a11y_hyperlink.fodt');

		cy.getFrameWindow().then(function (frameWindow) {
			win = frameWindow;
		});

		cy.then(function () {
			win.app.map.setAccessibilityState(true);
			return helper.processToIdle(win);
		});

		helper.typeIntoDocument('{ctrl}{home}');
		cy.then(function () {
			return helper.processToIdle(win);
		});
	});

	it('a link of the paragraph is read as a link to its URL', function () {
		cy.then(function () {
			return links().then(function (nodes) {
				expect(nodes.map(function (node) { return node.name; }), 'the links')
					.to.deep.equal([LINK_TEXT]);
			});
		});
		// from the page: an older Chromium has no url in the accessibility tree
		cy.cGet('#clipboard-area a').should(function ($links) {
			expect($links.toArray().map(function (link) { return link.getAttribute('href'); }),
				'the link URL').to.deep.equal([LINK_URL]);
		});
	});

	it('the link leaves the plain text as it is', function () {
		cy.then(function () {
			expect(win.app.map._textInput.getPlainTextContent(), 'the editable text')
				.to.equal(PARAGRAPH);
		});
	});

	it('a click on the link does not follow it', function () {
		cy.cGet('#clipboard-area a').then(function ($link) {
			const event = new win.MouseEvent('click', { bubbles: true, cancelable: true });
			$link[0].dispatchEvent(event);
			expect(event.defaultPrevented, 'the click is cancelled').to.equal(true);
		});
	});

	it('a link of a paragraph around the caret is read as a link too', function () {
		cy.then(function () {
			return links('#a11y-context-after').then(function (nodes) {
				expect(nodes.length, 'the links after the caret').to.equal(2);
				expect(nodes[1].name, 'the second link').to.equal(LINK_TEXT);
			});
		});
		cy.cGet('#a11y-context-after a').should(function ($links) {
			expect($links.toArray().map(function (link) { return link.getAttribute('href'); }),
				'the link URLs after the caret')
				.to.deep.equal(['https://www.example.com/long', LINK_URL]);
		});
		cy.cGet('#a11y-context-after a').first().then(function ($link) {
			expect($link[0].tabIndex, 'no Tab stop').to.equal(-1);
			const event = new win.MouseEvent('click', { bubbles: true, cancelable: true });
			$link[0].dispatchEvent(event);
			expect(event.defaultPrevented, 'the click is cancelled').to.equal(true);
		});
		// and takes the caret to the paragraph of the link
		cy.cGet('#clipboard-area').should(function ($editable) {
			expect($editable.text(), 'the paragraph at the caret').to.contain('Long: a link text');
		});
	});

	it('a key on a focused link around the caret takes the caret to its paragraph', function () {
		helper.typeIntoDocument('{ctrl}{home}');
		cy.then(function () {
			return helper.processToIdle(win);
		});
		cy.cGet('#a11y-context-after a').first().then(function ($link) {
			// a reader leaving browse mode on the link need not move the selection there
			$link[0].focus();
			win.getSelection().removeAllRanges();
			$link[0].dispatchEvent(new win.KeyboardEvent('keydown',
				{ key: 'Enter', bubbles: true, cancelable: true }));
		});
		cy.cGet('#clipboard-area').should(function ($editable) {
			expect($editable.text(), 'the paragraph at the caret').to.contain('Long: a link text');
		});
	});

	it('typing in the link leaves the reader focused on the editable', function () {
		// a modifier holds for the rest of a type() call
		helper.typeIntoDocument('{ctrl}{home}');
		helper.typeIntoDocument('{rightarrow}'.repeat(10) + 'x');
		cy.then(function () {
			return helper.processToIdle(win);
		});
		cy.then(function () {
			return links().then(function (nodes) {
				expect(nodes.map(function (node) { return node.name; }), 'the links')
					.to.deep.equal(['the xCollabora website']);
			});
		});
		cy.then(function () {
			return a11yHelper.getFocusedAXNode().then(function (node) {
				expect(node, 'something holds the reader\'s focus').to.not.equal(null);
				expect(node.properties.editable, 'the reader is focused on the editable')
					.to.equal('richtext');
			});
		});
	});
});
