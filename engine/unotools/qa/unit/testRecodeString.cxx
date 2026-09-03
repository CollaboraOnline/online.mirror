/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 */

#include <config_options.h>

#include <cppunit/TestFixture.h>
#include <cppunit/extensions/HelperMacros.h>
#include <cppunit/plugin/TestPlugIn.h>

#include <unotools/fontcvt.hxx>
#include <unotools/fontdefs.hxx>

class Test : public CppUnit::TestFixture
{
public:
    void testRecodeString();
    void testWingdings3ArrowBullet();

    CPPUNIT_TEST_SUITE(Test);
    CPPUNIT_TEST(testRecodeString);
    CPPUNIT_TEST(testWingdings3ArrowBullet);

    CPPUNIT_TEST_SUITE_END();
};

void Test::testRecodeString()
{
// note, the below won't work with mergelibs as the class is not visible to the linker
#if !ENABLE_MERGELIBS
    ConvertChar const* pConversion = ConvertChar::GetRecodeData(u"starbats", u"opensymbol");
    OUString aStr(u"u"_ustr);
    pConversion->RecodeString(aStr, 0, 1);
    CPPUNIT_ASSERT_EQUAL(u""_ustr, aStr);
#endif
}

void Test::testWingdings3ArrowBullet()
{
// note, the below won't work with mergelibs as the class is not visible to the linker
#if !ENABLE_MERGELIBS
    // A Wingdings 3 bullet at character 0x86 must recode to a character that OpenSymbol
    // actually has a glyph for. It used to recode to a private-use character that only the
    // long-superseded StarSymbol font carried, which left the bullet with no visible glyph.
    ConvertChar const* pConversion = ConvertChar::GetRecodeData(u"wingdings3", u"opensymbol");
    OUString aStr(u""_ustr);
    pConversion->RecodeString(aStr, 0, 1);
    CPPUNIT_ASSERT_EQUAL(u"▸"_ustr, aStr);
#endif
}

CPPUNIT_TEST_SUITE_REGISTRATION(Test);
CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
