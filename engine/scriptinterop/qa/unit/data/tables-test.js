/* -*- fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// GAS doesn't have console.assert:
if (!globalThis.cool) {
    console.assert = console.assert || (cond => { if (!cond) throw new Error('failed: ' + cond); });
}

function test() {
    const body = DocumentApp.getActiveDocument().getBody();

    // Child 1 is a 2x2 table whose cells are empty, apart from B1, and the text of a row or of the
    // table separates even empty cells and rows with a newline:
    const empty = body.getChild(1);
    console.assert(empty.getRow(0).getText() === '\nB1');
    console.assert(empty.getRow(1).getText() === '\n');
    console.assert(empty.getText() === '\nB1\n\n');

    // Child 3 is a 2x2 table whose first column is one vertically merged cell, holding "Merged" and
    // a footnote reference, and the covered cell below it has no text:
    const merged = body.getChild(3);
    console.assert(merged.getText() === 'Merged\nB1\n\nB2');
    console.assert(merged.getRow(0).getCell(0).getText() === 'Merged');
    console.assert(merged.getRow(1).getCell(0).getText() === '');
    console.assert(merged.getRow(1).getCell(1).getText() === 'B2');

    // Cell A1 of child 5 starts with a nested table (on Google only after an empty paragraph, which
    // the conversion puts there) and ends with an empty paragraph:
    const nested = body.getChild(5);
    const cell = nested.getRow(0).getCell(0);
    const lead = globalThis.cool ? '' : '\n';
    if (globalThis.cool) {
        console.assert(cell.getChild(0).getType() === DocumentApp.ElementType.TABLE);
    }
    console.assert(cell.getText() === lead + 'N1\nN2\n');
    console.assert(nested.getRow(0).getText() === lead + 'N1\nN2\n\nB1');

    console.assert(
        body.getText() === 'Before\n\nB1\n\n\nBetween\nMerged\nB1\n\nB2\nBetween\n' + lead
            + 'N1\nN2\n\nB1\nAfter');
}
