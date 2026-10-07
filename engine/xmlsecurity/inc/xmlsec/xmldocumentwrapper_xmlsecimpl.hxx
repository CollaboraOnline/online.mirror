/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This file incorporates work covered by the following license notice:
 *
 *   Licensed to the Apache Software Foundation (ASF) under one or more
 *   contributor license agreements. See the NOTICE file distributed
 *   with this work for additional information regarding copyright
 *   ownership. The ASF licenses this file to you under the Apache
 *   License, Version 2.0 (the "License"); you may not use this file
 *   except in compliance with the License. You may obtain a copy of
 *   the License at http://www.apache.org/licenses/LICENSE-2.0 .
 */

#pragma once

#include <com/sun/star/xml/wrapper/XXMLDocumentWrapper.hpp>
#include <com/sun/star/xml/csax/XCompressedDocumentHandler.hpp>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <cppuhelper/implbase.hxx>

#include <xmlsec/saxhelper.hxx>
#include <xsecxmlsecdllapi.h>

#define NODEPOSITION_NORMAL        1
#define NODEPOSITION_STARTELEMENT  2
#define NODEPOSITION_ENDELEMENT    3

class XMLDocumentWrapper_XmlSecImpl final : public cppu::WeakImplHelper
<
    css::xml::wrapper::XXMLDocumentWrapper,
    css::xml::sax::XDocumentHandler,
    css::xml::csax::XCompressedDocumentHandler,
    css::lang::XServiceInfo
>
/**
 *   NAME
 *  XMLDocumentWrapper_XmlSecImpl -- Class to manipulate a libxml2
 *  document
 *
 *   FUNCTION
 *  Converts SAX events into a libxml2 document, converts the document back
 *  into SAX event stream, and manipulate nodes in the document.
 ******************************************************************************/
{
private:
    /* the sax helper */
    SAXHelper saxHelper;

    /* the document used to convert SAX events to */
    xmlDocPtr m_pDocument;

    /* the root element */
    xmlNodePtr m_pRootElement;

    /*
     * the current active element. The next incoming SAX event will be
     * appended to this element
     */
    xmlNodePtr m_pCurrentElement;

    /*
     * This variable is used when converting the document or part of it into
     * SAX events. See getNextSAXEvent method.
     */
    sal_Int32 m_nCurrentPosition;

    /*
     * used for recursive deletion. See recursiveDelete method
     */
    xmlNodePtr m_pStopAtNode;
    xmlNodePtr m_pCurrentReservedNode;
    cpo::uno::Sequence< cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper > > m_aReservedNodes;
    sal_Int32 m_nReservedNodeIndex;

private:
    void getNextSAXEvent();

    /// @throws css::xml::sax::SAXException
    static void sendStartElement(
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xHandler,
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xHandler2,
        const xmlNodePtr pNode);

    /// @throws css::xml::sax::SAXException
    static void sendEndElement(
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xHandler,
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xHandler2,
        const xmlNodePtr pNode);

    /// @throws css::xml::sax::SAXException
    static void sendNode(
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xHandler,
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xHandler2,
        const xmlNodePtr pNode);

    static OString getNodeQName(const xmlNodePtr pNode);

    sal_Int32 recursiveDelete( const xmlNodePtr pNode);

    void getNextReservedNode();

    void removeNode( const xmlNodePtr pNode) const;

    static xmlNodePtr checkElement(
        const cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper >& xXMLElement);

    void buildIDAttr( xmlNodePtr pNode ) const;
    void rebuildIDLink( xmlNodePtr pNode ) const;

public:
    XSECXMLSEC_DLLPUBLIC XMLDocumentWrapper_XmlSecImpl();
    virtual ~XMLDocumentWrapper_XmlSecImpl() override;

    /* css::xml::wrapper::XXMLDocumentWrapper */
    virtual cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper > getCurrentElement(  ) override;

    virtual void setCurrentElement( const cpo::uno::Reference<
        css::xml::wrapper::XXMLElementWrapper >& element ) override;

    virtual void removeCurrentElement(  ) override;

    virtual bool isCurrent( const cpo::uno::Reference<
        css::xml::wrapper::XXMLElementWrapper >& node ) override;

    virtual bool isCurrentElementEmpty(  ) override;

    virtual OUString getNodeName( const cpo::uno::Reference<
        css::xml::wrapper::XXMLElementWrapper >& node ) override;

    virtual void clearUselessData(
        const cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper >& node,
        const cpo::uno::Sequence< cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper > >& reservedDescendants,
        const cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper >& stopAtNode ) override;

    virtual void collapse( const cpo::uno::Reference<
        css::xml::wrapper::XXMLElementWrapper >& node ) override;

    virtual void generateSAXEvents(
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& handler,
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& xEventKeeperHandler,
        const cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper >& startNode,
        const cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper >& endNode ) override;

    virtual void getTree(
        const cpo::uno::Reference< css::xml::sax::XDocumentHandler >& handler ) override;

    virtual void rebuildIDLink(
        const cpo::uno::Reference< css::xml::wrapper::XXMLElementWrapper >& node ) override;

    /* css::xml::sax::XDocumentHandler */
    virtual void startDocument(  ) override;

    virtual void endDocument(  ) override;

    virtual void startElement(
        const OUString& aName,
        const cpo::uno::Reference< css::xml::sax::XAttributeList >& xAttribs ) override;

    virtual void endElement( const OUString& aName ) override;

    virtual void characters( const OUString& aChars ) override;

    virtual void ignorableWhitespace( const OUString& aWhitespaces ) override;

    virtual void processingInstruction( const OUString& aTarget, const OUString& aData ) override;

    virtual void setDocumentLocator( const cpo::uno::Reference< css::xml::sax::XLocator >& xLocator ) override;

    /* css::xml::csax::XCompressedDocumentHandler */
    virtual void compressedStartDocument(  ) override;

    virtual void compressedEndDocument(  ) override;

    virtual void compressedStartElement(
        const OUString& aName,
        const cpo::uno::Sequence< css::xml::csax::XMLAttribute >& aAttributes ) override;

    virtual void compressedEndElement( const OUString& aName ) override;

    virtual void compressedCharacters( const OUString& aChars ) override;

    virtual void compressedIgnorableWhitespace( const OUString& aWhitespaces ) override;

    virtual void compressedProcessingInstruction( const OUString& aTarget, const OUString& aData ) override;

    virtual void compressedSetDocumentLocator(
        sal_Int32 columnNumber,
        sal_Int32 lineNumber,
        const OUString& publicId,
        const OUString& systemId ) override;

    /* css::lang::XServiceInfo */
    virtual OUString getImplementationName(  ) override;

    virtual bool supportsService( const OUString& ServiceName ) override;

    virtual cpo::uno::Sequence< OUString > getSupportedServiceNames(  ) override;
};

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
