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

const RowHeight = 18;
const MinDrawnWidth = 1.5;
const MaxFramesPerSecond = 4;

const AdminSocketFlamegraph = AdminSocketBase.extend({
	constructor: function (host) {
		this.base(host);

		// Frame labels by the number the server interns them as.
		this._names = [];
		this._nextNodeId = 1;
		this._root = this._makeNode('', null);
		this._documents = {};
		this._capture = null;
		this._state = 'idle';
		this._frozen = false;
		this._zoomNode = null;
		this._threadFilter = '';
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
		this._root = this._makeNode('', null);
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
		this._scheduleRedraw();
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

	_viewRoot: function () {
		if (this._zoomNode) {
			return this._zoomNode;
		}
		if (this._threadFilter && this._root.byName[this._threadFilter]) {
			return this._root.byName[this._threadFilter];
		}
		return this._root;
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

	_cells: function (root, width) {
		const cells = [];
		const scale = root.value > 0 ? width / root.value : 0;

		const walk = function (node, left, depth) {
			const nodeWidth = node.value * scale;
			cells.push({
				node: node,
				x: left,
				y: depth * RowHeight,
				width: nodeWidth,
			});

			let childLeft = left;
			for (let i = 0; i < node.children.length; i++) {
				walk(node.children[i], childLeft, depth + 1);
				childLeft += node.children[i].value * scale;
			}
		};

		walk(root, 0, 0);
		return cells.filter(function (cell) {
			return cell.width >= MinDrawnWidth;
		});
	},

	_colourOf: function (name) {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
		}
		// Warm hues, so the picture reads as a flamegraph.
		return d3
			.hsl(20 + (hash % 40), 0.7, 0.45 + ((hash >> 8) % 20) / 100)
			.formatHex();
	},

	_render: function () {
		const container = document.getElementById('profile-graph');
		const svg = d3.select('#profile-svg');
		const width = container.clientWidth - 4;
		const root = this._viewRoot();
		const cells = this._cells(root, width);

		let depth = 0;
		for (let i = 0; i < cells.length; i++) {
			depth = Math.max(depth, cells[i].y / RowHeight);
		}
		svg.attr('height', (depth + 2) * RowHeight);

		const self = this;
		const groups = svg
			.selectAll('g.profile-frame')
			.data(cells, function (cell) {
				return cell.node.id;
			});

		groups.exit().remove();

		const entered = groups.enter().append('g').attr('class', 'profile-frame');
		entered
			.append('rect')
			.attr('height', RowHeight - 1)
			.attr('rx', 2);
		entered.append('title');
		entered
			.append('text')
			.attr('font-size', '11px')
			.attr('fill', '#FFFFFF')
			.attr('pointer-events', 'none');

		const merged = entered.merge(groups);
		merged
			.on('mouseover', function (event, cell) {
				self._showDetail(cell.node);
			})
			.on('click', function (event, cell) {
				self._zoomNode = cell.node;
				self._scheduleRedraw();
			});

		merged
			.select('rect')
			.attr('fill', function (cell) {
				if (self._searchPattern && self._searchPattern.test(cell.node.name)) {
					return '#3273DC';
				}
				return self._colourOf(cell.node.name);
			})
			.transition()
			.duration(250)
			.ease(d3.easeLinear)
			.attr('x', function (cell) {
				return cell.x;
			})
			.attr('y', function (cell) {
				return cell.y;
			})
			.attr('width', function (cell) {
				return Math.max(1, cell.width - 1);
			});

		merged.select('title').text(function (cell) {
			return self._describe(cell.node);
		});

		merged
			.select('text')
			.text(function (cell) {
				// About seven pixels per character at this font size.
				const room = Math.floor((cell.width - 6) / 7);
				if (room < 3) {
					return '';
				}
				return cell.node.name.length <= room
					? cell.node.name
					: cell.node.name.substring(0, room - 1) + '..';
			})
			.transition()
			.duration(250)
			.ease(d3.easeLinear)
			.attr('x', function (cell) {
				return cell.x + 3;
			})
			.attr('y', function (cell) {
				return cell.y + RowHeight - 5;
			});
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
		const svg = document.getElementById('profile-svg').cloneNode(true);
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('font-family', 'monospace');
		this._download(
			new XMLSerializer().serializeToString(svg),
			'image/svg+xml',
			'.svg',
		);
	},
});

Admin.Flamegraph = function (host) {
	return new AdminSocketFlamegraph(host);
};
