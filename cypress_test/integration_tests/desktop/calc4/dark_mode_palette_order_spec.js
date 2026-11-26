/* global describe it cy require expect */

var helper = require('../../common/helper');

// [data-theme='dark'] in color-palette-dark.css and :root in color-palette.css have the same
// specificity, so the dark palette wins only by coming later in the page, whether the page links
// each stylesheet (a debug build) or only bundle.css (any other build). A page opened with
// darkTheme=true would hide a wrong order, because coolwsd then adds one more link to the dark
// palette after all the others. A page that turns dark after it has loaded, like the app page
// that coolwsd does not serve, has only the page's stylesheets to go by.
describe(['tagdesktop'], 'Dark palette order', function() {

	function assertBackgroundIs(colour) {
		cy.getFrameWindow().should(function(win) {
			var value = win.getComputedStyle(win.document.documentElement)
				.getPropertyValue('--color-main-background');
			expect(value.trim().toLowerCase()).to.equal(colour);
		});
	}

	it('A page that turns dark after loading takes the dark palette', function() {
		helper.setupAndLoadDocument('calc/cell_cursor.ods', false, false, undefined,
			'UITheme=light&darkTheme=false&vector=false');
		assertBackgroundIs('#f8f9fa');

		cy.getFrameWindow().then(function(win) {
			win.app.map.uiManager.applyDarkMode(true, /*persist*/ false);
		});
		cy.cframe().find('html').should('have.attr', 'data-theme', 'dark');
		assertBackgroundIs('#121212');
	});
});
