/* global describe it cy require beforeEach expect */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');

describe(['tagdesktop'], 'Annotation Tests', function() {

	beforeEach(function() {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.sidebarToggle();
		desktopHelper.selectZoomLevel('50', false);
	});

	it('Insert', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');
	});

	it('Modify', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#annotation-save-1').click();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0, some other text');
	});

	it('Paste keeps no formatting', function() {
		desktopHelper.insertComment();

		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').should('exist');

		cy.getFrameWindow().then(function(win) {
			var editable = win.document.getElementById('annotation-modify-textarea-1');
			editable.focus();

			// put the caret after the existing text
			var range = win.document.createRange();
			range.selectNodeContents(editable);
			range.collapse(false);
			var selection = win.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);

			var clipboardData = new win.DataTransfer();
			clipboardData.setData('text/plain', ', bold text');
			clipboardData.setData('text/html', '<b>, bold text</b>');
			editable.dispatchEvent(new win.ClipboardEvent('paste', {
				clipboardData: clipboardData, bubbles: true, cancelable: true
			}));
		});

		cy.cGet('#annotation-modify-textarea-1').should('have.text', 'some text0, bold text');
		cy.cGet('#annotation-modify-textarea-1').find('b').should('not.exist');

		cy.cGet('#annotation-save-1').click();
		cy.cGet('#annotation-content-area-1').should('contain', 'some text0, bold text');
		cy.cGet('#annotation-content-area-1').find('b').should('not.exist');
	});

	it('Reply', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain','some reply text');
		// The comment that was answered still holds its own
		// words, and not the words of the answer.
		cy.getFrameWindow().then(function(win) {
			var section = win.app.sectionContainer.getSectionWithName(
				win.app.CSections.CommentList.name);
			var answered = section.getComment('1').sectionProperties.data;
			expect(answered.html).to.contain('some text0');
			expect(answered.html).to.not.contain('some reply text');
		});
	});

	it('Remove', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('.cool-annotation-content > div').should('contain','some text');
		desktopHelper.pickCommentAction(1, 'Remove');
		cy.cGet('.cool-annotation-content-wrapper').should('not.exist');
	});

	it('Click on comment emits Clicked_Comment postMessage', function() {
		desktopHelper.insertComment();

		// This will record usage of window.postMessage (called from
		// _postMessage in browser/src/map/handler/Map.WOPI.js
		cy.getFrameWindow().then(win => {
			cy.stub(win.parent, 'postMessage').as('postMessage');
		});

		// The bubble is what the page carries of the comment, so
		// that is what is picked.
		cy.cGet('#comment-container-1 .cool-annotation-img').click();

		cy.get('@postMessage').should(stub => {
			const found = stub.getCalls().some(call => {
				const msg = JSON.parse(call.args[0]);
				return msg.MessageId === 'Clicked_Comment'
					&& msg.Values && msg.Values.Id !== undefined;
			});
			expect(found, "Clicked_Comment was not posted").to.be.true;
		});
	});

	it('Insert emits Inserted_Comment postMessage of type annotation', function() {
		// Capture host messages before inserting so the notification is recorded.
		cy.getFrameWindow().then(win => {
			cy.stub(win.parent, 'postMessage').as('postMessage');
		});

		desktopHelper.insertComment();

		// The host is told a plain comment was inserted, with the engine id.
		cy.get('@postMessage').should(stub => {
			const found = stub.getCalls().some(call => {
				const msg = JSON.parse(call.args[0]);
				return msg.MessageId === 'Inserted_Comment'
					&& msg.Values && msg.Values.Id !== undefined
					&& msg.Values.Type === 'annotation'
					&& msg.Values.Parent === '0';
			});
			expect(found, "Inserted_Comment of type annotation was not posted").to.be.true;
		});
	});

	it('Reply emits Inserted_Comment postMessage of type reply', function() {
		desktopHelper.insertComment();
		cy.cGet('#annotation-content-area-1').should('contain', 'some text0');

		// Capture host messages before replying so the notification is recorded.
		cy.getFrameWindow().then(win => {
			cy.stub(win.parent, 'postMessage').as('postMessage');
		});

		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', 'some reply text');

		// A reply is reported as type reply and points at its parent.
		cy.get('@postMessage').should(stub => {
			const found = stub.getCalls().some(call => {
				const msg = JSON.parse(call.args[0]);
				return msg.MessageId === 'Inserted_Comment'
					&& msg.Values && msg.Values.Id !== undefined
					&& msg.Values.Type === 'reply'
					&& msg.Values.Parent !== '0';
			});
			expect(found, "Inserted_Comment of type reply was not posted").to.be.true;
		});
	});

	it('Action_ResolveComment postMessage resolves a comment', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('.cool-annotation-content-resolved').should('have.text', '');

		// Send Action_ResolveComment postMessage with the comment's Id
		cy.getFrameWindow().then(win => {
			const message = {
				'MessageId': 'Action_ResolveComment',
				'Values': {'Id': '1'}
			};
			win.postMessage(JSON.stringify(message), '*');
		});

		// The comment should now show as resolved
		cy.cGet('.cool-annotation-content-resolved').should('have.text', 'Resolved');
	});

	it('Toggle Resolved/Unresolved', function() {
		desktopHelper.insertComment("unresolved comment", true);
		cy.cGet('#comment-container-1').should('exist');
		/*
			after the last `insertComment` call the insert tab is selected.
			if we don't change the tab and call `insertComment` again, then
			it will collapse the notebookbar (clicking on the same tab twice).
			to avoid the 'collapsed notebookbar' state, we click on the home
			tab to 'reset' the state for the next `insertComment` call.
		*/
		cy.cGet('#Home-tab-label').click();

		desktopHelper.insertComment("resolved comment", true);
		cy.cGet('body').type('focus out of comments');
		cy.cGet('#comment-container-2').should('exist');
		desktopHelper.pickCommentAction(2, 'Resolve');
		cy.cGet('.cool-annotation-content-resolved').should('exist');

		// All the page shows of a comment is its bubble, so that
		// is what says whether the comment is on show at all.
		function bubbleOf(id) {
			return cy.cGet('#comment-container-' + id + ' .cool-annotation-img');
		}

		/* scenario 1:
		 *   - hide all comments -> both hidden, and the resolved choice goes off
		 *                          with them
		 *   - show all comments -> only the unresolved comment comes back
		 */
		desktopHelper.toggleComments();
		bubbleOf(1).should('have.css', 'visibility', 'hidden');
		bubbleOf(2).should('have.css', 'visibility', 'hidden');
		desktopHelper.toggleComments();
		bubbleOf(1).should('have.css', 'visibility', 'visible');
		bubbleOf(2).should('have.css', 'visibility', 'hidden');

		/* scenario 2:
		 *   - show resolved comments -> both visible
		 */
		desktopHelper.toggleComments(/*resolved = */ true);
		bubbleOf(1).should('have.css', 'visibility', 'visible');
		bubbleOf(2).should('have.css', 'visibility', 'visible');

		/* scenario 3:
		 *   - hide all comments      -> both hidden
		 *   - show resolved comments -> the comments come back on with them, so
		 *                              both are visible
		 */
		desktopHelper.toggleComments();
		bubbleOf(1).should('have.css', 'visibility', 'hidden');
		bubbleOf(2).should('have.css', 'visibility', 'hidden');
		desktopHelper.toggleComments(/*resolved = */ true);
		bubbleOf(1).should('have.css', 'visibility', 'visible');
		bubbleOf(2).should('have.css', 'visibility', 'visible');
	});

	it('The page shows a comment as a bubble and nothing more', function() {
		desktopHelper.insertComment('a comment to find behind its bubble');

		// The box of the comment stays down. The bubble drawn
		// out of it is what the page carries.
		cy.cGet('#comment-container-1').should('be.not.visible');
		cy.cGet('#comment-container-1 .cool-annotation-img')
			.should('have.css', 'visibility', 'visible');
	});

	it('Picking a bubble brings its comment up in the comments tab', function() {
		desktopHelper.insertComment('a comment to reach from its bubble');

		cy.cGet('#comment-container-1 .cool-annotation-img').click();

		// The tab comes up by itself with the comment's row
		// marked, and the box of the comment is still down.
		cy.cGet('#comments-dock-wrapper').should('be.visible');
		cy.cGet('.comments-panel-comment[data-comment-id="1"]')
			.should('have.class', 'is-selected')
			.find('.comments-panel-comment-text')
			.should('have.text', 'a comment to reach from its bubble');
		cy.cGet('#comment-container-1').should('be.not.visible');
	});

	it('The bubble of a comment stays on show through a change of zoom', function() {
		desktopHelper.selectZoomLevel('100', false);
		desktopHelper.insertComment('test comment', true);

		for (const level of ['120', '150', '100']) {
			desktopHelper.selectZoomLevel(level, false);
			cy.cGet('#comment-container-1 .cool-annotation-img')
				.should('have.css', 'visibility', 'visible');
		}
	});

	it('The bubble of a comment stays on show while the window is resized', function() {
		desktopHelper.insertComment('test comment', true);
		desktopHelper.selectZoomLevel('120', false);

		// Down to a window narrower than a comment, twenty
		// pixels at a time then one at a time, and back up.
		for (let width = 1420; width > 1260; width -= 20) {
			cy.viewport(width, 600);
			cy.cGet('#comment-container-1 .cool-annotation-img')
				.should('have.css', 'visibility', 'visible');
		}

		for (let width = 1280; width < 1420; width += 20) {
			cy.viewport(width, 600);
			cy.cGet('#comment-container-1 .cool-annotation-img')
				.should('have.css', 'visibility', 'visible');
		}
	});

	it('Tab Navigation', function() {
		desktopHelper.insertComment(undefined, false);

		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');
		cy.realPress('Tab');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');
		cy.cGet('#annotation-cancel-new:focus-visible');

		cy.realPress('Tab');
		cy.cGet('#annotation-save-new:focus-visible');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');

		// Tab past the last button cycles back to the text area instead of
		// leaving the comment popup.
		cy.realPress('Tab');
		cy.cGet('#annotation-modify-textarea-new:focus-visible');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');

		// Shift+Tab cycles backward the same way.
		cy.realPress(['Shift', 'Tab']);
		cy.cGet('#annotation-save-new:focus-visible');
	});

	it('Global opreations without doc focused', function () {
		cy.getFrameWindow().then(function (win) {
			cy.spy(win.app.socket, 'sendMessage').as('sendMessage');
		});
		cy.getFrameWindow().then(function (win) {
			cy.stub(win, 'open').as('windowOpen');
		});

		desktopHelper.insertComment();

		// Take the focus off the document by picking the bubble
		// of the comment.
		cy.cGet('#comment-container-1 .cool-annotation-img').click();

		cy.getFrameWindow().then(function(win) {
			win.document.dispatchEvent(new win.KeyboardEvent('keydown', {
				key: 'p', code: 'KeyP', keyCode: 80,
				ctrlKey: true, bubbles: true, cancelable: true
			}));
		});


		const downloadAsMessage = 'downloadas ' +
			'name=print.pdf ' +
			'id=print ' +
			'format=pdf ' +
			'options={\"ExportFormFields\":{\"type\":\"boolean\",\"value\":\"false\"},' +
			'\"ExportNotes\":{\"type\":\"boolean\",\"value\":\"false\"}}';
		cy.get('@sendMessage').should('have.been.calledWith', downloadAsMessage);
		cy.get('@windowOpen').should('be.called');
	});

	it('Action_GoToComment postMessage navigates to a comment', function() {
		// Type identifiable text on the first line where the comment will be.
		helper.typeIntoDocument('COMMENT_ANCHOR_LINE');

		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain', 'some text0');

		// Type lots of paragraph breaks so the document scrolls well past the comment.
		helper.typeIntoDocument('{ctrl}{end}');
		helper.typeIntoDocument('{enter}'.repeat(80) + 'BOTTOM_OF_DOCUMENT');

		// The bubble of the comment should now be scrolled out
		// of view.
		cy.cGet('#comment-container-1 .cool-annotation-img').should('not.be.visible');

		// Stub postMessage to capture the response.
		cy.getFrameWindow().then(win => {
			cy.stub(win.parent, 'postMessage').as('postMessage');
		});

		// Send Action_GoToComment postMessage with the comment's Id.
		cy.getFrameWindow().then(win => {
			var message = {
				'MessageId': 'Action_GoToComment',
				'Values': { 'Id': '1' }
			};
			win.postMessage(JSON.stringify(message), '*');
		});

		// Verify the response postMessage was sent with success and no error.
		cy.get('@postMessage').should(stub => {
			var calls = stub.getCalls().filter(call => {
				try {
					var msg = typeof call.args[0] === 'string' ? JSON.parse(call.args[0]) : call.args[0];
					return msg.MessageId === 'Action_GoToComment_Resp';
				} catch (e) { return false; }
			});
			expect(calls.length, 'Action_GoToComment_Resp was not posted').to.be.greaterThan(0);
			var resp = typeof calls[0].args[0] === 'string' ? JSON.parse(calls[0].args[0]) : calls[0].args[0];
			expect(resp.Values.success, 'Action_GoToComment_Resp reported error: ' + resp.Values.errorMsg).to.be.true;
			expect(resp.Values.Id).to.equal('1');
		});

		// After GoToComment, the bubble of the comment should be
		// scrolled back into view.
		cy.cGet('#comment-container-1 .cool-annotation-img').should('be.visible');
		// The cursor should be at the end of the first paragraph (the comment anchor).
		// #clipboard-area has a copy of current cursor's node text (including anchor character):
		cy.cGet('#clipboard-area').should('have.prop', 'textContent', 'COMMENT_ANCHOR_LINE\uFFFC');
		cy.getFrameWindow().then(win => {
			var textInput = win.app.map._textInput;
			expect(textInput._lastSelectionStart).to.equal(20);
			expect(textInput._lastSelectionEnd).to.equal(20);
		});
	});

	it('Drag inside commented region forwards mouse events to core', function() {
		// A Writer comment overlays the commented passage with a
		// CommentSection that used to swallow mouse events. That blocked
		// users from starting a text selection by mouse-dragging from
		// inside the highlighted passage - core never saw the drag.
		// CommentSection now delegates onMouseDown/Move/Up to MouseControl
		// when a drag is active; this test exercises that path.

		// 50% zoom (set in beforeEach) makes the highlight too small for a
		// reliable drag, so switch to 100%.
		desktopHelper.selectZoomLevel('100', false);
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		// Lay down a passage and select a slice of it so the comment is
		// anchored to a real range and ends up with a meaningful
		// highlight rectangle to drag inside.
		helper.typeIntoDocument('Hello world from this test document for drag testing.{enter}');
		helper.typeIntoDocument('{ctrl}{home}');
		for (var i = 0; i < 17; ++i)
			helper.typeIntoDocument('{shift}{rightArrow}');
		helper.textSelectionShouldExist();

		desktopHelper.insertComment('drag-test', true);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');

		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		// Spy on MouseControl - if the new delegation works, the drag we
		// dispatch below must reach these methods.
		cy.getFrameWindow().then(function(win) {
			cy.spy(win.app.activeDocument.mouseControl, 'onMouseDown').as('mcDown');
			cy.spy(win.app.activeDocument.mouseControl, 'onMouseMove').as('mcMove');
			cy.spy(win.app.activeDocument.mouseControl, 'onMouseUp').as('mcUp');
		});

		cy.getFrameWindow().then(function(win) {
			var commentList = win.app.sectionContainer.getSectionWithName(
				win.app.CSections.CommentList.name);
			var comment = commentList.sectionProperties.commentList[0];
			expect(comment, 'comment must exist').to.exist;
			expect(comment.sectionProperties.data.rectangles,
				'comment must own a highlight rectangle').to.exist;
			var rects = comment.sectionProperties.data.rectangles;
			expect(rects.length, 'at least one rectangle').to.be.greaterThan(0);
			var rect = rects[0];

			var canvas = win.document.getElementById('document-canvas');
			var bounds = canvas.getBoundingClientRect();

			// v1X/v1Y are view pixels inside the canvas (viewport offset
			// baked in); /dpiScale -> CSS pixels.
			var cssCenterX = ((rect.v1X + rect.v2X) / 2) / win.app.dpiScale;
			var cssCenterY = ((rect.v1Y + rect.v4Y) / 2) / win.app.dpiScale;
			var startX = bounds.left + cssCenterX - 10;
			var startY = bounds.top + cssCenterY;
			var endX = startX + 30;
			var endY = startY;

			// mouseenter primes mouseIsInside; the container's mousedown
			// short-circuits otherwise.
			canvas.dispatchEvent(new win.MouseEvent('mouseenter', {
				clientX: startX, clientY: startY, button: 0, bubbles: true,
			}));
			canvas.dispatchEvent(new win.MouseEvent('mousedown', {
				clientX: startX, clientY: startY, button: 0, bubbles: true,
			}));
			// mousemove and mouseup are wired on document, not canvas.
			win.document.dispatchEvent(new win.MouseEvent('mousemove', {
				clientX: endX, clientY: endY, button: 0, buttons: 1, bubbles: true,
			}));
			win.document.dispatchEvent(new win.MouseEvent('mouseup', {
				clientX: endX, clientY: endY, button: 0, bubbles: true,
			}));
		});

		// Each phase must have flowed through MouseControl. Without the
		// CommentSection delegation, the spies stay silent because the
		// section consumed the events.
		cy.get('@mcDown').should('have.been.called');
		cy.get('@mcMove').should('have.been.called');
		cy.get('@mcUp').should('have.been.called');

		// And core must have responded with a real text selection.
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});
		helper.textSelectionShouldExist();
	});

	it('Right-click inside commented region opens the context menu', function() {
		// A Writer comment overlays the commented passage with a
		// CommentSection. A right-click there must be forwarded to
		// MouseControl so core produces the document context menu, instead
		// of the section swallowing the event. This exercises
		// Comment.onContextMenu's delegation to MouseControl.onContextMenu.

		// 50% zoom (set in beforeEach) makes the highlight too small for a
		// reliable click, so switch to 100%.
		desktopHelper.selectZoomLevel('100', false);
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		// Lay down a passage and select a word so the comment anchors to a
		// real range with a usable highlight rectangle.
		helper.typeIntoDocument('Hello world from this test document.{enter}');
		helper.typeIntoDocument('{ctrl}{home}');
		for (var i = 0; i < 5; ++i)
			helper.typeIntoDocument('{shift}{rightArrow}');
		helper.textSelectionShouldExist();

		desktopHelper.insertComment('context-menu-test', true);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');

		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		// Spy on MouseControl - the right-click must be delegated here.
		cy.getFrameWindow().then(function(win) {
			cy.spy(win.app.activeDocument.mouseControl, 'onContextMenu').as('mcContext');
		});

		cy.getFrameWindow().then(function(win) {
			var commentList = win.app.sectionContainer.getSectionWithName(
				win.app.CSections.CommentList.name);
			var comment = commentList.sectionProperties.commentList[0];
			expect(comment, 'comment must exist').to.exist;
			expect(comment.sectionProperties.data.rectangles,
				'comment must own a highlight rectangle').to.exist;
			var rects = comment.sectionProperties.data.rectangles;
			expect(rects.length, 'at least one rectangle').to.be.greaterThan(0);
			var rect = rects[0];

			var canvas = win.document.getElementById('document-canvas');
			var bounds = canvas.getBoundingClientRect();

			// v1X/v1Y are view pixels inside the canvas (viewport offset
			// baked in); /dpiScale -> CSS pixels.
			var cssCenterX = ((rect.v1X + rect.v2X) / 2) / win.app.dpiScale;
			var cssCenterY = ((rect.v1Y + rect.v4Y) / 2) / win.app.dpiScale;
			var clientX = bounds.left + cssCenterX;
			var clientY = bounds.top + cssCenterY;

			// First a plain click on the commented word, so the mouse
			// cursor is placed inside the highlight before we right-click.
			// mouseenter primes mouseIsInside; the container's mousedown
			// short-circuits otherwise.
			canvas.dispatchEvent(new win.MouseEvent('mouseenter', {
				clientX: clientX, clientY: clientY, button: 0, bubbles: true,
			}));
			canvas.dispatchEvent(new win.MouseEvent('mousedown', {
				clientX: clientX, clientY: clientY, button: 0, bubbles: true,
			}));
			win.document.dispatchEvent(new win.MouseEvent('mouseup', {
				clientX: clientX, clientY: clientY, button: 0, bubbles: true,
			}));

			// Now right-click the same spot. The canvas oncontextmenu
			// handler routes this to the CommentSection.
			canvas.dispatchEvent(new win.MouseEvent('contextmenu', {
				clientX: clientX, clientY: clientY, button: 2, bubbles: true,
				cancelable: true,
			}));
		});

		// The right-click must have flowed through MouseControl. Without
		// the CommentSection delegation, the spy stays silent because the
		// section consumed the event.
		cy.get('@mcContext').should('have.been.called');

		// And core must have produced the document context menu.
		cy.cGet('#jsd-context-menu-dropdown-overlay').should('be.visible');
	});

    it('Hover inside commented region forwards mouse move to core', function() {
		// A Writer comment overlays the commented passage with a
		// CommentSection. It used to forward mouse moves to MouseControl
		// only while a drag was active, so a plain hover over the
		// highlighted passage never reached core. That meant core never
		// requested a tooltip there - e.g. a tracked change that is also
		// covered by a comment showed no track-change info popup.
		// CommentSection now forwards hover moves too; this test exercises
		// that path.

		// 50% zoom (set in beforeEach) makes the highlight too small for a
		// reliable hover target, so switch to 100%.
		desktopHelper.selectZoomLevel('100', false);
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		// Lay down a passage and select a slice of it so the comment is
		// anchored to a real range with a meaningful highlight rectangle.
		helper.typeIntoDocument('Hello world from this test document for hover testing.{enter}');
		helper.typeIntoDocument('{ctrl}{home}');
		for (var i = 0; i < 17; ++i)
			helper.typeIntoDocument('{shift}{rightArrow}');
		helper.textSelectionShouldExist();

		desktopHelper.insertComment('hover-test', true);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');

		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		// Spy on MouseControl - if the new hover forwarding works, the plain
		// mouse move we dispatch below must reach onMouseMove.
		cy.getFrameWindow().then(function(win) {
			cy.spy(win.app.activeDocument.mouseControl, 'onMouseMove').as('mcMove');
		});

		cy.getFrameWindow().then(function(win) {
			var commentList = win.app.sectionContainer.getSectionWithName(
				win.app.CSections.CommentList.name);
			var comment = commentList.sectionProperties.commentList[0];
			expect(comment, 'comment must exist').to.exist;
			expect(comment.sectionProperties.data.rectangles,
				'comment must own a highlight rectangle').to.exist;
			var rects = comment.sectionProperties.data.rectangles;
			expect(rects.length, 'at least one rectangle').to.be.greaterThan(0);
			var rect = rects[0];

			var canvas = win.document.getElementById('document-canvas');
			var bounds = canvas.getBoundingClientRect();

			// v1X/v1Y are view pixels inside the canvas (viewport offset
			// baked in); /dpiScale -> CSS pixels.
			var cssCenterX = ((rect.v1X + rect.v2X) / 2) / win.app.dpiScale;
			var cssCenterY = ((rect.v1Y + rect.v4Y) / 2) / win.app.dpiScale;
			var hoverX = bounds.left + cssCenterX;
			var hoverY = bounds.top + cssCenterY;

			// A plain hover: no button pressed, no preceding mousedown.
			// Prime mouseIsInside on the section container, otherwise its
			// onMouseMove early-exits before reaching any section.
			var enterEvent = new win.MouseEvent('mouseenter', {
				clientX: hoverX, clientY: hoverY, button: 0, bubbles: true,
			});
			canvas.dispatchEvent(enterEvent);
			win.app.sectionContainer.onMouseEnter(enterEvent);
			win.document.dispatchEvent(new win.MouseEvent('mousemove', {
				clientX: hoverX, clientY: hoverY, button: 0, buttons: 0, bubbles: true,
			}));
		});

		// The hover must have flowed through MouseControl. Without the
		// CommentSection hover forwarding, the spy stays silent because the
		// section consumed the event while no drag was active.
		cy.get('@mcMove').should('have.been.called');
	});

	it('Action_GoToComment postMessage returns error for invalid comment', function() {
		// Stub postMessage to capture the response.
		cy.getFrameWindow().then(win => {
			cy.stub(win.parent, 'postMessage').as('postMessage');
		});

		// Send Action_GoToComment with a non-existent comment Id.
		cy.getFrameWindow().then(win => {
			var message = {
				'MessageId': 'Action_GoToComment',
				'Values': { 'Id': '999' }
			};
			win.postMessage(JSON.stringify(message), '*');
		});

		// Verify error response was sent.
		cy.get('@postMessage').should(stub => {
			var found = stub.getCalls().some(call => {
				try {
					var msg = typeof call.args[0] === 'string' ? JSON.parse(call.args[0]) : call.args[0];
					return msg.MessageId === 'Action_GoToComment_Resp'
						&& msg.Values && msg.Values.success === false
						&& msg.Values.Id === '999';
				} catch (e) { return false; }
			});
			expect(found, 'Action_GoToComment_Resp with failure was not posted').to.be.true;
		});
	});

	it('Get_Comments postMessage returns all comments', function() {
		desktopHelper.insertComment('first comment');
		cy.cGet('#annotation-content-area-1').should('contain', 'first comment');

		// Avoid notebookbar collapse before the second insertComment.
		cy.cGet('#Home-tab-label').click();
		helper.typeIntoDocument('{end}{enter}');

		desktopHelper.insertComment('second comment');
		cy.cGet('#annotation-content-area-2').should('contain', 'second comment');

		// Stub postMessage to capture the response.
		cy.getFrameWindow().then(win => {
			cy.stub(win.parent, 'postMessage').as('postMessage');
		});

		// Send Get_Comments postMessage.
		cy.getFrameWindow().then(win => {
			const message = { 'MessageId': 'Get_Comments' };
			win.postMessage(JSON.stringify(message), '*');
		});

		// Verify the response contains both comments.
		cy.get('@postMessage').should(stub => {
			const calls = stub.getCalls().filter(call => {
				try {
					const msg = typeof call.args[0] === 'string' ? JSON.parse(call.args[0]) : call.args[0];
					return msg.MessageId === 'Get_Comments_Resp';
				} catch (e) { return false; }
			});
			expect(calls.length, 'Get_Comments_Resp was not posted').to.be.greaterThan(0);
			const resp = typeof calls[0].args[0] === 'string' ? JSON.parse(calls[0].args[0]) : calls[0].args[0];
			const comments = resp.Values.Comments;
			expect(comments.length).to.equal(2);
			expect(comments[0].Id).to.equal('1');
			expect(comments[0].Text).to.equal('first comment');
			expect(comments[0]).to.have.property('Author');
			expect(comments[0]).to.have.property('DateTime');
			expect(comments[0].Resolved).to.equal('false');
			expect(comments[0].Parent).to.equal('0');
			expect(comments[1].Id).to.equal('2');
			expect(comments[1].Text).to.equal('second comment');
		});
	});

	it('Reply focuses the reply textbox', function () {
		desktopHelper.insertComment();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').should('have.focus');
	});

	it('Modify focuses the modify textbox', function () {
		desktopHelper.insertComment();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').should('have.focus');
	});

	it('Resolve/Unresolve Thread on partially resolved thread', function () {
		desktopHelper.insertComment();
		cy.cGet('#comment-container-1').should('exist');

		// Reply to create a thread (root id 1, reply id 2).
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('reply text');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', 'reply text');

		// Resolve only the reply, leaving the root unresolved.
		desktopHelper.pickCommentAction(2, 'Resolve');
		cy.cGet('#comment-container-2 .cool-annotation-content-resolved').should('have.text', 'Resolved');
		cy.cGet('#comment-container-1 .cool-annotation-content-resolved').should('have.text', '');

		// Root menu must offer 'Resolve Thread' since the thread is not fully resolved.
		desktopHelper.openCommentMenu(1);
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Resolve Thread').should('be.visible');
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Unresolve Thread').should('not.exist');
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Resolve Thread').click();

		// All comments in the thread are now resolved.
		cy.cGet('#comment-container-1 .cool-annotation-content-resolved').should('have.text', 'Resolved');
		cy.cGet('#comment-container-2 .cool-annotation-content-resolved').should('have.text', 'Resolved');

		// Root menu now offers 'Unresolve Thread'.
		desktopHelper.openCommentMenu(1);
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Unresolve Thread').should('be.visible');
		cy.cGet('body').contains('.ui-combobox-entry.jsdialog.ui-grid-cell', 'Unresolve Thread').click();

		// All comments in the thread are unresolved again.
		cy.cGet('#comment-container-1 .cool-annotation-content-resolved').should('have.text', '');
		cy.cGet('#comment-container-2 .cool-annotation-content-resolved').should('have.text', '');
	});

	it('A pasted reply still answers the comment it was written under', function() {
		desktopHelper.selectZoomLevel('100', false);
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		helper.typeIntoDocument('Hello');
		helper.typeIntoDocument('{home}');
		for (var i = 0; i < 5; i++)
			helper.typeIntoDocument('{shift}{rightArrow}');
		helper.textSelectionShouldExist();

		desktopHelper.insertComment('root comment');
		cy.cGet('#annotation-content-area-1').should('contain', 'root comment');

		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('reply text');
		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain', 'reply text');

		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		helper.typeIntoDocument('{home}');
		helper.typeIntoDocument('{shift}{end}');

		cy.getFrameWindow().then(function(win) {
			win.app.socket.sendMessage('uno .uno:Copy');
		});
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		helper.typeIntoDocument('{end}{enter}');

		cy.getFrameWindow().then(function(win) {
			win.app.socket.sendMessage('uno .uno:Paste');
		});
		cy.getFrameWindow().then(function(win) {
			return helper.processToIdle(win);
		});

		cy.cGet('.cool-annotation-content-wrapper').should('have.length', 4);

		// The pasted reply still answers its comment, so the
		// four make two threads of two, not four of one.
		desktopHelper.openCommentsTab();
		cy.cGet('.comments-panel-thread').should('have.length', 2);
		cy.cGet('.comments-panel-comment.is-reply').should('have.length', 2);
		cy.cGet('.comments-panel-thread').each(function($thread) {
			cy.wrap($thread).find('.comments-panel-comment.is-first')
				.find('.comments-panel-comment-text').should('have.text', 'root comment');
			cy.wrap($thread).find('.comments-panel-comment.is-reply')
				.find('.comments-panel-comment-text').should('have.text', 'reply text');
		});
	});
});

describe(['tagdesktop'], 'Annotation autosave and the bubble', function() {
	var newFilePath;

	beforeEach(function() {
		newFilePath = helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.sidebarToggle();
	});

	it('Autosave Collapse', function() {
		desktopHelper.selectZoomLevel('100', false);
		helper.typeIntoDocument('placeholder text');
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		helper.typeIntoDocument('{home}');
		cy.cGet('.cool-annotation-info-collapsed').should('have.text','!');
		cy.cGet('.cool-annotation-info-collapsed').should('be.not.visible');
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-save-1').click();
		helper.typeIntoDocument('{home}');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');
		cy.cGet('.cool-annotation-info-collapsed').should('not.have.text','!');
		cy.cGet('#map').focus();
		helper.typeIntoDocument('{home}');
		// The comment is saved, so its box is down and the badge
		// shows the tick that stands for a thread of one.
		cy.cGet('.cool-annotation-info-collapsed').should('be.visible');
		cy.cGet('.cool-annotation-info-collapsed').should('have.text','');

		helper.reloadDocument(newFilePath);
		desktopHelper.ensureSidebarHidden();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('.cool-annotation-info-collapsed').should('have.text','');
	})

});

describe(['tagdesktop'], 'Annotation Autosave Tests', function() {
	var newFilePath;

	beforeEach(function() {
		cy.viewport(1400, 600);
		newFilePath = helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		// TODO: skip sidebar detection on reload
		// desktopHelper.sidebarToggle();
		desktopHelper.selectZoomLevel('50', false);
	});

	it('Insert autosave', function() {
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
	});

	it('Insert autosave save', function() {
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-save-1').click();
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
	});

	it('Insert autosave cancel', function() {
		desktopHelper.insertComment(undefined, false);
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-cancel-1').click();
		cy.cGet('#comment-container-1').should('not.exist');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('not.exist');
		cy.cGet('#comment-container-1').should('not.exist');
	});

	it('Modify autosave', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0, some other text');
	});

	it('Modify autosave save', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('{end}, some other text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-save-1').click();
		cy.cGet('#annotation-content-area-1').should('have.text','some text0, some other text');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0, some other text');
	});

	it('Modify autosave cancel', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Modify');
		cy.cGet('#annotation-modify-textarea-1').type('some other text, ');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.visible');
		cy.cGet('#annotation-cancel-1').click();
		cy.cGet('.cool-annotation-edit.modify-annotation').should('be.not.visible');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
	});

	it('Reply autosave', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-2').should('have.text','some reply text');
	});

	it('Reply autosave save', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('have.text','some reply text');
		cy.cGet('#annotation-save-2').click();
		cy.cGet('#annotation-modify-textarea-2').should('be.not.visible');
		cy.cGet('.annotation-button-autosaved').should('be.not.visible');
		cy.cGet('.annotation-button-delete').should('be.not.visible');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('#annotation-content-area-2').should('have.text','some reply text');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-2').should('have.text','some reply text');
	});

	it('Reply autosave cancel', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');
		cy.cGet('#annotation-reply-textarea-1').type('some reply text');
		cy.cGet('#map').focus();
		cy.cGet('.annotation-button-autosaved').should('be.visible');
		cy.cGet('.annotation-button-delete').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('be.visible');
		cy.cGet('#annotation-modify-textarea-2').should('have.text','some reply text');
		cy.cGet('#annotation-cancel-2').click();
		cy.cGet('#annotation-modify-textarea-2').should('not.exist');
		cy.cGet('.annotation-button-autosaved').should('not.exist');
		cy.cGet('.annotation-button-delete').should('not.exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('#annotation-content-area-2').should('not.exist');
		cy.cGet('#comment-container-1 .annotation-button-autosaved').should('not.exist');
		cy.cGet('#comment-container-1 .annotation-button-delete').should('not.exist');
		cy.cGet('#comment-container-2 .annotation-button-autosaved').should('not.exist');
		cy.cGet('#comment-container-2 .annotation-button-delete').should('not.exist');

		helper.reloadDocument(newFilePath);
		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0');
		cy.cGet('#annotation-content-area-2').should('not.exist');
	});
});

describe(['tagdesktop'], 'Annotation with @mention', function() {
	beforeEach(function() {
		cy.viewport(1400, 600);
		helper.setupAndLoadDocument('writer/annotation.odt');
		desktopHelper.switchUIToNotebookbar();
		desktopHelper.sidebarToggle();
		desktopHelper.selectZoomLevel('50', false);
	});

	it('Insert comment with mention', function() {
		desktopHelper.insertComment('some text0', false);

		cy.cGet('.cool-annotation').find('#annotation-modify-textarea-new').type(' @Ale');
		cy.cGet('#mentionPopup').should('be.visible');
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').click();

		cy.cGet('#annotation-modify-textarea-new a').should('exist');
		cy.cGet('#annotation-modify-textarea-new a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-modify-textarea-new a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-modify-textarea-new').should('have.text','some text0 @Alexandra\u00A0');

		cy.cGet('#annotation-save-new').click();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1 a').should('exist');
		cy.cGet('#annotation-content-area-1 a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-content-area-1 a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-content-area-1').should('have.text','some text0 @Alexandra ');
	});

	it('Modify comment by adding mention', function () {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain', 'some text0');
		desktopHelper.pickCommentAction(1, 'Modify');

		cy.cGet('#annotation-modify-textarea-1').type('{end}');
		cy.cGet('#annotation-modify-textarea-1').type(' @Ale');
		cy.cGet('#mentionPopup').should('be.visible');
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').click();

		cy.cGet('#annotation-modify-textarea-1 a').should('exist');
		cy.cGet('#annotation-modify-textarea-1 a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-modify-textarea-1 a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-modify-textarea-1').should('have.text', 'some text0 @Alexandra\u00A0');

		cy.cGet('#annotation-save-1').click();
		cy.cGet('.cool-annotation-content-wrapper').should('exist');

		cy.cGet('#annotation-content-area-1 a').should('exist');
		cy.cGet('#annotation-content-area-1 a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-content-area-1 a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-content-area-1').should('have.text', 'some text0 @Alexandra ');
	})

	it('Reply to parent comment by adding mention', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');

		cy.cGet('#annotation-reply-textarea-1').type('some reply text @Ale');

		cy.cGet('#mentionPopup').should('be.visible');
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').click();

		cy.cGet('#annotation-reply-textarea-1 a').should('exist');
		cy.cGet('#annotation-reply-textarea-1 a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-reply-textarea-1 a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-reply-textarea-1').should('have.text', 'some reply text @Alexandra\u00A0');

		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain','some reply text @Alexandra ');
	});

	it('Reply to reply comment by adding mention', function() {
		desktopHelper.insertComment();

		cy.cGet('.cool-annotation-content-wrapper').should('exist');
		cy.cGet('#annotation-content-area-1').should('contain','some text0');
		desktopHelper.pickCommentAction(1, 'Reply');

		cy.cGet('#annotation-reply-textarea-1').type('some reply text @Ale');

		cy.cGet('#mentionPopup').should('be.visible');
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').type('{enter}');

		cy.cGet('#annotation-reply-textarea-1 a').should('exist');
		cy.cGet('#annotation-reply-textarea-1 a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-reply-textarea-1 a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-reply-textarea-1').should('have.text', 'some reply text @Alexandra\u00A0');

		cy.cGet('#annotation-reply-1').click();
		cy.cGet('#annotation-content-area-2').should('contain','some reply text @Alexandra ');

		desktopHelper.pickCommentAction(2, 'Reply');
		cy.cGet('#annotation-reply-textarea-2').type('some reply to reply text @Ale');

		cy.cGet('#mentionPopup').should('be.visible');
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').type('{enter}');

		cy.cGet('#annotation-reply-textarea-2 a').should('exist');
		cy.cGet('#annotation-reply-textarea-2 a').should('have.text', '@Alexandra');
		cy.cGet('#annotation-reply-textarea-2 a').should('have.attr', 'href', 'https://github.com/CollaboraOnline/online');
		cy.cGet('#annotation-reply-textarea-2').should('have.text', 'some reply to reply text @Alexandra\u00A0');

		cy.cGet('#annotation-reply-2').click();
		cy.cGet('#annotation-content-area-3').should('contain','some reply to reply text @Alexandra ');
	});

	it('Escape should close the mentionPopup, comment should be in focus', function() {
		desktopHelper.insertComment('some text0', false);

		cy.cGet('.cool-annotation').find('#annotation-modify-textarea-new').type(' @Ale');
		cy.cGet('#mentionPopup').should('be.visible');
		helper.typeIntoDocument('{esc}');

		cy.cGet('#mentionPopup').should('not.exist');
		cy.cGet('#annotation-modify-textarea-new').should('have.focus');
	});

	it('Typing email address should not show mention popup', function() {
		desktopHelper.insertComment('collaboraonline@al', false);

		cy.cGet('#mentionPopup').should('not.exist');
		cy.cGet('#annotation-modify-textarea-new').should('have.focus');
	});

	it('Special characters should not close the mention popup', function() {
		desktopHelper.insertComment('some text0', false);

		cy.cGet('.cool-annotation').find('#annotation-modify-textarea-new').type(' @Ale');
		cy.cGet('#mentionPopup').should('be.visible');
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').should('exist');

		// the popup covers the comment textarea, so keep typing with force
		// a special character only narrows the search, it must not dismiss the popup
		cy.cGet('#annotation-modify-textarea-new').type('*', {force: true});
		cy.cGet('#mentionPopupfixedtext').should('be.visible').should('have.text', 'No search results found!');

		// ... and further special characters keep it up as well
		cy.cGet('#annotation-modify-textarea-new').type('#', {force: true});
		cy.cGet('#mentionPopupfixedtext').should('be.visible');

		// removing them brings the suggestions back
		cy.cGet('#annotation-modify-textarea-new').type('{backspace}{backspace}', {force: true});
		cy.cGet('#mentionPopupList .ui-treeview-entry:nth-child(1)').should('exist');
	});

	it('Unselect comment on scroll', function() {
		desktopHelper.insertComment('test comment');
		cy.cGet('#comment-container-1').should('exist');

		// The comment the reader has just written is the picked
		// one, and scrolling the document lets it go again.
		cy.cGet('#comment-container-1').should('have.class', 'annotation-active');
		cy.getFrameWindow().then(function(win) { win.app.sectionContainer.getSectionWithName('scroll').scrollVerticalWithOffset(10); });
		cy.cGet('#comment-container-1').should('not.have.class', 'annotation-active');

		// Picking it again by its bubble and scrolling once more
		// does the same.
		cy.cGet('#comment-container-1 .cool-annotation-img').click();
		cy.cGet('#comment-container-1').should('have.class', 'annotation-active');
		cy.getFrameWindow().then(function(win) { win.app.sectionContainer.getSectionWithName('scroll').scrollVerticalWithOffset(10); });
		cy.cGet('#comment-container-1').should('not.have.class', 'annotation-active');
	})

});
