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
    // Child 1 is a 2x2 table whose cells are empty, apart from B1, and the text of a row or of the
    // table separates even empty cells and rows with a newline:
    const body = DocumentApp.getActiveDocument().getBody();
    const table = body.getChild(1);
    console.assert(table.getRow(0).getText() === '\nB1');
    console.assert(table.getRow(1).getText() === '\n');
    console.assert(table.getText() === '\nB1\n\n');
    console.assert(body.getText() === 'Before\n\nB1\n\n\nAfter');
}
