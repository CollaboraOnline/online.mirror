/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { existsSync, mkdirSync, rmdirSync, statSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import {
	copyFixture,
	fillAndAcceptSave,
	openFixture,
} from '../lib/file-dialog.js';
import * as draft from '../lib/draft.js';
import { readZipEntry } from '../lib/zip.js';

// Save As writes the document with its edits to the file that the user picks
// in the Save dialog. A Save As that cannot write its file tells the user so,
// and the edits stay. The old file is not checked: the apps save the document
// on their own, so the old file can get the edits too.

const we = (): WebdriverIO.Browser & {
	waitForCondition(
		predicate: () => boolean,
		opts?: { timeout?: number; interval?: number; timeoutMsg?: string },
	): Promise<boolean>;
} => browser.webEngine;

const EDIT_TEXT = 'saveasedit';

let targetCount = 0;

function documentPath(name: string): string {
	return join(process.env.CODA_TEST_DOCUMENTS_DIR!, name);
}

function uniqueName(extension: string): string {
	targetCount++;
	return `save-as-${process.pid}-${targetCount}.${extension}`;
}

// CODA-Q and CODA-W load the saved file into the tab, and CODA-M keeps the
// page and gives the window the new file.
function reloadsAfterSaveAs(): boolean {
	return ['qt', 'windows'].includes(process.env.CODA_PLATFORM ?? 'qt');
}

async function isModified(): Promise<boolean> {
	return we().execute(() => app.file.modified === true);
}

// Existing documents open in the read-only view mode; switch to edit mode so
// editing commands are enabled.
async function enterEditMode(): Promise<void> {
	await we().execute(() => {
		if (!app.map.isEditMode()) app.map._enterEditMode('edit');
	});
	await we().waitUntil(async () => we().execute(() => app.map.isEditMode()), {
		timeout: 15000,
		interval: 200,
		timeoutMsg: 'document did not enter edit mode',
	});
}

async function makeModified(): Promise<void> {
	await we().execute((text) => {
		app.map.sendUnoCommand('.uno:InsertText', {
			Text: { type: 'string', value: text },
		});
	}, EDIT_TEXT);
	await we().waitUntil(isModified, {
		timeout: 15000,
		interval: 250,
		timeoutMsg: 'the edit did not mark the document modified',
	});
}

// Open a fresh copy of simple.odt and edit it. Answers the path of its file.
async function openModified(): Promise<string> {
	const name = copyFixture('simple.odt');
	await openFixture(browser.webEngine, browser.native, name);
	await enterEditMode();
	await makeModified();
	return documentPath(name);
}

// Whether the file holds the edit. A file that is still being written, or
// not there yet, does not.
function holdsEdit(path: string): boolean {
	try {
		const content = readZipEntry(path, 'content.xml');
		return content !== null && content.toString().includes(EDIT_TEXT);
	} catch {
		return false;
	}
}

// The dialog that tells the user that the Save As failed. CODA-Q and CODA-W
// offer Save As again in a prompt. CODA-M shows the error of the document.
function failureDialogId(): string {
	if (reloadsAfterSaveAs()) return 'modal-dialog-savefailed';
	return 'modal-dialog-cool_alert';
}

async function failureDialogText(): Promise<string | null> {
	return we().execute((id) => {
		const dialog = document.getElementById(id);
		return dialog ? dialog.textContent || '' : null;
	}, failureDialogId());
}

// Close the failure dialog with Cancel in the prompt, and with Close in the
// error, which has a button to copy its details too.
async function dismissFailureDialog(): Promise<void> {
	const label = reloadsAfterSaveAs() ? 'Cancel' : 'Close';
	const clicked = await we().execute(
		(id, text) => {
			const button = Array.from(
				document.getElementById(id)!.querySelectorAll('button'),
			).find((b) => (b.textContent || '').trim() === text);
			if (!button) return false;
			button.click();
			return true;
		},
		failureDialogId(),
		label,
	);
	expect(clicked).toBe(true);
	await we().waitUntil(async () => (await failureDialogText()) === null, {
		timeout: 10000,
		interval: 250,
		timeoutMsg: 'the dialog about the failed Save As did not close',
	});
}

describe('Save As', () => {
	before(async () => {
		// The spec can be the first of the session, which can then begin on the
		// tab strip page, where the Open command does nothing.
		await draft.switchToAnyDocumentPage(browser.webEngine);
	});

	it('writes the edits to the chosen file', async function () {
		this.timeout(120000);
		await openModified();
		const name = uniqueName('odt');
		const target = documentPath(name);

		// The Save dialog is modal, so the command is posted after execute()
		// returns.
		await we().execute(() => {
			setTimeout(() => {
				window.postMobileMessage('uno .uno:SaveAs');
			}, 100);
		});
		await fillAndAcceptSave(browser.native, target);

		// A Save As that fails shows why, so the wait ends there with that text.
		let failure: string | null = null;
		await we().waitUntil(
			async () => {
				failure = await failureDialogText();
				return failure !== null || holdsEdit(target);
			},
			{
				timeout: 30000,
				interval: 250,
				timeoutMsg: `Save As did not write the edits to ${target}`,
			},
		);
		expect(failure).toBeNull();

		if (reloadsAfterSaveAs()) {
			await we().waitUntil(
				async () =>
					we().execute(
						(fileName) =>
							typeof app !== 'undefined' &&
							!!app.map &&
							app.map._docLoaded === true &&
							document.title.indexOf(fileName) !== -1,
						name,
					),
				{
					timeout: 30000,
					interval: 250,
					timeoutMsg: 'the tab did not load the new file',
				},
			);
		}
		await we().waitUntil(async () => !(await isModified()), {
			timeout: 15000,
			interval: 250,
			timeoutMsg: 'the document is still modified after Save As',
		});
	});

	it('tells the user when it cannot write the file, and keeps the edits', async function () {
		this.timeout(120000);
		await openModified();

		// A folder with the name of the target, so the engine cannot write the
		// file on any platform. The Save dialogs of Windows and macOS may check
		// that a target can be written before the app sees it, so the test
		// gives the document the command that the Save dialog gives it.
		const name = uniqueName('odt');
		const target = documentPath(name);
		mkdirSync(target);

		try {
			await we().execute((url) => {
				app.socket.sendMessage('saveas url=' + url + ' format=odt options=');
			}, pathToFileURL(target).href);

			await we().waitUntil(async () => (await failureDialogText()) !== null, {
				timeout: 30000,
				interval: 250,
				timeoutMsg: 'nothing told the user that the Save As failed',
			});
			if (reloadsAfterSaveAs())
				expect(await failureDialogText()).toContain(name);

			await dismissFailureDialog();
			expect(await isModified()).toBe(true);
			expect(statSync(target).isDirectory()).toBe(true);

			// The edits still go to the file of the document, and nothing is left
			// unsaved for the app to ask about when it quits.
			await we().execute(() => {
				app.map.save(false, false);
			});
			await we().waitUntil(async () => !(await isModified()), {
				timeout: 20000,
				interval: 250,
				timeoutMsg: 'the save after the failed Save As did not complete',
			});
		} finally {
			if (existsSync(target) && statSync(target).isDirectory())
				rmdirSync(target);
		}
	});
});
