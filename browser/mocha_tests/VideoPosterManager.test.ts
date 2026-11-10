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

describe('VideoPosterManager', function () {
	// The messages of the map the class listens for, by name, so a test can
	// hand it one as the map would.
	let listeners: Map<string, (e: any) => void>;
	// The listeners the class put on the app events, by name.
	let appListeners: Map<string, (e: any) => void>;
	// The posters the class handed to the uploader: the id of each video.
	let posted: number[];
	// The videos the class asked a frame of, by url.
	let captured: string[];
	let editable: boolean;
	let manager: VideoPosterManager;
	let map: any;
	let savedEvents: any;
	let savedTimers: any;

	function deliver(name: string, message: any): void {
		const listener = listeners.get(name);
		nodeassert.ok(listener, 'nothing listens for ' + name);
		listener(message);
	}

	function video(id: number, hasPoster: boolean, mimeType?: string): any {
		return {
			id: id,
			url: 'media/' + String(id),
			hasPoster: hasPoster,
			mimeType: mimeType,
			loop: false,
			mute: false,
			x: 0,
			y: 0,
			width: 1000,
			height: 1000,
		};
	}

	function info(videos: any[], masterVideos: any[] = []): any {
		return { slides: [{ videos: videos, masterVideos: masterVideos }] };
	}

	// The document is open and the delay before the first capture is over.
	function documentIsOpen(): void {
		deliver('docloaded', { status: true });
	}

	beforeEach(function () {
		listeners = new Map();
		appListeners = new Map();
		posted = [];
		captured = [];
		editable = true;

		map = {
			on: function (name: string, callback: any, context: any) {
				listeners.set(name, callback.bind(context));
			},
			fire: function (name: string, args: any) {
				if (name === 'videoposter') posted.push(args.id);
			},
			isEditMode: () => editable,
			getDocType: () => 'presentation',
		};

		savedEvents = app.events;
		savedTimers = app.timerRegistry;
		(app as any).events = {
			on: (name: string, callback: any) => appListeners.set(name, callback),
			fire: () => undefined,
		};
		// Timers run at once, so the delay before the first capture is over
		// as soon as the document is open.
		(app as any).timerRegistry = {
			setTimeout: (name: string, callback: () => void) => {
				callback();
				return 1;
			},
			clearTimeout: () => undefined,
		};

		manager = new VideoPosterManager(map);
		// The frame comes back at once, as a small blob, and the url is noted.
		manager.captureFrame = (url: string) => {
			captured.push(url);
			return Promise.resolve(new Blob(['frame'], { type: 'image/jpeg' }));
		};
	});

	afterEach(function () {
		(app as any).events = savedEvents;
		(app as any).timerRegistry = savedTimers;
	});

	// The captures end on the next turn of the event loop.
	function settled(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, 0));
	}

	it('takes the poster time one second in, or at the middle of a short video', function () {
		nodeassert.strictEqual(VideoPosterManager.posterTime(5), 1);
		nodeassert.strictEqual(VideoPosterManager.posterTime(2), 1);
		nodeassert.strictEqual(VideoPosterManager.posterTime(1.5), 0.75);
		nodeassert.strictEqual(VideoPosterManager.posterTime(NaN), 0.5);
		nodeassert.strictEqual(VideoPosterManager.posterTime(Infinity), 0.5);
		nodeassert.strictEqual(VideoPosterManager.posterTime(0), 0.5);
	});

	it('captures every video without a poster, slide and master videos alike', async function () {
		documentIsOpen();
		deliver(
			'presentationinfo',
			info([video(1, false), video(2, true)], [video(3, false)]),
		);
		await settled();
		await settled();
		nodeassert.deepStrictEqual(captured, ['media/1', 'media/3']);
		nodeassert.deepStrictEqual(posted, [1, 3]);
	});

	it('captures a video once, whatever the info says again', async function () {
		documentIsOpen();
		deliver('presentationinfo', info([video(1, false)]));
		await settled();
		deliver('presentationinfo', info([video(1, false)]));
		await settled();
		nodeassert.deepStrictEqual(captured, ['media/1']);
		nodeassert.deepStrictEqual(posted, [1]);
	});

	it('leaves a video alone while the view may not edit, and captures it once it may', async function () {
		editable = false;
		documentIsOpen();
		deliver('presentationinfo', info([video(1, false)]));
		await settled();
		nodeassert.deepStrictEqual(captured, []);

		editable = true;
		const onPermission = appListeners.get('updatepermission');
		nodeassert.ok(onPermission, 'nothing listens for updatepermission');
		onPermission({ detail: { perm: 'edit' } });
		await settled();
		nodeassert.deepStrictEqual(posted, [1]);
	});

	it('drops a frame when another view gave the video a poster meanwhile', async function () {
		let finish: (blob: Blob | null) => void = () => undefined;
		manager.captureFrame = () =>
			new Promise<Blob | null>((resolve) => {
				finish = resolve;
			});
		documentIsOpen();
		deliver('presentationinfo', info([video(1, false)]));
		deliver('presentationinfo', info([video(1, true)]));
		finish(new Blob(['frame'], { type: 'image/jpeg' }));
		await settled();
		nodeassert.deepStrictEqual(posted, []);
	});

	it('skips a video this browser cannot play', async function () {
		const savedCanPlay = VideoPosterManager.canPlay;
		(VideoPosterManager as any).canPlay = (mimeType: string) =>
			mimeType !== 'video/ogg';
		try {
			documentIsOpen();
			deliver(
				'presentationinfo',
				info([video(1, false, 'video/ogg'), video(2, false, 'video/webm')]),
			);
			await settled();
			nodeassert.deepStrictEqual(captured, ['media/2']);
		} finally {
			(VideoPosterManager as any).canPlay = savedCanPlay;
		}
	});

	it('waits for the document before it captures', async function () {
		deliver('presentationinfo', info([video(1, false)]));
		await settled();
		nodeassert.deepStrictEqual(captured, []);
		documentIsOpen();
		await settled();
		nodeassert.deepStrictEqual(captured, ['media/1']);
	});
});
