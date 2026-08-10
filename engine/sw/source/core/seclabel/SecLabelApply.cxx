/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <SecLabelApply.hxx>

#include <svx/seclabel/SecLabelStore.hxx>

#include <com/sun/star/awt/FontWeight.hpp>
#include <com/sun/star/beans/XPropertySet.hpp>
#include <com/sun/star/container/XNameAccess.hpp>
#include <com/sun/star/container/XNamed.hpp>
#include <com/sun/star/frame/XModel.hpp>
#include <com/sun/star/lang/XMultiServiceFactory.hpp>
#include <com/sun/star/style/ParagraphAdjust.hpp>
#include <com/sun/star/style/XStyleFamiliesSupplier.hpp>
#include <com/sun/star/text/ControlCharacter.hpp>
#include <com/sun/star/text/XBookmarksSupplier.hpp>
#include <com/sun/star/text/XParagraphCursor.hpp>
#include <com/sun/star/text/XText.hpp>
#include <com/sun/star/text/XTextContent.hpp>
#include <com/sun/star/text/XTextCursor.hpp>
#include <com/sun/star/text/XTextDocument.hpp>
#include <com/sun/star/text/XTextViewCursorSupplier.hpp>

using namespace css;

namespace sw::seclabel
{
namespace
{
// Set one header/footer text property to the marking, formatted (bold, coloured,
// centred), replacing any existing content. No-op if the property holds no text.
void markText(const uno::Reference<beans::XPropertySet>& xPageStyle, const OUString& rTextProp,
              const OUString& rMarking, sal_Int32 nColor)
{
    uno::Reference<text::XText> xText(xPageStyle->getPropertyValue(rTextProp), uno::UNO_QUERY);
    if (!xText.is())
        return;
    xText->setString(rMarking);
    uno::Reference<text::XTextCursor> xCursor = xText->createTextCursor();
    xCursor->gotoStart(false);
    xCursor->gotoEnd(true);
    uno::Reference<beans::XPropertySet> xProps(xCursor, uno::UNO_QUERY);
    if (!xProps.is())
        return;
    xProps->setPropertyValue(u"CharWeight"_ustr, cpo::uno::Any(awt::FontWeight::BOLD));
    xProps->setPropertyValue(u"CharColor"_ustr, cpo::uno::Any(nColor));
    xProps->setPropertyValue(u"ParaAdjust"_ustr, cpo::uno::Any(style::ParagraphAdjust_CENTER));
}

bool getBool(const uno::Reference<beans::XPropertySet>& xPageStyle, const OUString& rProp)
{
    bool bValue = true; // header/footer sharing defaults to on
    xPageStyle->getPropertyValue(rProp) >>= bValue;
    return bValue;
}

// Turn an area (header or footer) on and mark every variant the page style
// actually shows: the shared/right text always, plus the left text when left and
// right pages differ, and the first-page text when it differs. Creating the area
// if it was off, so a label always appears regardless of the sharing settings.
void setMarkingArea(const uno::Reference<beans::XPropertySet>& xPageStyle, const OUString& rIsOn,
                    const OUString& rIsShared, const OUString& rText, const OUString& rTextLeft,
                    const OUString& rTextFirst, const OUString& rMarking, sal_Int32 nColor)
{
    xPageStyle->setPropertyValue(rIsOn, cpo::uno::Any(true));

    markText(xPageStyle, rText, rMarking, nColor);
    if (!getBool(xPageStyle, rIsShared))
        markText(xPageStyle, rTextLeft, rMarking, nColor);
    if (!getBool(xPageStyle, u"FirstIsShared"_ustr))
        markText(xPageStyle, rTextFirst, rMarking, nColor);
}

// Clear the marking from every active variant of an area, without toggling the
// area on/off (the inverse of setMarkingArea's text writes).
void clearMarkingArea(const uno::Reference<beans::XPropertySet>& xPageStyle,
                      const OUString& rIsShared, const OUString& rText, const OUString& rTextLeft,
                      const OUString& rTextFirst)
{
    markText(xPageStyle, rText, OUString(), 0);
    if (!getBool(xPageStyle, rIsShared))
        markText(xPageStyle, rTextLeft, OUString(), 0);
    if (!getBool(xPageStyle, u"FirstIsShared"_ustr))
        markText(xPageStyle, rTextFirst, OUString(), 0);
}

// The named page style of the document, or an empty reference if not found.
uno::Reference<beans::XPropertySet> getPageStyle(const uno::Reference<frame::XModel>& xModel,
                                                 const OUString& rPageStyleName)
{
    uno::Reference<style::XStyleFamiliesSupplier> xSupplier(xModel, uno::UNO_QUERY);
    if (!xSupplier.is())
        return {};
    uno::Reference<container::XNameAccess> xPageStyles;
    xSupplier->getStyleFamilies()->getByName(u"PageStyles"_ustr) >>= xPageStyles;
    if (!xPageStyles.is() || !xPageStyles->hasByName(rPageStyleName))
        return {};
    return uno::Reference<beans::XPropertySet>(xPageStyles->getByName(rPageStyleName),
                                               uno::UNO_QUERY);
}

// Bookmarks naming the body markings, so they can be replaced or removed later.
constexpr OUString BOOKMARK_DOC_START = u"__CplSecLabelDocStart"_ustr;
constexpr OUString BOOKMARK_DOC_END = u"__CplSecLabelDocEnd"_ustr;

// Format a cursor selection as a marking run (bold, coloured, centred).
void formatMarkingSelection(const uno::Reference<text::XTextCursor>& xCursor, sal_Int32 nColor)
{
    uno::Reference<beans::XPropertySet> xProps(xCursor, uno::UNO_QUERY);
    if (!xProps.is())
        return;
    xProps->setPropertyValue(u"CharWeight"_ustr, cpo::uno::Any(awt::FontWeight::BOLD));
    xProps->setPropertyValue(u"CharColor"_ustr, cpo::uno::Any(nColor));
    xProps->setPropertyValue(u"ParaAdjust"_ustr, cpo::uno::Any(style::ParagraphAdjust_CENTER));
}

// Remove a previously inserted body marking (the whole paragraph) by its bookmark.
void removeBookmarkedMarking(const uno::Reference<frame::XModel>& xModel, const OUString& rName,
                             bool bAtStart)
{
    uno::Reference<text::XBookmarksSupplier> xSupplier(xModel, uno::UNO_QUERY);
    if (!xSupplier.is())
        return;
    uno::Reference<container::XNameAccess> xMarks = xSupplier->getBookmarks();
    if (!xMarks.is() || !xMarks->hasByName(rName))
        return;
    uno::Reference<text::XTextContent> xMark(xMarks->getByName(rName), uno::UNO_QUERY);
    if (!xMark.is())
        return;
    uno::Reference<text::XTextRange> xAnchor = xMark->getAnchor();
    if (!xAnchor.is())
        return;
    uno::Reference<text::XText> xText = xAnchor->getText();

    // Select the whole marking paragraph plus the break separating it from the
    // body, so removal leaves no empty paragraph behind.
    uno::Reference<text::XTextCursor> xCursor
        = xText->createTextCursorByRange(bAtStart ? xAnchor->getStart() : xAnchor->getEnd());
    uno::Reference<text::XParagraphCursor> xPara(xCursor, uno::UNO_QUERY);
    if (!xPara.is())
        return;
    if (bAtStart)
    {
        xPara->gotoEndOfParagraph(true); // select marking (para start -> end)
        xCursor->goRight(1, true); // absorb the trailing paragraph break
    }
    else
    {
        xPara->gotoStartOfParagraph(true); // select marking (para end -> start)
        xCursor->goLeft(1, true); // absorb the leading paragraph break
    }
    xText->removeTextContent(xMark);
    xText->insertString(xCursor, OUString(), true); // delete the selection
}

// Insert rMarking as its own paragraph at the start or end of the body, bookmarked
// so it can be replaced or removed later.
void insertBodyMarking(const uno::Reference<frame::XModel>& xModel, const OUString& rMarking,
                       sal_Int32 nColor, bool bAtStart, const OUString& rName)
{
    uno::Reference<text::XTextDocument> xTextDoc(xModel, uno::UNO_QUERY);
    if (!xTextDoc.is())
        return;
    uno::Reference<text::XText> xText = xTextDoc->getText();
    if (!xText.is())
        return;

    uno::Reference<text::XTextCursor> xCursor = xText->createTextCursor();
    if (bAtStart)
    {
        xCursor->gotoStart(false);
        xText->insertControlCharacter(xCursor, text::ControlCharacter::PARAGRAPH_BREAK, false);
        xCursor->gotoStart(false);
        xText->insertString(xCursor, rMarking, false);
    }
    else
    {
        xCursor->gotoEnd(false);
        xText->insertControlCharacter(xCursor, text::ControlCharacter::PARAGRAPH_BREAK, false);
        xText->insertString(xCursor, rMarking, false);
    }

    // The marking is now the whole current paragraph: select it to format and bookmark.
    uno::Reference<text::XParagraphCursor> xPara(xCursor, uno::UNO_QUERY);
    if (xPara.is())
        xPara->gotoStartOfParagraph(true);
    formatMarkingSelection(xCursor, nColor);

    uno::Reference<lang::XMultiServiceFactory> xFactory(xModel, uno::UNO_QUERY);
    if (!xFactory.is())
        return;
    uno::Reference<text::XTextContent> xMark(
        xFactory->createInstance(u"com.sun.star.text.Bookmark"_ustr), uno::UNO_QUERY);
    uno::Reference<container::XNamed> xNamed(xMark, uno::UNO_QUERY);
    if (!xMark.is() || !xNamed.is())
        return;
    xNamed->setName(rName);
    xText->insertTextContent(xCursor, xMark, true);
}
}

void applyMarking(const uno::Reference<frame::XModel>& xModel, const OUString& rMarking,
                  sal_Int32 nColor, const OUString& rPageStyleName)
{
    uno::Reference<beans::XPropertySet> xPageStyle = getPageStyle(xModel, rPageStyleName);
    if (!xPageStyle.is())
        return;

    setMarkingArea(xPageStyle, u"HeaderIsOn"_ustr, u"HeaderIsShared"_ustr, u"HeaderText"_ustr,
                   u"HeaderTextLeft"_ustr, u"HeaderTextFirst"_ustr, rMarking, nColor);
    setMarkingArea(xPageStyle, u"FooterIsOn"_ustr, u"FooterIsShared"_ustr, u"FooterText"_ustr,
                   u"FooterTextLeft"_ustr, u"FooterTextFirst"_ustr, rMarking, nColor);
}

void applyBodyMarkings(const uno::Reference<frame::XModel>& xModel, const OUString& rMarking,
                       sal_Int32 nColor, bool bStart, bool bEnd)
{
    // Always clear first, so a re-label that drops a placement removes its stale
    // body marking; then (re)insert the ones the selection asks for.
    removeBookmarkedMarking(xModel, BOOKMARK_DOC_START, true);
    if (bStart)
        insertBodyMarking(xModel, rMarking, nColor, true, BOOKMARK_DOC_START);

    removeBookmarkedMarking(xModel, BOOKMARK_DOC_END, false);
    if (bEnd)
        insertBodyMarking(xModel, rMarking, nColor, false, BOOKMARK_DOC_END);
}

void removeBodyMarkings(const uno::Reference<frame::XModel>& xModel)
{
    removeBookmarkedMarking(xModel, BOOKMARK_DOC_START, true);
    removeBookmarkedMarking(xModel, BOOKMARK_DOC_END, false);
}

void applyPortionMarking(const uno::Reference<frame::XModel>& xModel,
                         std::u16string_view rMarking, sal_Int32 nColor)
{
    // Portion marking annotates one portion: the paragraph holding the view cursor.
    uno::Reference<text::XTextViewCursorSupplier> xSupplier(xModel->getCurrentController(),
                                                            uno::UNO_QUERY);
    if (!xSupplier.is())
        return;
    uno::Reference<text::XTextRange> xViewCursor = xSupplier->getViewCursor();
    if (!xViewCursor.is())
        return;
    uno::Reference<text::XText> xText = xViewCursor->getText();
    if (!xText.is())
        return;

    const OUString aPrefix = u"("_ustr + rMarking + u") "_ustr;

    // Work at the start of the portion's paragraph.
    uno::Reference<text::XTextCursor> xCursor
        = xText->createTextCursorByRange(xViewCursor->getStart());
    uno::Reference<text::XParagraphCursor> xPara(xCursor, uno::UNO_QUERY);
    if (!xPara.is())
        return;
    xPara->gotoStartOfParagraph(false);

    // Idempotent: skip if this paragraph is already portion-marked with this prefix.
    uno::Reference<text::XTextCursor> xProbe = xText->createTextCursorByRange(xCursor->getStart());
    xProbe->goRight(aPrefix.getLength(), true);
    if (xProbe->getString() == aPrefix)
        return;

    xText->insertString(xCursor, aPrefix, false); // cursor ends after the prefix
    xCursor->goLeft(aPrefix.getLength(), true); // select the inserted prefix
    formatMarkingSelection(xCursor, nColor);
}

void removeLabel(const uno::Reference<frame::XModel>& xModel, const OUString& rPageStyleName)
{
    svx::seclabel::removeLabelPart(xModel);
    removeBodyMarkings(xModel);

    // Clear the marking the label wrote into the page style (v1 apply replaced the
    // header/footer content, so removal clears it); leave the areas enabled as-is.
    uno::Reference<beans::XPropertySet> xPageStyle = getPageStyle(xModel, rPageStyleName);
    if (!xPageStyle.is())
        return;
    clearMarkingArea(xPageStyle, u"HeaderIsShared"_ustr, u"HeaderText"_ustr, u"HeaderTextLeft"_ustr,
                     u"HeaderTextFirst"_ustr);
    clearMarkingArea(xPageStyle, u"FooterIsShared"_ustr, u"FooterText"_ustr, u"FooterTextLeft"_ustr,
                     u"FooterTextFirst"_ustr);
}

} // namespace sw::seclabel

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
