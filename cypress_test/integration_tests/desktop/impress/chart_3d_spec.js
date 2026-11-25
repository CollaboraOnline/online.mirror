/* -*- js-indent-level: 8 -*- */
/* global describe it cy beforeEach require expect */

var helper = require('../../common/helper');

// A 3D bar chart on a vector slide, with two series, edited in place.
describe(['tagdesktop'], 'A 3D chart on a vector slide', function() {

	beforeEach(function() {
		cy.viewport(1920, 1080);
		var path = helper.setupDocument('impress/chart_3d.fodp');
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

	function selected(win) {
		return win.eval('GraphicSelection').selectedObjectIDs;
	}

	function selectionText(win) {
		return win.document.getElementById('SelectionText').textContent;
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

	// A double click on the chart edits it in place.
	function enterTheChart(win) {
		cy.then(function() {
			var chart = objectsWhere(win, function(object) { return !object.parent; })[0];
			var middle = onCanvas(win, chart.x + chart.width / 2, chart.y + chart.height / 2);
			cy.cGet('#document-canvas').dblclick(middle.x, middle.y);
		});
		cy.wrap(null).should(function() {
			expect(win.eval('GraphicSelection').inPlaceActive, 'the chart active').to.equal(true);
			expect(objectsWhere(win, function(object) {
				return object.objectKind === 206 && object.chartPart !== undefined;
			}), 'the bars').to.have.length(8);
		});
	}

	// The series whose name holds that word, its first bar and a point inside the bar's box
	// where the client finds that bar in front. The chart's 3D is seen on the slide, so there
	// is such a point.
	function aBarOf(win, word) {
		var data = geometry(win).currentPart();
		var series = objectsWhere(win, function(object) {
			return object.chartKeys && object.chartKeys.text &&
				object.chartKeys.text.indexOf(word) >= 0;
		})[0];
		var bar = objectsWhere(win, function(object) {
			return object.parent === series.id && object.objectKind === 206;
		})[0];
		var scene = win.cool.Scene3D.sceneOf(data, bar.id);
		for (var fy = 0.3; fy < 0.9; fy += 0.1)
			for (var fx = 0.2; fx < 0.8; fx += 0.1) {
				var x = bar.x + bar.width * fx;
				var y = bar.y + bar.height * fy;
				var hit = win.cool.Scene3D.hitAt(data, scene, x, y);
				if (hit && hit.id === bar.id)
					return { series: series, bar: bar, point: onCanvas(win, x, y) };
			}
		return { series: series, bar: bar, point: undefined };
	}

	it('A click takes the bar under the pointer, and the bar is not turned in 3D.', function() {
		var win = this.win;
		enterTheChart(win);

		var found;
		cy.then(function() {
			found = aBarOf(win, 'South');
			expect(found.point, 'a point of the bar inside its box').to.not.equal(undefined);
		});

		// the first click takes the series, the second the bar
		cy.then(function() {
			cy.cGet('#document-canvas').click(found.point.x, found.point.y);
		});
		cy.wrap(null).should(function() {
			expect(selected(win)).to.deep.equal([found.series.id]);
			expect(selectionText(win)).to.contain('South');
		});
		cy.then(function() {
			cy.cGet('#document-canvas').click(found.point.x, found.point.y);
		});
		cy.wrap(null).should(function() {
			expect(selected(win)).to.deep.equal([found.bar.id]);
			expect(selectionText(win)).to.contain('Data point');
		});

		// the part goes by the chart's rules: no handle turns it in 3D
		cy.then(function() {
			var handles = win.eval('GraphicSelection').selectionSection.handles();
			expect(handles.some(function(handle) { return handle.kind === 'turn3d'; }))
				.to.equal(false);
		});
	});
});
