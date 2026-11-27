/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <sal/config.h>

#include <comphelper/mediamimetype.hxx>

#include <cppunit/TestAssert.h>
#include <cppunit/TestFixture.h>
#include <cppunit/extensions/HelperMacros.h>

namespace
{
CPPUNIT_TEST_FIXTURE(CppUnit::TestFixture, testGuessMediaMimeType)
{
    using namespace comphelper;
    CPPUNIT_ASSERT_EQUAL(u"video/mp4"_ustr, GuessMediaMimeType(u"a.mp4"));
    CPPUNIT_ASSERT_EQUAL(u"video/mp4"_ustr, GuessMediaMimeType(u"a.MP4"));
    CPPUNIT_ASSERT_EQUAL(u"audio/ogg"_ustr, GuessMediaMimeType(u"a.Opus"));
    CPPUNIT_ASSERT_EQUAL(u"video/MP2T"_ustr, GuessMediaMimeType(u"a.tS"));
    CPPUNIT_ASSERT_EQUAL(u"video/x-flv"_ustr, GuessMediaMimeType(u"x.y/a.flv"));
    CPPUNIT_ASSERT_EQUAL(u"audio/x-wav"_ustr, GuessMediaMimeType(u"a.mp4.WAV"));

    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a"));
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a."));
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.txt"));
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.mp4/b"));
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.mp"));
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.mp44"));
    // Only ASCII letters fold
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.mp４")); // FULLWIDTH DIGIT FOUR
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.ｍp4")); // FULLWIDTH LATIN SMALL LETTER M
    CPPUNIT_ASSERT_EQUAL(u""_ustr, GuessMediaMimeType(u"a.m\u212Av")); // KELVIN SIGN
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
