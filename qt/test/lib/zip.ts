/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

/**
 * Return the contents of one entry of a ZIP file, such as content.xml of an
 * ODF document, or null when the file has no entry of that name.
 *
 * The specs run on Linux, macOS and Windows, and Windows has no unzip
 * program, so the entry is read here. Only the stored and the deflated
 * methods are handled, which are the two that ODF documents use.
 */
export function readZipEntry(
	zipPath: string,
	entryName: string,
): Buffer | null {
	const zip = readFileSync(zipPath);

	// The end of central directory record is the last 22 bytes, unless the
	// file has a comment after it.
	let end = zip.length - 22;
	while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
	if (end < 0) throw new Error(`${zipPath} is not a ZIP file`);

	const entryCount = zip.readUInt16LE(end + 10);
	let entry = zip.readUInt32LE(end + 16);
	for (let i = 0; i < entryCount; i++) {
		if (zip.readUInt32LE(entry) !== 0x02014b50)
			throw new Error(`${zipPath} has a broken central directory`);
		const method = zip.readUInt16LE(entry + 10);
		const compressedSize = zip.readUInt32LE(entry + 20);
		const nameLength = zip.readUInt16LE(entry + 28);
		const extraLength = zip.readUInt16LE(entry + 30);
		const commentLength = zip.readUInt16LE(entry + 32);
		const localHeader = zip.readUInt32LE(entry + 42);
		const name = zip.toString('utf8', entry + 46, entry + 46 + nameLength);

		if (name === entryName) {
			const dataStart =
				localHeader +
				30 +
				zip.readUInt16LE(localHeader + 26) +
				zip.readUInt16LE(localHeader + 28);
			const data = zip.subarray(dataStart, dataStart + compressedSize);
			if (method === 0) return Buffer.from(data);
			if (method === 8) return inflateRawSync(data);
			throw new Error(
				`${entryName} in ${zipPath} uses compression method ${method}`,
			);
		}
		entry += 46 + nameLength + extraLength + commentLength;
	}
	return null;
}
