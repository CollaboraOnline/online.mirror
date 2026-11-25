/* -*- js-indent-level: 8 -*- */
/* global describe it cy beforeEach require expect */

var helper = require('../../common/helper');

// Scaling in 3D an extruded star inside a scene, whose middle lies away from nought in its own
// space, so the side that stays has to be found where the star is seen.
describe(['tagdesktop'], 'A 3D scale on a vector slide', function() {

	beforeEach(function() {
		cy.viewport(1920, 1080);
		var path = helper.setupDocument('impress/break_3d_and_path.fodp');
		helper.loadDocument(path, true, undefined, undefined, 'vector=true');
		cy.getFrameWindow().then(function(win) {
			this.win = win;
			cy.wrap(null).should(function() {
				expect(win.app.impress.partList).to.have.length.greaterThan(0);
			});
			return helper.processToIdle(win);
		}.bind(this));
	});

	function objectsWhere(win, test) {
		var found = [];
		win.app.sectionContainer.getSectionWithName(win.app.CSections.RenderGeometry.name)
			.constructor.currentPart().objects.forEach(function(object) {
				if (object.id && test(object))
					found.push(object);
			});
		return found;
	}

	function onCanvas(win, x, y) {
		var visible = win.app.activeDocument.activeLayout.viewedRectangle;
		var scale = win.app.twipsToPixels / win.app.dpiScale;
		return {
			x: x * scale - visible.pX1 / win.app.dpiScale,
			y: y * scale - visible.pY1 / win.app.dpiScale,
		};
	}

	// enters the scene at the star and drags the handle in the middle of that side outwards by a
	// quarter of the star's width
	function scaleBy(win, side, check) {
		var scene;
		var star;
		cy.wrap(null).should(function() {
			scene = objectsWhere(win, function(object) {
				return object.objectKind === 202 && object.parent === 0;
			})[0];
			star = scene && objectsWhere(win, function(object) {
				return object.parent === scene.id;
			})[0];
			expect(star, 'the star').to.not.equal(undefined);
		});
		cy.then(function() {
			var middle = onCanvas(win, star.x + star.width / 2, star.y + star.height / 2);
			cy.cGet('#document-canvas').dblclick(middle.x, middle.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectedObjectIDs).to.deep.equal([star.id]);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});
		var handle;
		cy.wrap(null).should(function() {
			var sides = win.eval('GraphicSelection').selectionSection.handles().filter(function(one) {
				return one.kind === '4' || one.kind === '5';
			}).sort(function(one, other) {
				return one.point.x - other.point.x;
			});
			handle = side === 'right' ? sides[sides.length - 1] : sides[0];
			expect(handle, 'the handle').to.not.equal(undefined);
		});
		cy.then(function() {
			var way = (side === 'right' ? 1 : -1) * star.width / 4;
			var from = onCanvas(win, handle.point.x, handle.point.y);
			var drag = cy.cGet('#document-canvas').trigger('mousedown', from.x, from.y,
				{ button: 0, buttons: 1 });
			for (var step = 1; step <= 10; ++step) {
				var place = onCanvas(win, handle.point.x + way * step / 10, handle.point.y);
				drag = drag.trigger('mousemove', place.x, place.y, { button: 0, buttons: 1 });
			}
			var end = onCanvas(win, handle.point.x + way, handle.point.y);
			drag.trigger('mouseup', end.x, end.y, { button: 0, buttons: 0 });
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});
		cy.wrap(null).should(function() {
			var now = objectsWhere(win, function(object) { return object.id === star.id; })[0];
			check(star, now);
		});
	}

	it('The right handle widens the star to the right, its left side stays.', function() {
		scaleBy(this.win, 'right', function(was, now) {
			expect(now.x, 'the left side').to.be.closeTo(was.x, was.width / 20);
			expect(now.x + now.width).to.be.greaterThan(was.x + was.width * 1.1);
		});
	});

	it('The left handle widens the star to the left, its right side stays.', function() {
		scaleBy(this.win, 'left', function(was, now) {
			expect(now.x + now.width, 'the right side').to.be.closeTo(was.x + was.width,
				was.width / 20);
			expect(now.x).to.be.lessThan(was.x - was.width * 0.1);
		});
	});

	it('The right arrow on the right handle, held, widens the star to the right as one step to undo.', function() {
		var win = this.win;
		var scene;
		var star;
		cy.wrap(null).should(function() {
			scene = objectsWhere(win, function(object) {
				return object.objectKind === 202 && object.parent === 0;
			})[0];
			star = scene && objectsWhere(win, function(object) {
				return object.parent === scene.id;
			})[0];
			expect(star, 'the star').to.not.equal(undefined);
		});
		cy.then(function() {
			var middle = onCanvas(win, star.x + star.width / 2, star.y + star.height / 2);
			cy.cGet('#document-canvas').dblclick(middle.x, middle.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectedObjectIDs).to.deep.equal([star.id]);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});

		// a click on the right handle puts the keyboard there
		var handle;
		cy.wrap(null).should(function() {
			handle = win.eval('GraphicSelection').selectionSection.handles().filter(function(one) {
				return one.kind === '4' || one.kind === '5';
			}).sort(function(one, other) {
				return other.point.x - one.point.x;
			})[0];
			expect(handle, 'the right handle').to.not.equal(undefined);
		});
		cy.then(function() {
			var place = onCanvas(win, handle.point.x, handle.point.y);
			cy.cGet('#document-canvas').click(place.x, place.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectionSection.travel.activeName,
				'the keyboard on the handle').to.equal(handle.name);
		});

		// the key held: it goes down three times, as it repeats, and up once
		cy.then(function() {
			var target = win.document.querySelector('div.clipboard');
			var key = function(type, repeat) {
				target.dispatchEvent(new win.KeyboardEvent(type, { key: 'ArrowRight', code: 'ArrowRight',
					keyCode: 39, repeat: repeat, bubbles: true, cancelable: true }));
			};
			key('keydown', false);
			key('keydown', true);
			key('keydown', true);
			key('keyup', false);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});
		cy.wrap(null).should(function() {
			var now = objectsWhere(win, function(object) { return object.id === star.id; })[0];
			expect(now.x, 'the left side').to.be.closeTo(star.x, star.width / 20);
			expect(now.x + now.width, 'the right side').to.be.greaterThan(star.x + star.width + 50);
		});

		// one undo takes all three steps away
		cy.then(function() {
			helper.typeIntoDocument('{ctrl}z');
		});
		cy.wrap(null).should(function() {
			var now = objectsWhere(win, function(object) { return object.id === star.id; })[0];
			expect(now.width, 'as wide as before').to.be.closeTo(star.width, 4);
		});
	});

	it('The right arrow on the right handle scales as far held as pressed slowly.', function() {
		var win = this.win;
		var star;
		cy.wrap(null).should(function() {
			var scene = objectsWhere(win, function(object) {
				return object.objectKind === 202 && object.parent === 0;
			})[0];
			star = scene && objectsWhere(win, function(object) {
				return object.parent === scene.id;
			})[0];
			expect(star, 'the star').to.not.equal(undefined);
		});
		cy.then(function() {
			var middle = onCanvas(win, star.x + star.width / 2, star.y + star.height / 2);
			cy.cGet('#document-canvas').dblclick(middle.x, middle.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').selectedObjectIDs).to.deep.equal([star.id]);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});

		function starNow() {
			return objectsWhere(win, function(object) { return object.id === star.id; })[0];
		}

		// a click on the right handle puts the keyboard there
		function keyboardOnTheRightHandle() {
			var handle;
			cy.wrap(null).should(function() {
				handle = win.eval('GraphicSelection').selectionSection.handles().filter(function(one) {
					return one.kind === '4' || one.kind === '5';
				}).sort(function(one, other) {
					return other.point.x - one.point.x;
				})[0];
				expect(handle, 'the right handle').to.not.equal(undefined);
			});
			cy.then(function() {
				var place = onCanvas(win, handle.point.x, handle.point.y);
				cy.cGet('#document-canvas').click(place.x, place.y);
			});
			cy.wrap(null).should(function() {
				expect(win.eval('GraphicSelection').selectionSection.travel.activeName,
					'the keyboard on the handle').to.equal(handle.name);
			});
		}

		function key(type, repeat) {
			win.document.querySelector('div.clipboard').dispatchEvent(new win.KeyboardEvent(type, {
				key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, repeat: repeat, bubbles: true,
				cancelable: true }));
		}

		// three presses, each one answered by the engine before the next
		keyboardOnTheRightHandle();
		for (var press = 0; press < 3; ++press) {
			cy.then(function() {
				key('keydown', false);
				key('keyup', false);
			});
			cy.then(function() {
				return helper.processToIdle(win);
			});
		}
		var slowly;
		cy.wrap(null).should(function() {
			slowly = starNow();
			expect(slowly.width, 'wider').to.be.greaterThan(star.width + 50);
		});

		// back to where it was, a step to undo for each press
		for (var undo = 0; undo < 3; ++undo) {
			cy.then(function() {
				helper.typeIntoDocument('{ctrl}z');
			});
			cy.then(function() {
				return helper.processToIdle(win);
			});
		}
		cy.wrap(null).should(function() {
			expect(starNow().width, 'as wide as before').to.be.closeTo(star.width, 4);
		});

		// the key held for as many steps, sent when it is let go
		keyboardOnTheRightHandle();
		cy.then(function() {
			key('keydown', false);
			key('keydown', true);
			key('keydown', true);
			key('keyup', false);
		});
		cy.then(function() {
			return helper.processToIdle(win);
		});
		cy.wrap(null).should(function() {
			// each answer of the engine is in whole twips, so the steps pressed slowly start from
			// a slightly different place than the held ones, which go on from the client's
			var held = starNow();
			expect(held.x, 'the left side').to.be.closeTo(slowly.x, 10);
			expect(held.width, 'the width').to.be.closeTo(slowly.width, 10);
			expect(held.height, 'the height').to.be.closeTo(slowly.height, 10);
		});
	});
});
