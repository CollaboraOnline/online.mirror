/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, parse } from 'path';
import * as webview from './webview.js';

let fixtureCopies = 0;

/**
 * Copy a fixture to a new name in the test documents directory, and
 * return that name.
 *
 * Opening a file that is already open activates its window or tab
 * instead of opening it again, so a test that needs a document of its
 * own opens a copy.
 */
export function copyFixture(fixture: string): string {
	fixtureCopies++;
	const { name, ext } = parse(fixture);
	const copy = `${name}-copy-${process.pid}-${fixtureCopies}${ext}`;
	const dir = process.env.CODA_TEST_DOCUMENTS_DIR!;
	copyFileSync(join(dir, fixture), join(dir, copy));
	return copy;
}

/**
 * On Qt the selectors target QFileDialog's accessibility IDs, the same
 * dialog in open and save mode.  On macOS they target NSOpenPanel by
 * Obj-C class plus an "Open" button by title.  On Windows they target
 * the control IDs of the common file dialog: 1148 is the file name box
 * and 1 the Open button.
 */
const FILE_DIALOG_SELECTORS: { [platform: string]: { file: string; open: string } } = {
	qt: {
		file: '//*[@accessibility-id="QApplication.QFileDialog.fileNameEdit"]',
		open: '//*[@accessibility-id="QApplication.QFileDialog.buttonBox.QPushButton"]',
	},
	macos: {
		file: '//*[@accessibility-id="open-panel"]',
		open: '//*[@accessibility-id="OKButton"]',
	},
	windows: {
		file: '//*[@accessibility-id="1148"]',
		open: '//*[@accessibility-id="1"]',
	},
};

const qtFileNameSel = FILE_DIALOG_SELECTORS.qt.file;

export async function fillAndAccept(
	native: WebdriverIO.Browser,
	filePath: string,
): Promise<void> {
	const { file: fileSel, open: acceptSel } =
		FILE_DIALOG_SELECTORS[process.env.CODA_PLATFORM || 'qt'];

	const fileTarget = await native.$(fileSel);
	await fileTarget.waitForExist({ timeout: 10000 });
	await fileTarget.setValue(filePath);

	const acceptBtn = await native.$(acceptSel);
	await acceptBtn.waitForExist({ timeout: 5000 });
	await acceptBtn.click();
}

/**
 * The Save dialog of each platform. On Qt it is the same QFileDialog as for
 * Open, and the name starts with a slash because the dialog shows the name of
 * the document there already; the dialog folds the doubled slash. On macOS it
 * is the NSSavePanel of NSDocument, which starts in the folder of the
 * document, so it gets the file name alone. On Windows it is the common Save
 * dialog: 1001 is its file name box, 1 the Save button and 2 the Cancel
 * button.
 */
const SAVE_DIALOG: {
	[platform: string]: {
		file: string;
		save: string;
		cancel: string;
		text: (path: string) => string;
	};
} = {
	qt: {
		file: FILE_DIALOG_SELECTORS.qt.file,
		save: FILE_DIALOG_SELECTORS.qt.open,
		cancel:
			'//*[@accessibility-id="QApplication.QFileDialog.buttonBox.QPushButton" and @name="Cancel"]',
		text: (path) => '/' + path,
	},
	macos: {
		file: '//*[@accessibility-id="saveAsNameTextField"]',
		save: '//*[@accessibility-id="OKButton"]',
		cancel: '//*[@accessibility-id="CancelButton"]',
		text: (path) => parse(path).base,
	},
	windows: {
		file: '//*[@accessibility-id="1001"]',
		save: '//*[@accessibility-id="1"]',
		cancel: '//*[@accessibility-id="2"]',
		text: (path) => path,
	},
};

/**
 * Fill in the Save dialog with a path in the folder of the document, and save.
 */
export async function fillAndAcceptSave(
	native: WebdriverIO.Browser,
	filePath: string,
): Promise<void> {
	const dialog = SAVE_DIALOG[process.env.CODA_PLATFORM || 'qt'];

	const fileTarget = await native.$(dialog.file);
	await fileTarget.waitForExist({ timeout: 10000 });
	await fileTarget.setValue(dialog.text(filePath));

	const saveButton = await native.$(dialog.save);
	await saveButton.waitForExist({ timeout: 5000 });
	await saveButton.click();

	// A dialog that stays open blocks the app, so the page source of the
	// native user interface is kept for a look at what the dialog shows, and
	// the dialog is cancelled.
	try {
		await native.waitUntil(
			async () => (await native.$$(dialog.file)).length === 0,
			{
				timeout: 10000,
				interval: 500,
			},
		);
	} catch {
		const logDir = join(process.cwd(), 'logs');
		mkdirSync(logDir, { recursive: true });
		const sourcePath = join(logDir, `save-dialog-${Date.now()}.xml`);
		writeFileSync(sourcePath, await native.getPageSource());
		try {
			await (await native.$(dialog.cancel)).click();
		} catch {
			// The error below says what went wrong first.
		}
		throw new Error(
			`the Save dialog stayed open after Save; its page source is in ${sourcePath}`,
		);
	}
}

/**
 * Open a file from the test fixtures directory via the native file dialog.
 */
export async function openFixture(
	webEngine: WebdriverIO.Browser,
	native: WebdriverIO.Browser,
	fileName: string,
): Promise<string> {
	// Snapshot the current WebView handles BEFORE dispatching .uno:Open.
	// switchToNewWebView() below uses this snapshot to identify the
	// WebView created by this action; the native side may register it
	// at any point between now and the document load completing, so the
	// snapshot has to be taken up front.
	const beforeHandles = await webEngine.getWindowHandles();

	// Use setTimeout so execute() returns before the modal dialog blocks.
	await webEngine.execute(() => {
		setTimeout(() => {
			window.postMobileMessage('uno .uno:Open');
		}, 100);
	});

	await fillAndAccept(native, join(process.env.CODA_TEST_DOCUMENTS_DIR!, fileName));

	const newHandle = await webview.switchToNewWebView(webEngine, beforeHandles);

	await (webEngine as any).waitForCondition(
		() =>
			typeof app !== 'undefined' &&
			app.map &&
			app.map._docLoaded === true,
		{
			timeout: 45000,
			timeoutMsg: `Document did not load after opening ${fileName}`,
		},
	);

	return newHandle;
}

export async function isOpen(native: WebdriverIO.Browser): Promise<boolean> {
	return (await native.$$(qtFileNameSel)).length > 0;
}

export async function cancelSave(
	native: WebdriverIO.Browser,
	timeoutMsg: string,
): Promise<void> {
	await native.$(qtFileNameSel).waitForExist({ timeout: 10000, timeoutMsg });
	const cancelBtn = await native.$(
		'//*[@accessibility-id="QApplication.QFileDialog.buttonBox.QPushButton" and @name="Cancel"]',
	);
	await cancelBtn.click();
	await native.waitUntil(async () => !(await isOpen(native)), {
		timeout: 10000,
		timeoutMsg: 'the Save dialog did not close on Cancel',
	});
}
