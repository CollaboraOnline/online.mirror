/* -*- js-indent-level: 8 -*- */
/* global describe it cy beforeEach require expect */

var helper = require('../../common/helper');

// Break from the context menu on a vector slide: a 3D scene holding an extruded star, an open
// polyline of three segments and a closed triangle.
describe(['tagdesktop'], 'Break on a vector slide', function() {

	beforeEach(function() {
		cy.viewport(1920, 1080);
		var path = helper.setupDocument('impress/break_3d_and_path.fodp');
		helper.loadDocument(path, true, undefined, undefined, 'vector=true');
		cy.getFrameWindow().then(function(win) {
			this.win = win;
			// The usual load checks wait for tiles, which a vector view does not have.
			cy.wrap(null).should(function() {
				expect(win.app.impress.partList).to.have.length.greaterThan(0);
			});
			return helper.processToIdle(win);
		}.bind(this));
	});

	function geometry(win) {
		return win.app.sectionContainer.getSectionWithName(
			win.app.CSections.RenderGeometry.name).constructor;
	}

	// The objects held by the object parent, 0 for those on the slide itself.
	function heldBy(win, parent) {
		var found = [];
		geometry(win).currentPart().objects.forEach(function(object) {
			if (object.id && object.parent === parent)
				found.push(object);
		});
		return found;
	}

	function onTheSlide(win) {
		return heldBy(win, 0);
	}

	function ofKind(win, kind) {
		return onTheSlide(win).filter(function(object) {
			return object.objectKind === kind;
		});
	}

	// Converts a place on the page in twips to CSS pixels on the document canvas.
	function onCanvas(win, x, y) {
		var visible = win.app.activeDocument.activeLayout.viewedRectangle;
		var scale = win.app.twipsToPixels / win.app.dpiScale;
		return {
			x: x * scale - visible.pX1 / win.app.dpiScale,
			y: y * scale - visible.pY1 / win.app.dpiScale,
		};
	}

	// Opens the context menu at a place on the page and runs Break from it.
	function breakAt(win, x, y) {
		var place = onCanvas(win, x, y);
		cy.cGet('#document-canvas').rightclick(place.x, place.y);
		helper.getContextMenuItem('Break').click();
	}

	it('Break takes a 3D scene apart into a 2D object.', function() {
		var win = this.win;
		var scene;
		cy.wrap(null).should(function() {
			scene = ofKind(win, 202)[0];
			expect(scene, 'the scene').to.not.equal(undefined);
		});

		cy.then(function() {
			breakAt(win, scene.x + scene.width / 2, scene.y + scene.height / 2);
		});

		// the scene is gone, and what it showed stays on the slide as one 2D object
		cy.wrap(null).should(function() {
			expect(ofKind(win, 202), 'no scene').to.have.length(0);
			expect(onTheSlide(win), 'the star, the polyline and the triangle').to.have.length(3);
		});
	});

	it('Break takes a 3D object in an entered scene apart into a 2D object on the slide.', function() {
		var win = this.win;
		var scene;
		var star;
		cy.wrap(null).should(function() {
			scene = ofKind(win, 202)[0];
			expect(scene, 'the scene').to.not.equal(undefined);
			star = heldBy(win, scene.id)[0];
			expect(star, 'the star in the scene').to.not.equal(undefined);
		});

		// a double click enters the scene at the star, which is then selected alone
		cy.then(function() {
			var middle = onCanvas(win, scene.x + scene.width / 2, scene.y + scene.height / 2);
			cy.cGet('#document-canvas').dblclick(middle.x, middle.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectedObjectIDs).to.deep.equal([star.id]);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});

		cy.then(function() {
			breakAt(win, scene.x + scene.width / 2, scene.y + scene.height / 2);
		});

		// what the star showed lands on the slide as a 2D object, and the scene, empty now, goes
		cy.wrap(null).should(function() {
			expect(heldBy(win, scene.id), 'nothing left in the scene').to.have.length(0);
			expect(ofKind(win, 202), 'no scene').to.have.length(0);
			expect(onTheSlide(win), 'the star, the polyline and the triangle').to.have.length(3);
			var states = win.eval('Interaction').context().commandStates();
			expect(states['.uno:LeaveGroup'], 'back on the slide').to.equal(false);
		});
	});

	it('Break takes an open polyline apart into its lines.', function() {
		var win = this.win;
		var polyline;
		cy.wrap(null).should(function() {
			polyline = ofKind(win, 9)[0];
			expect(polyline, 'the polyline').to.not.equal(undefined);
		});

		// the middle of its first segment, which rises from the bottom left corner
		cy.then(function() {
			breakAt(win, polyline.x + polyline.width / 6, polyline.y + polyline.height / 2);
		});

		cy.wrap(null).should(function() {
			expect(ofKind(win, 9), 'no polyline').to.have.length(0);
			expect(ofKind(win, 2), 'one line per segment').to.have.length(3);
		});
	});

	it('Break takes a closed triangle apart into its lines.', function() {
		var win = this.win;
		var triangle;
		cy.wrap(null).should(function() {
			triangle = ofKind(win, 8)[0];
			expect(triangle, 'the triangle').to.not.equal(undefined);
		});

		cy.then(function() {
			breakAt(win, triangle.x + triangle.width / 2, triangle.y + triangle.height * 3 / 4);
		});

		cy.wrap(null).should(function() {
			expect(ofKind(win, 8), 'no triangle').to.have.length(0);
			expect(ofKind(win, 2), 'one line per side').to.have.length(3);
		});
	});
});
