/* -*- js-indent-level: 8 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/*
 * Admin Flamegraph tab: samples the stacks of one document and draws where its
 * time goes, updating while the document is in use.
 */

/* global Admin AdminSocketBase d3 _ */

// One row per stack level, the height the flamegraph tools use. Fitting the whole picture into the
// window shrinks the rows down to MinRowHeight, and the label shrinks with them until it would be
// too small to read, below MinLabelFontSize, and then it is left out.
const RowHeight = 16;
const MinRowHeight = 2;
const LabelFont = 'Verdana, sans-serif';
const LabelFontSize = 12;
const MinLabelFontSize = 7;
// Verdana takes about six tenths of the font size for a character, so about seven pixels at twelve.
const CharWidthRatio = 0.59;
const CharWidth = Math.round(LabelFontSize * CharWidthRatio);
const MinDrawnWidth = 1.5;
const MaxFramesPerSecond = 4;

// Geometry of the standalone file the download writes: the margin either side, the room above the
// frames for the title and the two links, and the room below for the details line.
const SvgPad = 10;
const SvgHeadHeight = 40;
const SvgFootHeight = 30;

// The script carried inside that file, which is all that makes it clickable once it has been saved
// and opened on its own. It reads the geometry back out of the frames it is given, so it needs
// nothing passed in.
const SvgScript = `
(function () {
	var frames = document.getElementById('frames');
	var groups = frames.getElementsByClassName('frame');
	var details = document.getElementById('details');
	var matched = document.getElementById('matched');
	var unzoom = document.getElementById('unzoom');
	var search = document.getElementById('search');
	var pattern = null;
	var all = [];
	var base = null;

	for (var i = 0; i < groups.length; i++) {
		var group = groups[i];
		var rect = group.getElementsByTagName('rect')[0];
		var text = group.getElementsByTagName('text')[0];
		var frame = {
			group: group,
			rect: rect,
			text: text,
			name: group.getAttribute('data-name') || '',
			title: group.getElementsByTagName('title')[0].textContent,
			fill: rect.getAttribute('fill'),
			x: parseFloat(rect.getAttribute('x')),
			y: parseFloat(rect.getAttribute('y')),
			width: parseFloat(rect.getAttribute('width'))
		};
		all.push(frame);
		if (!base || frame.width > base.width) {
			base = frame;
		}
	}

	function label(frame, width) {
		var room = Math.floor((width - 6) / ${CharWidth});
		if (room < 3) {
			return '';
		}
		return frame.name.length <= room ? frame.name : frame.name.substring(0, room - 1) + '..';
	}

	function place(frame, x, width) {
		frame.rect.setAttribute('x', x.toFixed(2));
		frame.rect.setAttribute('width', Math.max(1, width).toFixed(2));
		frame.text.setAttribute('x', (x + 3).toFixed(2));
		frame.text.textContent = label(frame, width);
		frame.group.classList.remove('hide');
	}

	function draw(target) {
		var left = target.x;
		var right = target.x + target.width;
		var scale = base.width / target.width;
		var fudge = 0.0001;

		for (var i = 0; i < all.length; i++) {
			var frame = all[i];
			if (frame.x + frame.width <= left + fudge || frame.x + fudge >= right) {
				// Nothing of this frame is inside the part being looked at.
				frame.group.classList.add('hide');
				continue;
			}
			if (frame.x <= left + fudge && frame.x + frame.width + fudge >= right && frame.y > target.y) {
				// A frame the chosen one sits on top of. It spans the whole width now.
				place(frame, base.x, base.width);
				continue;
			}
			place(frame, base.x + (frame.x - left) * scale, frame.width * scale);
		}

		if (target === base) {
			unzoom.classList.add('hide');
		} else {
			unzoom.classList.remove('hide');
		}
		mark();
	}

	function mark() {
		// A hit is filled with the magenta the flamegraph tools use, and anything else goes back
		// to the colour its name gives it.
		for (var i = 0; i < all.length; i++) {
			var frame = all[i];
			var hit = pattern && pattern.test(frame.name);
			frame.rect.setAttribute('fill', hit ? 'rgb(230,0,230)' : frame.fill);
		}

		search.textContent = pattern ? 'Reset Search' : 'Search';

		if (!pattern) {
			matched.textContent = ' ';
			return;
		}

		// A frame sitting on top of another match is part of the same marked block, so taking the
		// widest match of each block gives the share of all the samples that matched.
		var covered = 0;
		var sorted = all.slice().sort(function (a, b) {
			return b.width - a.width;
		});
		var ranges = [];
		for (var s = 0; s < sorted.length; s++) {
			if (!pattern.test(sorted[s].name)) {
				continue;
			}
			var from = sorted[s].x;
			var to = from + sorted[s].width;
			var inside = false;
			for (var r = 0; r < ranges.length; r++) {
				if (from >= ranges[r][0] - 0.0001 && to <= ranges[r][1] + 0.0001) {
					inside = true;
					break;
				}
			}
			if (!inside) {
				ranges.push([from, to]);
				covered += sorted[s].width;
			}
		}
		matched.textContent = 'Matched: ' + ((100 * covered) / base.width).toFixed(1) + '%';
	}

	frames.addEventListener('mouseover', function (event) {
		var group = event.target.parentNode;
		if (group && group.classList && group.classList.contains('frame')) {
			details.textContent = group.getElementsByTagName('title')[0].textContent;
		}
	});

	frames.addEventListener('click', function (event) {
		var group = event.target.parentNode;
		if (!group || !group.classList || !group.classList.contains('frame')) {
			return;
		}
		for (var i = 0; i < all.length; i++) {
			if (all[i].group === group) {
				draw(all[i]);
				return;
			}
		}
	});

	unzoom.addEventListener('click', function () {
		draw(base);
	});

	search.addEventListener('click', function () {
		if (pattern) {
			pattern = null;
			mark();
			return;
		}
		var text = window.prompt('Search for a frame name, as a regular expression', '');
		if (text === null) {
			return;
		}
		pattern = null;
		if (text) {
			try {
				pattern = new RegExp(text, 'i');
			} catch (exc) {
				pattern = null;
			}
		}
		mark();
	});

	mark();
})();
`;

const AdminSocketFlamegraph = AdminSocketBase.extend({
	constructor: function (host) {
		this.base(host);

		// Frame labels by the number the server interns them as.
		this._names = [];
		this._nextNodeId = 1;
		// The bar along the bottom stands for every sample, and is named as the flamegraph
		// tools name it.
		this._root = this._makeNode('all', null);
		this._documents = {};
		this._capture = null;
		this._state = 'idle';
		this._frozen = false;
		this._zoomNode = null;
		this._threadFilter = '';
		this._fitHeight = false;
		this._searchPattern = null;
		this._redrawPending = false;
		this._lastDrawnAt = 0;
		this._totals = {
			samples: 0,
			idle: 0,
			dropped: 0,
			unresolved: 0,
			frames: 0,
			truncated: false,
			interval: 0,
			startedAt: 0,
		};
		this._availability = null;
	},

	_makeNode: function (name, parent) {
		return {
			id: this._nextNodeId++,
			name: name,
			value: 0,
			self: 0,
			depth: parent ? parent.depth + 1 : 0,
			parent: parent,
			children: [],
			byName: {},
		};
	},

	onSocketOpen: function () {
		// Authenticate first.
		this.base.call(this);

		this.socket.send('profile_status');
		this.socket.send('documents');
		this.socket.send('subscribe adddoc rmdoc');

		document.getElementById('profile-start').onclick = this._onStart.bind(this);
		document.getElementById('profile-stop').onclick = this._onStop.bind(this);
		document.getElementById('profile-freeze').onclick =
			this._onFreeze.bind(this);
		document.getElementById('profile-reset').onclick = this._onReset.bind(this);
		document.getElementById('profile-zoom-reset').onclick =
			this._onZoomReset.bind(this);
		document.getElementById('profile-fit').onclick = this._onFit.bind(this);
		document.getElementById('profile-download-folded').onclick =
			this._onDownloadFolded.bind(this);
		document.getElementById('profile-download-svg').onclick =
			this._onDownloadSvg.bind(this);
		document.getElementById('profile-rate').onchange = this._onRate.bind(this);
		document.getElementById('profile-thread').onchange =
			this._onThread.bind(this);
		document.getElementById('profile-search').oninput =
			this._onSearch.bind(this);

		window.addEventListener('resize', this._scheduleRedraw.bind(this));

		// Control-F reaches the search box, as it does in a flamegraph the tools produced.
		window.addEventListener('keydown', function (event) {
			if (event.ctrlKey && event.key === 'f') {
				event.preventDefault();
				document.getElementById('profile-search').focus();
			}
		});

		// A document named in the query string is what the overview table links to.
		const params = new URLSearchParams(window.location.search);
		this._wantedPid = params.get('pid') || '';
		this._wantedDocKey = params.get('docKey') || '';

		this._updateStatus();
	},

	onSocketClose: function () {
		// The samples gathered so far are the most valuable thing on the page, so
		// the graph stays readable and downloadable instead of asking for a reload.
		this.socket.onerror = function () {};
		this.socket.onclose = function () {};
		this.socket.onmessage = function () {};
		this.socket.close();
		this._state = 'stopped';
		this._setButtons();
		this._updateStatus(_('Sampling stopped'));
	},

	onSocketMessage: function (e) {
		const message = typeof e.data === 'string' ? e.data : '';
		const space = message.indexOf(' ');
		const command = space < 0 ? message : message.substring(0, space);
		const rest = space < 0 ? '' : message.substring(space + 1);

		if (command === 'documents') {
			this._onDocuments(JSON.parse(rest));
		} else if (command === 'adddoc') {
			this._onAddDoc(rest.trim().split(' '));
		} else if (command === 'rmdoc') {
			this._onRmDoc(rest.trim().split(' '));
		} else if (command === 'profile_status') {
			this._onStatus(JSON.parse(rest));
		} else if (command === 'profile_started') {
			this._onStarted(JSON.parse(rest.substring(rest.indexOf(' ') + 1)));
		} else if (command === 'profile_error') {
			this._onError(rest);
		} else if (command === 'profile_stopped') {
			this._onStopped(rest);
		} else if (command === 'profile_samples') {
			this._onSamples(JSON.parse(rest.substring(rest.indexOf(' ') + 1)));
		}
	},

	// The list of documents that can be sampled.

	_onDocuments: function (json) {
		const documents = json.documents || [];
		this._documents = {};
		for (let i = 0; i < documents.length; i++) {
			this._documents[documents[i].pid] = {
				pid: String(documents[i].pid),
				docKey: documents[i].docKey,
				filename: decodeURI(documents[i].fileName || documents[i].docKey),
			};
		}
		this._fillDocumentPicker();
	},

	_onAddDoc: function (tokens) {
		if (tokens.length < 10) {
			return;
		}

		this._documents[tokens[0]] = {
			pid: tokens[0],
			// The key is the last field of the message, and it is not encoded.
			docKey: tokens.slice(9).join(' '),
			filename: decodeURI(tokens[1]),
		};
		this._fillDocumentPicker();
	},

	_onRmDoc: function () {
		// One view left, which may or may not have been the last one, so ask for the
		// list again rather than guessing that the document is gone. The capture itself
		// ends through profile_stopped, which the server sends once the kit has gone.
		this.socket.send('documents');
	},

	_fillDocumentPicker: function () {
		const picker = document.getElementById('profile-document');
		const chosen = picker.value;
		picker.replaceChildren();

		const empty = document.createElement('option');
		empty.value = '';
		empty.textContent = _('Pick a document to sample');
		picker.appendChild(empty);

		for (let pid in this._documents) {
			const doc = this._documents[pid];
			const option = document.createElement('option');
			option.value = pid;
			option.textContent = doc.filename + ' (' + pid + ')';
			picker.appendChild(option);
		}

		if (this._capture) {
			picker.value = this._capture.pid;
		} else if (chosen && this._documents[chosen]) {
			picker.value = chosen;
		} else if (this._wantedPid && this._documents[this._wantedPid]) {
			picker.value = this._wantedPid;
			// A link from the overview table starts sampling straight away.
			this._wantedPid = '';
			this._onStart();
		}
	},

	// Controls.

	_onStart: function () {
		const pid = document.getElementById('profile-document').value;
		const doc = this._documents[pid];
		if (!doc) {
			this._updateStatus(_('Pick a document to sample'));
			return;
		}

		const interval = document.getElementById('profile-rate').value;
		this.socket.send(
			'profile_start ' +
				pid +
				' ' +
				encodeURIComponent(doc.docKey) +
				' interval=' +
				interval,
		);
	},

	_onStop: function () {
		if (this._capture) {
			this.socket.send('profile_stop ' + this._capture.pid);
		}
	},

	_onFit: function () {
		this._fitHeight = !this._fitHeight;
		document.getElementById('profile-fit').textContent = this._fitHeight
			? _('Full rows')
			: _('Fit to window');
		this._scheduleRedraw();
	},

	_onFreeze: function () {
		this._frozen = !this._frozen;
		document.getElementById('profile-freeze').textContent = this._frozen
			? _('Resume view')
			: _('Freeze view');
		if (!this._frozen) {
			this._scheduleRedraw();
		}
	},

	_onReset: function () {
		this._nextNodeId = 1;
		this._root = this._makeNode('all', null);
		this._zoomNode = null;
		this._totals.samples = 0;
		this._totals.idle = 0;
		this._totals.dropped = 0;
		this._totals.unresolved = 0;
		this._totals.frames = 0;
		this._totals.truncated = false;
		this._fillThreadPicker();
		this._scheduleRedraw();
	},

	_onZoomReset: function () {
		this._zoomNode = null;
		this._scheduleRedraw();
	},

	_onRate: function () {
		if (this._capture) {
			this.socket.send(
				'profile_rate ' +
					this._capture.pid +
					' ' +
					document.getElementById('profile-rate').value,
			);
		}
	},

	_onThread: function () {
		this._threadFilter = document.getElementById('profile-thread').value;
		this._zoomNode = null;
		this._updateMatched();
		this._scheduleRedraw();
	},

	_onSearch: function () {
		const text = document.getElementById('profile-search').value;
		this._searchPattern = null;
		if (text) {
			try {
				this._searchPattern = new RegExp(text, 'i');
			} catch (exc) {
				this._searchPattern = null;
			}
		}
		this._updateMatched();
		this._scheduleRedraw();
	},

	// The share of the samples that lie under a matching frame. A frame under another match is not
	// counted twice, so the figure is the width of the marked part of the picture.
	_updateMatched: function () {
		const label = document.getElementById('profile-matched');
		const pattern = this._searchPattern;
		if (!pattern) {
			label.textContent = '';
			return;
		}

		const base = this._baseNode();
		let matched = 0;
		const walk = function (node) {
			if (pattern.test(node.name)) {
				matched += node.value;
				return;
			}
			for (let i = 0; i < node.children.length; i++) {
				walk(node.children[i]);
			}
		};
		walk(base);

		const percent = base.value > 0 ? (100 * matched) / base.value : 0;
		label.textContent = _('Matched') + ': ' + percent.toFixed(1) + '%';
	},

	// Server replies.

	_onStatus: function (json) {
		this._availability = json;
		if (!json.available) {
			this._updateStatus(
				_('Sampling is not available on this server') + ': ' + json.reason,
			);
			document.getElementById('profile-start').disabled = true;
			return;
		}

		// A page that has just loaded adopts a capture that is already running.
		if (json.capture) {
			this._wantedPid = String(json.capture.pid);
		}
	},

	_onStarted: function (json) {
		this._capture = {
			pid: String(json.pid),
			docKey: json.docKey,
			filename: json.filename,
			interval: json.interval,
		};
		this._state = 'priming';
		this._totals.interval = json.interval;
		this._totals.startedAt = Date.now();
		this._setButtons();
		this._updateStatus(_('Reading symbols, the first sample takes a moment'));
	},

	_onError: function (rest) {
		const tokens = rest.split(' ');
		const code = tokens.length > 1 ? tokens[1] : 'error';
		const reason = tokens.slice(2).join(' ');
		this._state = 'idle';
		this._capture = null;
		this._setButtons();
		this._updateStatus(reason || code);
	},

	_onStopped: function (rest) {
		const tokens = rest.split(' ');
		this._state = 'stopped';
		this._capture = null;
		this._setButtons();
		const reason = tokens[1] || 'user';
		if (reason === 'docgone' || reason === 'kitdied') {
			this._updateStatus(
				_('The document closed. The samples so far are kept.'),
			);
		} else {
			this._updateStatus(_('Sampling stopped') + ' (' + reason + ')');
		}
	},

	_onSamples: function (json) {
		const frames = json.frames || [];
		for (let i = 0; i < frames.length; i++) {
			this._names[frames[i][0]] = frames[i][1];
		}

		const stacks = json.stacks || [];
		for (let s = 0; s < stacks.length; s++) {
			this._addStack(stacks[s][0], stacks[s][1]);
		}

		this._state = json.state;
		this._totals.samples += json.samples || 0;
		this._totals.idle += json.idle || 0;
		this._totals.dropped += json.dropped || 0;
		this._totals.unresolved += json.unresolved || 0;
		this._totals.frames += json.frameCount || 0;
		this._totals.truncated = this._totals.truncated || json.trunc;
		this._totals.interval = json.interval;

		if (this._capture) {
			this.socket.send('profile_ack ' + this._capture.pid + ' ' + json.seq);
		}

		this._setButtons();
		this._fillThreadPicker();
		this._updateMatched();
		this._scheduleRedraw();
		this._updateStatus();
	},

	// The accumulation tree.

	_addStack: function (path, count) {
		let node = this._root;
		node.value += count;
		for (let i = 0; i < path.length; i++) {
			const name = this._names[path[i]] || '[unknown]';
			let child = node.byName[name];
			if (!child) {
				// First-seen order is kept, so a frame that grows does not swap places
				// with its siblings while it is being watched.
				child = this._makeNode(name, node);
				node.byName[name] = child;
				node.children.push(child);
			}
			child.value += count;
			node = child;
		}
		node.self += count;
	},

	// What the bottom bar stands for when nothing is zoomed: every sample, or every sample of the
	// one chosen thread.
	_baseNode: function () {
		if (this._threadFilter && this._root.byName[this._threadFilter]) {
			return this._root.byName[this._threadFilter];
		}
		return this._root;
	},

	_viewRoot: function () {
		return this._zoomNode || this._baseNode();
	},

	_fillThreadPicker: function () {
		const picker = document.getElementById('profile-thread');
		const known = {};
		for (let i = 0; i < picker.options.length; i++) {
			known[picker.options[i].value] = true;
		}

		for (let t = 0; t < this._root.children.length; t++) {
			const name = this._root.children[t].name;
			if (!known[name]) {
				const option = document.createElement('option');
				option.value = name;
				option.textContent = name;
				picker.appendChild(option);
			}
		}
	},

	// Drawing.

	_scheduleRedraw: function () {
		if (this._redrawPending || this._frozen) {
			return;
		}

		this._redrawPending = true;
		window.requestAnimationFrame(
			function () {
				this._redrawPending = false;
				const now = Date.now();
				if (now - this._lastDrawnAt < 1000 / MaxFramesPerSecond) {
					// Redrawing on every arriving window would spend more time drawing
					// than the reader can follow.
					window.setTimeout(
						this._scheduleRedraw.bind(this),
						1000 / MaxFramesPerSecond,
					);
					return;
				}
				this._lastDrawnAt = now;
				this._render();
			}.bind(this),
		);
	},

	// The cells to draw, with the deepest frames along the top and the bar standing for every
	// sample along the bottom, which is the way round the flamegraph tools draw them. The
	// height needed comes back as the rowCount of the returned array, and the caller turns the
	// depth of each cell into a y once it has chosen a row height.
	_cells: function (root, width) {
		const cells = [];
		const scale = root.value > 0 ? width / root.value : 0;
		let deepest = 0;

		const walk = function (node, left, depth) {
			deepest = Math.max(deepest, depth);
			cells.push({
				node: node,
				x: left,
				depth: depth,
				width: node.value * scale,
			});

			let childLeft = left;
			for (let i = 0; i < node.children.length; i++) {
				walk(node.children[i], childLeft, depth + 1);
				childLeft += node.children[i].value * scale;
			}
		};

		walk(root, 0, 0);

		const drawn = cells.filter(function (cell) {
			return cell.width >= MinDrawnWidth;
		});
		drawn.rowCount = deepest + 1;
		drawn.deepest = deepest;
		return drawn;
	},

	// Where a cell sits, counting up from the bar along the bottom.
	_rowY: function (cells, cell, rowHeight) {
		return (cells.deepest - cell.depth) * rowHeight;
	},

	// The line the letters stand on, leaving a little more room below the word than above it, which
	// is where the flamegraph tools put it.
	_labelY: function (cells, cell, rowHeight, fontSize) {
		const ascent = fontSize * 0.73;
		return (
			this._rowY(cells, cell, rowHeight) +
			ascent +
			(rowHeight - fontSize) * 0.45
		);
	},

	// A number from zero up to but not including one, spread evenly over that range, and the same
	// every time for the same name, so a function keeps its colour between updates.
	_nameHash: function (name) {
		let hash = 0x811c9dc5;
		for (let i = 0; i < name.length; i++) {
			hash = (hash ^ (name.charCodeAt(i) & 0xff)) >>> 0;
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
		// The multiply on its own leaves neighbouring names close together, and the two shifts
		// carry the low bits up into the range the colour is taken from.
		hash = (hash ^ (hash >>> 15)) >>> 0;
		hash = Math.imul(hash, 0x2545f491) >>> 0;
		hash = (hash ^ (hash >>> 13)) >>> 0;
		return ((hash >>> 8) & 0xffffff) / 0x1000000;
	},

	// The hot palette of the flamegraph tools: red is nearly full, green carries the hash and
	// blue stays low. Black text is readable on all of it.
	_colourOf: function (name) {
		const forwards = this._nameHash(name);
		const backwards = this._nameHash(name.split('').reverse().join(''));
		const red = 205 + Math.floor(50 * backwards);
		const green = Math.floor(230 * forwards);
		const blue = Math.floor(55 * backwards);
		return 'rgb(' + red + ',' + green + ',' + blue + ')';
	},

	// The bar standing for every sample carries no name of its own, and takes the colour an empty
	// name gives, which is the top of the palette.
	_colourFor: function (node) {
		return this._colourOf(node.parent ? node.name : '');
	},

	_render: function () {
		const container = document.getElementById('profile-graph');
		const svg = d3.select('#profile-svg');
		const width = container.clientWidth - 4;
		const root = this._viewRoot();
		const cells = this._cells(root, width);
		const rowHeight = this._rowHeight(container, cells.rowCount);
		const fontSize = this._labelFontSize(rowHeight);
		const charWidth = fontSize * CharWidthRatio;

		// A reader sitting at the bottom of the picture is watching the bar that stands for every
		// sample, and stays with it as the stacks above grow taller. A reader who has scrolled up to
		// look at a leaf is left where they are.
		const atBottom =
			container.scrollHeight - container.clientHeight - container.scrollTop <
			2 * rowHeight;

		svg.attr('height', cells.rowCount * rowHeight + 2);

		if (atBottom) {
			container.scrollTop = container.scrollHeight;
		}

		const self = this;
		const groups = svg
			.selectAll('g.profile-frame')
			.data(cells, function (cell) {
				return cell.node.id;
			});

		groups.exit().remove();

		// A frame is drawn where it belongs the moment it appears, and only moves from there.
		const entered = groups.enter().append('g').attr('class', 'profile-frame');
		entered
			.append('rect')
			.attr('rx', 2)
			.attr('ry', 2)
			.attr('x', function (cell) {
				return cell.x;
			})
			.attr('y', function (cell) {
				return self._rowY(cells, cell, rowHeight);
			})
			.attr('width', function (cell) {
				return Math.max(1, cell.width - 1);
			});
		entered.append('title');
		entered
			.append('text')
			.attr('font-family', LabelFont)
			.attr('fill', 'rgb(0,0,0)')
			.attr('pointer-events', 'none')
			.attr('x', function (cell) {
				return cell.x + 3;
			})
			.attr('y', function (cell) {
				return self._labelY(cells, cell, rowHeight, fontSize);
			});

		const merged = entered.merge(groups);
		merged
			.on('mouseover', function (event, cell) {
				self._showDetail(cell.node);
			})
			.on('click', function (event, cell) {
				// Clicking a frame the view is already inside zooms back out to it, so the bar
				// along the bottom takes you all the way out.
				self._zoomNode = cell.node === self._baseNode() ? null : cell.node;
				self._scheduleRedraw();
			});

		merged
			.select('rect')
			.attr('fill', function (cell) {
				if (self._searchPattern && self._searchPattern.test(cell.node.name)) {
					// The magenta the flamegraph tools mark a search hit with.
					return 'rgb(230,0,230)';
				}
				return self._colourFor(cell.node);
			})
			// The gap that separates one row from the next is worth a pixel only while the rows are
			// tall enough to spare it. Squeezed rows are drawn solid instead.
			.attr('height', rowHeight >= 8 ? rowHeight - 1 : rowHeight)
			.transition()
			.duration(250)
			.ease(d3.easeLinear)
			.attr('x', function (cell) {
				return cell.x;
			})
			.attr('y', function (cell) {
				return self._rowY(cells, cell, rowHeight);
			})
			.attr('width', function (cell) {
				return Math.max(1, cell.width - 1);
			});

		merged.select('title').text(function (cell) {
			return self._describe(cell.node);
		});

		merged
			.select('text')
			.attr('font-size', fontSize ? fontSize + 'px' : null)
			.text(function (cell) {
				return fontSize
					? self._label(cell.node.name, cell.width, charWidth)
					: '';
			})
			.transition()
			.duration(250)
			.ease(d3.easeLinear)
			.attr('x', function (cell) {
				return cell.x + 3;
			})
			.attr('y', function (cell) {
				return self._labelY(cells, cell, rowHeight, fontSize);
			});
	},

	// The whole picture fits the window unless the reader has asked for full rows and a scrollbar.
	_rowHeight: function (container, rowCount) {
		if (!this._fitHeight) {
			return RowHeight;
		}
		const room = Math.floor(
			(container.clientHeight - 2) / Math.max(1, rowCount),
		);
		return Math.max(MinRowHeight, Math.min(RowHeight, room));
	},

	// The size the labels are drawn at, which follows the row height so a squeezed row still says
	// what it is. Zero means the row is too short for a word anyone could read.
	_labelFontSize: function (rowHeight) {
		const size = Math.min(LabelFontSize, rowHeight - 2);
		return size >= MinLabelFontSize ? size : 0;
	},

	// As much of the name as fits inside the frame, cut short with two dots.
	_label: function (name, width, charWidth) {
		const room = Math.floor((width - 6) / charWidth);
		if (room < 3) {
			return '';
		}
		return name.length <= room ? name : name.substring(0, room - 1) + '..';
	},

	_describe: function (node) {
		const root = this._root;
		const percent = root.value > 0 ? (100 * node.value) / root.value : 0;
		const ofParent =
			node.parent && node.parent.value > 0
				? (100 * node.value) / node.parent.value
				: 100;
		return (
			node.name +
			'\n' +
			node.value +
			' ' +
			_('samples') +
			', ' +
			percent.toFixed(2) +
			'% ' +
			_('of total') +
			', ' +
			ofParent.toFixed(2) +
			'% ' +
			_('of parent') +
			', ' +
			node.self +
			' ' +
			_('in this frame itself')
		);
	},

	_showDetail: function (node) {
		document.getElementById('profile-detail').textContent = this._describe(
			node,
		).replace('\n', ' -- ');
	},

	_setButtons: function () {
		const running = this._state === 'priming' || this._state === 'running';
		document.getElementById('profile-start').disabled =
			running || (this._availability && !this._availability.available);
		document.getElementById('profile-stop').disabled = !running;
	},

	_updateStatus: function (message) {
		const parts = [];
		if (this._capture) {
			parts.push(this._capture.filename + ' (' + this._capture.pid + ')');
		}
		if (this._totals.startedAt) {
			parts.push(
				Math.round((Date.now() - this._totals.startedAt) / 1000) + 's',
			);
		}
		parts.push(this._totals.samples + ' ' + _('samples'));
		parts.push(this._totals.idle + ' ' + _('idle'));
		if (this._totals.dropped) {
			parts.push(this._totals.dropped + ' ' + _('dropped'));
		}
		if (this._totals.frames) {
			const unresolved = (100 * this._totals.unresolved) / this._totals.frames;
			parts.push(unresolved.toFixed(1) + '% ' + _('frames without a name'));
		}
		if (this._totals.interval) {
			parts.push(this._totals.interval + 'ms');
		}
		if (this._totals.truncated) {
			parts.push(_('Some stacks were left out of this update'));
		}
		if (message) {
			parts.push(message);
		}

		document.getElementById('profile-status').textContent = parts.join(' -- ');
	},

	// Downloads.

	_foldedText: function () {
		const lines = [];
		const walk = function (node, prefix) {
			const name = prefix ? prefix + ';' + node.name : node.name;
			if (node.self > 0 && name) {
				lines.push(name + ' ' + node.self);
			}
			for (let i = 0; i < node.children.length; i++) {
				walk(node.children[i], name);
			}
		};

		for (let t = 0; t < this._root.children.length; t++) {
			walk(this._root.children[t], '');
		}

		return lines.join('\n') + '\n';
	},

	_download: function (text, type, extension) {
		const name =
			'profile-' +
			(this._capture ? this._capture.pid : 'stacks') +
			'-' +
			new Date().toISOString().replace(/[:.]/g, '-') +
			extension;
		const url = URL.createObjectURL(new Blob([text], { type: type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		URL.revokeObjectURL(url);
	},

	_onDownloadFolded: function () {
		this._download(this._foldedText(), 'text/plain', '.folded');
	},

	_onDownloadSvg: function () {
		this._download(this._standaloneSvg(), 'image/svg+xml', '.svg');
	},

	// A file laid out like the one the flamegraph tools write, and readable on its own: the whole
	// accumulated tree rather than the part currently on screen, a title and a details line, and
	// enough script for a click to zoom and for a search to mark and count its hits.
	_standaloneSvg: function () {
		const width = 1200;
		const cells = this._cells(this._root, width - 2 * SvgPad);
		const height = cells.rowCount * RowHeight + SvgHeadHeight + SvgFootHeight;
		const title =
			(this._capture
				? this._capture.filename + ' (' + this._capture.pid + ')'
				: 'Collabora Online') +
			', ' +
			this._root.value +
			' samples';

		const parts = [];
		parts.push(
			'<?xml version="1.0" standalone="no"?>',
			'<svg xmlns="http://www.w3.org/2000/svg" ' +
				'xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ' +
				'width="' +
				width +
				'" height="' +
				height +
				'" ' +
				'viewBox="0 0 ' +
				width +
				' ' +
				height +
				'">',
			'<defs><linearGradient id="background" y1="0" y2="1" x1="0" x2="0">' +
				'<stop stop-color="#eeeeee" offset="5%"/>' +
				'<stop stop-color="#eeeeb0" offset="95%"/></linearGradient></defs>',
			'<style type="text/css">' +
				'text { font-family: ' +
				LabelFont +
				'; font-size: ' +
				LabelFontSize +
				'px; fill: rgb(0,0,0); }' +
				'#title { text-anchor: middle; font-size: 17px; }' +
				'#details, #unzoom, #search, #matched { text-anchor: start; }' +
				'#unzoom, #search { fill: rgb(0,0,128); cursor: pointer; }' +
				'#matched { text-anchor: end; }' +
				'.hide { display: none; }' +
				'.frame text { pointer-events: none; }' +
				'.frame:hover rect { stroke: rgb(0,0,0); stroke-width: 0.5; }' +
				'#frames { cursor: pointer; }' +
				'</style>',
			'<rect x="0" y="0" width="' +
				width +
				'" height="' +
				height +
				'" fill="url(#background)"/>',
			'<text id="title" x="' +
				width / 2 +
				'" y="24">' +
				this._escapeXml(title) +
				'</text>',
			'<text id="unzoom" class="hide" x="' +
				SvgPad +
				'" y="24">Reset Zoom</text>',
			'<text id="search" x="' +
				(width - SvgPad - 260) +
				'" y="24">Search</text>',
			// Beside the Search link rather than along the bottom, where a tall picture would put
			// it off the screen.
			'<text id="matched" x="' + (width - SvgPad) + '" y="24"> </text>',
			'<text id="details" x="' +
				SvgPad +
				'" y="' +
				(height - 10) +
				'"> </text>',
			'<g id="frames">',
		);

		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];
			const node = cell.node;
			const rectWidth = Math.max(1, cell.width - 1);
			const top = this._rowY(cells, cell, RowHeight) + SvgHeadHeight;
			parts.push(
				'<g class="frame" data-name="' + this._escapeXml(node.name) + '">',
				'<title>' +
					this._escapeXml(this._describe(node).replace('\n', ' -- ')) +
					'</title>',
				'<rect x="' +
					(cell.x + SvgPad).toFixed(2) +
					'" y="' +
					top +
					'" width="' +
					rectWidth.toFixed(2) +
					'" height="' +
					(RowHeight - 1) +
					'" rx="2" ry="2" fill="' +
					this._colourFor(node) +
					'"/>',
				'<text x="' +
					(cell.x + SvgPad + 3).toFixed(2) +
					'" y="' +
					(top + RowHeight - 5) +
					'">' +
					this._escapeXml(this._label(node.name, rectWidth, CharWidth)) +
					'</text>',
				'</g>',
			);
		}

		parts.push(
			'</g>',
			'<script type="text/ecmascript"><![CDATA[',
			SvgScript,
			']]></script>',
			'</svg>',
		);
		return parts.join('\n') + '\n';
	},

	_escapeXml: function (text) {
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	},
});

Admin.Flamegraph = function (host) {
	return new AdminSocketFlamegraph(host);
};
