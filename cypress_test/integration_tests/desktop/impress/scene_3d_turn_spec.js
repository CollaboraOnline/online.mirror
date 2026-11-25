/* -*- js-indent-level: 8 -*- */
/* global describe it cy beforeEach require expect */

var helper = require('../../common/helper');

// Turning in 3D on a vector slide: a sphere, and a scene beside it holding a cube, in one scene.
describe(['tagdesktop'], 'A 3D turn on a vector slide', function() {

	beforeEach(function() {
		cy.viewport(1920, 1080);
		var path = helper.setupDocument('impress/scene_3d.fodp');
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

	function objectsWhere(win, test) {
		var found = [];
		geometry(win).currentPart().objects.forEach(function(object) {
			if (object.id && test(object))
				found.push(object);
		});
		return found;
	}

	function theScene(win) {
		return objectsWhere(win, function(object) {
			return object.objectKind === 202 && object.parent === 0;
		})[0];
	}

	function onCanvas(win, x, y) {
		var visible = win.app.activeDocument.activeLayout.viewedRectangle;
		var scale = win.app.twipsToPixels / win.app.dpiScale;
		return {
			x: x * scale - visible.pX1 / win.app.dpiScale,
			y: y * scale - visible.pY1 / win.app.dpiScale,
		};
	}

	function selection(win) {
		return win.eval('GraphicSelection').selectionSection;
	}

	// the handle that turns in 3D, where the selection has one
	function turnHandle(win) {
		var section = selection(win);
		return section ? section.handles().find(function(handle) {
			return handle.kind === 'turn3d';
		}) : undefined;
	}

	function isIdentity(values) {
		var identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
		return values.every(function(value, at) {
			return Math.abs(value - identity[at]) < 1e-9;
		});
	}

	// presses on the handle, moves by what distance gives in twips, in steps, and before letting
	// go gives the running turn to check; the distance is asked for when the press is made
	function turnBy(win, distance, whileTurning) {
		var handle;
		var dx;
		var dy;
		cy.wrap(null).should(function() {
			handle = turnHandle(win);
			expect(handle, 'the handle that turns in 3D').to.not.equal(undefined);
		});
		cy.then(function() {
			dx = distance()[0];
			dy = distance()[1];
			var from = onCanvas(win, handle.point.x, handle.point.y);
			var drag = cy.cGet('#document-canvas').trigger('mousedown', from.x, from.y,
				{ button: 0, buttons: 1 });
			for (var step = 1; step <= 10; ++step) {
				var place = onCanvas(win, handle.point.x + dx * step / 10,
					handle.point.y + dy * step / 10);
				drag = drag.trigger('mousemove', place.x, place.y, { button: 0, buttons: 1 });
			}
		});
		cy.then(function() {
			whileTurning(selection(win).interaction);
		});
		cy.then(function() {
			var to = onCanvas(win, handle.point.x + dx, handle.point.y + dy);
			cy.cGet('#document-canvas').trigger('mouseup', to.x, to.y, { button: 0, buttons: 0 });
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});
	}

	it('A drag of the handle in the middle turns the selected scene in 3D, as one step to undo.', function() {
		var win = this.win;
		var scene;
		var width;
		cy.wrap(null).should(function() {
			scene = theScene(win);
			expect(scene, 'the scene').to.not.equal(undefined);
		});

		// a click selects the scene, which then shows the handle in its middle
		cy.then(function() {
			width = scene.width;
			var place = onCanvas(win, scene.x + scene.width / 4, scene.y + scene.height / 2);
			cy.cGet('#document-canvas').click(place.x, place.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectedObjectIDs).to.deep.equal([scene.id]);
			expect(turnHandle(win), 'the handle').to.not.equal(undefined);
		});

		// half the width across turns by an eighth about the upright axis; the lines of the
		// turned objects and the angle show while it runs
		turnBy(win, function() { return [width / 2, 0]; }, function(interaction) {
			expect(interaction.reading()).to.equal('Y 45\u00B0  X 0\u00B0');
			expect(interaction.outline().length, 'lines and frame').to.be.greaterThan(1);
			expect(interaction.handles(selection(win).handles())
				.some(function(handle) { return handle.kind === 'turn3d'; }),
			'the handle while turning').to.equal(false);
		});

		// the engine turned the scene; the cube went round behind the sphere, so the scene is
		// narrower on the slide
		cy.wrap(null).should(function() {
			var turned = theScene(win);
			expect(isIdentity(turned.scene3D.transformation), 'turned').to.equal(false);
			expect(turned.width).to.be.lessThan(width);
		});

		// one undo takes it back
		cy.then(function() {
			helper.typeIntoDocument('{ctrl}z');
		});
		cy.wrap(null).should(function() {
			expect(isIdentity(theScene(win).scene3D.transformation), 'undone').to.equal(true);
		});
	});

	it('Inside an entered scene the handle turns the selected 3D object alone.', function() {
		var win = this.win;
		var scene;
		var sphere;
		cy.wrap(null).should(function() {
			scene = theScene(win);
			expect(scene, 'the scene').to.not.equal(undefined);
			sphere = objectsWhere(win, function(object) {
				return object.objectKind === 205;
			})[0];
		});

		// a double click on the sphere enters the scene there and selects the sphere
		cy.then(function() {
			var middle = onCanvas(win, scene.x + scene.width / 4, scene.y + scene.height / 2);
			cy.cGet('#document-canvas').dblclick(middle.x, middle.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectedObjectIDs).to.deep.equal([sphere.id]);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});

		// a drag down turns it about the axis across; the scene keeps its own transform
		turnBy(win, function() { return [0, sphere.height / 2]; }, function(interaction) {
			expect(interaction.reading()).to.equal('Y 0\u00B0  X 45\u00B0');
		});
		cy.wrap(null).should(function() {
			var turned = objectsWhere(win, function(object) {
				return object.id === sphere.id;
			})[0];
			expect(isIdentity(turned.transform3D), 'the sphere turned').to.equal(false);
			expect(isIdentity(theScene(win).scene3D.transformation), 'the scene not').to.equal(true);
		});
	});
});
