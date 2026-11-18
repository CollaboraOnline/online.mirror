# -*- tab-width: 4; indent-tabs-mode: nil; py-indent-offset: 4 -*-
#
# Copyright the Collabora Office contributors.
#
# SPDX-License-Identifier: MPL-2.0
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

from uitest.framework import UITestCase
from uitest.uihelper.common import get_state_as_dict
from uitest.uihelper.area import get_fill_caption, select_fill, select_palette_color
from com.sun.star.awt import Size
from com.sun.star.drawing.FillStyle import NONE, SOLID

USE_BACKGROUND = "Use Background"

# The Use Background fill of a shape, which the Area dialog offers in the palette list.
class areaUseBackground(UITestCase):

    def close_template_dialog(self):
        xTemplateDialog = self.xUITest.getTopFocusWindow()
        self.ui_test.close_dialog_through_button(xTemplateDialog.getChild("close"))

    def insert_selected_rectangle(self, document):
        xShape = document.createInstance("com.sun.star.drawing.RectangleShape")
        document.DrawPages[0].add(xShape)
        xShape.Size = Size(5000, 3000)
        document.CurrentController.select(xShape)
        return xShape

    def selected_entry(self, dialog):
        return get_state_as_dict(dialog.getChild("paletteselector"))["SelectEntryText"]

    def test_ok_fills_with_the_slide_background(self):
        with self.ui_test.create_doc_in_start_center("impress") as document:
            self.close_template_dialog()
            xShape = self.insert_selected_rectangle(document)

            with self.ui_test.execute_dialog_through_command(".uno:FormatArea") as xDialog:
                select_fill(self, xDialog, "use background")
                self.assertEqual(USE_BACKGROUND, self.selected_entry(xDialog))
                self.assertEqual("Slide background", get_fill_caption(xDialog))

            self.assertEqual(NONE, xShape.FillStyle)
            self.assertTrue(xShape.FillUseSlideBackground)

    def test_cancel_keeps_the_fill(self):
        with self.ui_test.create_doc_in_start_center("impress") as document:
            self.close_template_dialog()
            xShape = self.insert_selected_rectangle(document)

            with self.ui_test.execute_dialog_through_command(
                    ".uno:FormatArea", close_button="cancel") as xDialog:
                select_fill(self, xDialog, "use background")

            self.assertEqual(SOLID, xShape.FillStyle)
            self.assertFalse(xShape.FillUseSlideBackground)

    def test_shape_with_the_fill_opens_with_the_entry_selected(self):
        with self.ui_test.create_doc_in_start_center("impress") as document:
            self.close_template_dialog()
            xShape = self.insert_selected_rectangle(document)
            xShape.FillStyle = NONE
            xShape.FillUseSlideBackground = True

            with self.ui_test.execute_dialog_through_command(".uno:FormatArea") as xDialog:
                self.assertEqual(USE_BACKGROUND, self.selected_entry(xDialog))
                self.assertEqual("Slide background", get_fill_caption(xDialog))

            # OK without a change keeps the fill.
            self.assertEqual(NONE, xShape.FillStyle)
            self.assertTrue(xShape.FillUseSlideBackground)

    def test_color_replaces_the_slide_background(self):
        with self.ui_test.create_doc_in_start_center("impress") as document:
            self.close_template_dialog()
            xShape = self.insert_selected_rectangle(document)
            xShape.FillStyle = NONE
            xShape.FillUseSlideBackground = True

            with self.ui_test.execute_dialog_through_command(".uno:FormatArea") as xDialog:
                select_palette_color(xDialog, "Standard", "56")
                self.assertEqual("Standard", self.selected_entry(xDialog))
                self.assertTrue(get_fill_caption(xDialog).startswith("Color:"))

            self.assertEqual(SOLID, xShape.FillStyle)

    def test_none_replaces_the_slide_background(self):
        with self.ui_test.create_doc_in_start_center("impress") as document:
            self.close_template_dialog()
            xShape = self.insert_selected_rectangle(document)

            with self.ui_test.execute_dialog_through_command(".uno:FormatArea") as xDialog:
                select_fill(self, xDialog, "use background")
                select_fill(self, xDialog, "none")
                self.assertEqual("None", get_fill_caption(xDialog))

            self.assertEqual(NONE, xShape.FillStyle)
            self.assertFalse(xShape.FillUseSlideBackground)

    def test_draw_does_not_offer_the_entry(self):
        with self.ui_test.create_doc_in_start_center("draw") as document:
            self.insert_selected_rectangle(document)

            with self.ui_test.execute_dialog_through_command(
                    ".uno:FormatArea", close_button="cancel") as xDialog:
                # Selecting a text that the list does not have leaves the selection as it is.
                select_fill(self, xDialog, "use background")
                self.assertNotEqual(USE_BACKGROUND, self.selected_entry(xDialog))

# vim: set shiftwidth=4 softtabstop=4 expandtab:
