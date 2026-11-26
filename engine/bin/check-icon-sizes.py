#!/usr/bin/env python3
#
# This file is part of the Collabora Office project.
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

import os
import re
import xml.etree.ElementTree as ET

"""
This script walks through all icon files and checks whether the sc_* and lc_* files have the correct size.
"""

icons_folder = os.path.abspath(os.path.join(__file__, '..', '..', 'icon-themes'))

def svg_size(filename):
    root = ET.parse(filename).getroot()
    width = root.get('width')
    height = root.get('height')
    try:
        if width is None or height is None:
            width, height = root.get('viewBox', '').replace(',', ' ').split()[2:4]
        return (float(re.sub(r'px$', '', width)), float(re.sub(r'px$', '', height)))
    except ValueError:
        return None

def check_size(filename, size):
    dimensions = svg_size(filename)
    if dimensions is None:
        print("%s has no size" % filename)
    elif dimensions != (size, size):
        print("%s has size %gx%g but should have %dx%d" % (filename, dimensions[0], dimensions[1], size, size))

for root, dirs, files in os.walk(icons_folder):
    for filename in files:
        if not filename.endswith('.svg'):
            continue
        if filename.startswith('lc_'):
            check_size(os.path.join(root, filename), 24)
        elif filename.startswith('sc_'):
            check_size(os.path.join(root, filename), 16)

