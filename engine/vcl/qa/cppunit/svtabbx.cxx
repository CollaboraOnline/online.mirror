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
#include <vcl/svapp.hxx>
#include <vcl/virdev.hxx>
#include <vcl/weld.hxx>
#include <vcl/wrkwin.hxx>

#include <sstream>

namespace
{
class SvTabListBoxTest : public test::BootstrapFixture
{
public:
    SvTabListBoxTest()
        : BootstrapFixture(true, false)
    {
    }
};

CPPUNIT_TEST_FIXTURE(SvTabListBoxTest, testExpandedImageOfEntry)
{
    // Given an entry with a bitmap of its own, which is its image both when collapsed and when
    // expanded:
    ScopedVclPtrInstance<WorkWindow> xWindow(nullptr, WB_APP | WB_STDWORK);
    std::unique_ptr<weld::Builder> xBuilder(Application::CreateInterimBuilder(
        xWindow.get(), u"vcl/ui/printerdevicepage.ui"_ustr, false));
    std::unique_ptr<weld::TreeView> xTree(xBuilder->weld_tree_view(u"options"_ustr));
    ScopedVclPtrInstance<VirtualDevice> xImage;
    xImage->SetOutputSizePixel(Size(2, 2));
    xImage->SetBackground(Wallpaper(COL_LIGHTRED));
    xImage->Erase();
    const OUString aText(u"entry"_ustr);
    xTree->insert(nullptr, -1, &aText, nullptr, nullptr, xImage.get(), false, nullptr);

    // When it is sent to the client:
    tools::JsonWriter aJsonWriter;
    xTree->get_property_tree(aJsonWriter);
    std::stringstream aStream{ std::string(aJsonWriter.finishAndGetAsOString()) };
    boost::property_tree::ptree aTree;
    boost::property_tree::read_json(aStream, aTree);

    // Then the column of the image has it under both names. Without the fix in place, the
    // expanded one was sent as "collapsedimage", too.
    std::string aCollapsed;
    std::string aExpanded;
    for (const boost::property_tree::ptree::value_type& rColumn :
         aTree.get_child("entries").front().second.get_child("columns"))
    {
        aCollapsed += rColumn.second.get<std::string>("collapsedimage", "");
        aExpanded += rColumn.second.get<std::string>("expandedimage", "");
    }
    CPPUNIT_ASSERT(aCollapsed.starts_with("data:image/png;base64,"));
    CPPUNIT_ASSERT(aExpanded.starts_with("data:image/png;base64,"));
}
}

CPPUNIT_PLUGIN_IMPLEMENT();

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
