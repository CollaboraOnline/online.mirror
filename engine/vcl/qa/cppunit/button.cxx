/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <test/bootstrapfixture.hxx>

#include <boost/property_tree/json_parser.hpp>
#include <tools/json_writer.hxx>
#include <vcl/toolkit/button.hxx>
#include <vcl/image.hxx>
#include <vcl/wrkwin.hxx>

#include <sstream>

namespace
{
class ButtonTest : public test::BootstrapFixture
{
public:
    ButtonTest()
        : BootstrapFixture(true, false)
    {
    }
};

CPPUNIT_TEST_FIXTURE(ButtonTest, testIconPathOfThemeImage)
{
    // Given a button with an image of the icon theme:
    ScopedVclPtrInstance<WorkWindow> xWindow(nullptr, WB_APP | WB_STDWORK);
    ScopedVclPtrInstance<PushButton> xButton(xWindow.get());
    xButton->SetModeImage(Image(StockImage::Yes, u"sc/res/sf01.png"_ustr));

    // When it is sent to the client:
    tools::JsonWriter aJsonWriter;
    xButton->DumpAsPropertyTree(aJsonWriter);
    std::stringstream aStream{ std::string(aJsonWriter.finishAndGetAsOString()) };
    boost::property_tree::ptree aTree;
    boost::property_tree::read_json(aStream, aTree);

    // Then the client gets its path next to its name. The name drops the folder, the path keeps
    // it, so sc/res/sf01.png and sw/res/sf01.png stay apart. Without the fix in place, only the
    // name was sent.
    CPPUNIT_ASSERT_EQUAL(std::string("lc_sf01.svg"), aTree.get<std::string>("icon", ""));
    CPPUNIT_ASSERT_EQUAL(std::string("sc/res/sf01.png"), aTree.get<std::string>("iconpath", ""));
}
}

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
