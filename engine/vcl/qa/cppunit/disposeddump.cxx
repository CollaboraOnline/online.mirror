/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <test/bootstrapfixture.hxx>

#include <tools/json_writer.hxx>
#include <vcl/builder.hxx>
#include <vcl/wrkwin.hxx>

namespace
{
class DisposedDumpTest : public test::BootstrapFixture
{
public:
    DisposedDumpTest()
        : BootstrapFixture(true, false)
    {
    }
};

CPPUNIT_TEST_FIXTURE(DisposedDumpTest, testDumpDisposedWidgets)
{
    // Given widgets that are disposed while something still holds them, as a queued
    // dialog update does when the part of the dialog that owns them goes away:
    ScopedVclPtrInstance<WorkWindow> xWindow(nullptr, WB_APP | WB_STDWORK);
    VclBuilder aBuilder(xWindow.get(), m_directories.getURLFromSrc(u"/vcl/qa/cppunit/data/"),
                        u"disposeddump.ui"_ustr, OUString(), {}, false);

    // Leaves first, so that each widget is disposed on its own before its container.
    const std::u16string_view aIds[] = { u"drawingarea", u"box" };

    for (const std::u16string_view& rId : aIds)
    {
        VclPtr<vcl::Window> xWidget = aBuilder.get(rId);
        CPPUNIT_ASSERT_MESSAGE(OUString(rId).toUtf8().getStr(), xWidget);
        xWidget->disposeOnce();

        // When it is dumped for the client:
        tools::JsonWriter aJsonWriter;
        xWidget->DumpAsPropertyTree(aJsonWriter);

        // Then nothing crashes. Without the fix in place, a disposed drawing area asked its
        // implementation, which is gone, for its preferred size.
        aJsonWriter.finishAndGetAsOString();
    }
}
}

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
