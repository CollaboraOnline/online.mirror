# -*- Mode: makefile-gmake; tab-width: 4; indent-tabs-mode: t; fill-column: 100 -*-
#
# Copyright the Collabora Office contributors.
#
# SPDX-License-Identifier: MPL-2.0
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

$(eval $(call gb_CppunitTest_CppunitTest,vcl_remoteclipboard))

$(eval $(call gb_CppunitTest_add_exception_objects,vcl_remoteclipboard, \
    vcl/qa/cppunit/remoteclipboard \
))

$(eval $(call gb_CppunitTest_use_external,vcl_remoteclipboard,boost_headers))

$(eval $(call gb_CppunitTest_set_include,vcl_remoteclipboard,\
    $$(INCLUDE) \
    -I$(SRCDIR)/vcl/inc \
))

$(eval $(call gb_CppunitTest_use_libraries,vcl_remoteclipboard, \
    comphelper \
    cppu \
    cppuhelper \
    sal \
    test \
    tl \
    unotest \
    vcl \
))

$(eval $(call gb_CppunitTest_use_sdk_api,vcl_remoteclipboard))

$(eval $(call gb_CppunitTest_use_rdb,vcl_remoteclipboard,services))

$(eval $(call gb_CppunitTest_use_ure,vcl_remoteclipboard))
$(eval $(call gb_CppunitTest_use_vcl,vcl_remoteclipboard))

$(eval $(call gb_CppunitTest_use_configuration,vcl_remoteclipboard))

# vim: set noet sw=4 ts=4:
