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
 * VideoPosterManager gives the videos of a presentation a preview image. The
 * engine cannot play a video, so a video inserted here shows a placeholder in
 * the tiles, the slide previews and the saved file. This view plays the video
 * for a moment, takes the frame at one second, or at the middle of a shorter
 * video, since the first frame of many videos is black, and sends it to the
 * engine, which keeps the first image it is given for a video.
 */

class VideoPosterManager {
	// The longer side of the image sent, in pixels. A frame of a large video
	// is scaled down to it, so the image stays small in the file.
	public static readonly maxPosterSide = 1280;
	// How long one capture may take before it is given up.
	public static readonly captureTimeoutMs = 15000;
	// How long after the document is loaded the first capture starts, so the
	// video decoding does not compete with the first paint.
	public static readonly startDelayMs = 3000;

	private _map: any;
	private _presentationInfo: any = null;
	// The videos that were tried, whether or not an image came of it. A
	// video is tried once in a session.
	private _attempted: Set<number> = new Set();
	// The videos waiting for their turn, oldest first.
	private _queue: VideoInfo[] = [];
	private _capturing: boolean = false;
	private _started: boolean = false;
	private _startTimer: any = null;

	constructor(map: any) {
		this._map = map;
		map.on('docloaded', this._onDocLoaded, this);
		map.on('presentationinfo', this._onPresentationInfo, this);
		app.events.on('updatepermission', this._onUpdatePermission.bind(this));
	}

	// Where in the video the frame is taken, in seconds: one second in, or
	// the middle of a video shorter than two seconds. A video whose length is
	// not known yet gets half a second.
	public static posterTime(duration: number): number {
		if (!Number.isFinite(duration) || duration <= 0) return 0.5;
		return duration < 2 ? duration / 2 : 1;
	}

	// Whether this view takes part at all: an editing view of a presentation
	// or drawing in a browser. The engine stores the image, which a read-only
	// view may not ask for. The apps, mobile and desktop, send a file inside a
	// message rather than as an upload, so they take no part either.
	private _mayCapture(): boolean {
		if (window.ThisIsAnApp) return false;
		const docType = this._map.getDocType();
		if (docType !== 'presentation' && docType !== 'drawing') return false;
		return this._map.isEditMode();
	}

	private _onDocLoaded(e: any) {
		if (e && e.status === false) {
			this._abort();
			return;
		}
		if (this._started || this._startTimer) return;
		this._startTimer = app.timerRegistry.setTimeout(
			'videoposter',
			() => {
				this._startTimer = null;
				this._started = true;
				this._scan();
			},
			VideoPosterManager.startDelayMs,
		);
	}

	private _onPresentationInfo(info: any) {
		this._presentationInfo = info;
		if (this._started) this._scan();
	}

	private _onUpdatePermission(e: any) {
		if (e && e.detail && e.detail.perm === 'edit') {
			if (this._started) this._scan();
		} else {
			this._abort();
		}
	}

	// Drops what waits; a capture under way is dropped once it ends, since
	// the image is checked again before it is sent.
	private _abort() {
		this._queue = [];
		if (this._startTimer) {
			app.timerRegistry.clearTimeout(this._startTimer);
			this._startTimer = null;
		}
	}

	// All the videos the presentation info lists, slide and master videos,
	// each once.
	private _videos(): VideoInfo[] {
		const videos: VideoInfo[] = [];
		const seen = new Set<number>();
		const slides = this._presentationInfo?.slides || [];
		for (const slide of slides) {
			for (const list of [slide.videos, slide.masterVideos]) {
				for (const video of list || []) {
					if (seen.has(video.id)) continue;
					seen.add(video.id);
					videos.push(video);
				}
			}
		}
		return videos;
	}

	// The video with this id as the latest presentation info describes it.
	private _videoOf(id: number): VideoInfo | undefined {
		return this._videos().find((video) => video.id === id);
	}

	// Queues every video that has no image yet and was not tried, and starts
	// on the first.
	private _scan() {
		if (!this._mayCapture()) return;
		for (const video of this._videos()) {
			if (video.hasPoster || this._attempted.has(video.id)) continue;
			if (video.mimeType && !VideoPosterManager.canPlay(video.mimeType))
				continue;
			this._attempted.add(video.id);
			this._queue.push(video);
		}
		this._next();
	}

	// Whether this browser plays the kind of video. The engine does not know
	// the kind, so the server names it by the file.
	public static canPlay(mimeType: string): boolean {
		const video = document.createElement('video');
		return video.canPlayType(mimeType) !== '';
	}

	private _next() {
		if (this._capturing) return;
		const video = this._queue.shift();
		if (!video) return;
		this._capturing = true;
		this.captureFrame(video.url)
			.catch(() => null)
			.then((blob: Blob | null) => {
				this._capturing = false;
				this._send(video.id, blob);
				this._next();
			});
	}

	// Sends the image, unless another view gave the video one meanwhile, or
	// this view may no longer change the document.
	private _send(id: number, blob: Blob | null) {
		if (!blob || !this._mayCapture()) return;
		const current = this._videoOf(id);
		if (!current || current.hasPoster) return;
		const file = new File([blob], 'poster-' + String(id) + '.jpg', {
			type: 'image/jpeg',
		});
		this._map.fire('videoposter', { file: file, id: id });
	}

	// The frame of the video at the poster time, as a JPEG no larger than
	// maxPosterSide, or null when the video cannot be played here or takes
	// too long.
	public captureFrame(url: string): Promise<Blob | null> {
		return new Promise<Blob | null>((resolve) => {
			const video = document.createElement('video');
			video.muted = true;
			video.playsInline = true;
			video.preload = 'auto';
			// A same-origin video needs no permission to be drawn; a cross
			// origin one is drawable only with the server's consent.
			if (new URL(url, location.href).origin !== location.origin)
				video.crossOrigin = 'anonymous';

			let done = false;
			const finish = (blob: Blob | null) => {
				if (done) return;
				done = true;
				app.timerRegistry.clearTimeout(timer);
				video.removeAttribute('src');
				video.load();
				resolve(blob);
			};
			const timer = app.timerRegistry.setTimeout(
				'videoposter',
				() => finish(null),
				VideoPosterManager.captureTimeoutMs,
			);

			video.addEventListener('error', () => finish(null));
			video.addEventListener('loadedmetadata', () => {
				if (video.videoWidth === 0) {
					finish(null);
					return;
				}
				video.currentTime = VideoPosterManager.posterTime(video.duration);
			});
			video.addEventListener('seeked', () => {
				if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
					video.addEventListener(
						'loadeddata',
						() => this._draw(video, finish),
						{
							once: true,
						},
					);
					return;
				}
				this._draw(video, finish);
			});
			video.src = url;
		});
	}

	private _draw(video: HTMLVideoElement, finish: (blob: Blob | null) => void) {
		const scale = Math.min(
			1,
			VideoPosterManager.maxPosterSide /
				Math.max(video.videoWidth, video.videoHeight),
		);
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
		canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
		try {
			const context = canvas.getContext('2d');
			if (!context) {
				finish(null);
				return;
			}
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			// A frame of a video from another origin cannot be read back.
			canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.85);
		} catch (error) {
			finish(null);
		}
	}
}
