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

package com.sun.star.script.framework.container;

import com.sun.star.container.ElementExistException;
import com.sun.star.container.XNameAccess;
import com.sun.star.container.XNameContainer;

import com.sun.star.io.XInputStream;

import com.sun.star.lang.WrappedTargetException;
import com.sun.star.lang.XMultiComponentFactory;

import com.sun.star.script.framework.io.XInputStreamImpl;
import com.sun.star.script.framework.io.XInputStreamWrapper;
import com.sun.star.script.framework.log.LogUtils;
import com.sun.star.script.framework.provider.PathUtils;

import com.sun.star.ucb.XSimpleFileAccess;

import cpo.uno.Type;
import com.sun.star.uno.UnoRuntime;
import cpo.uno.XComponentContext;

import com.sun.star.uri.XUriReference;
import com.sun.star.uri.XUriReferenceFactory;
import com.sun.star.uri.XVndSunStarScriptUrl;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.StringTokenizer;

/**
 * The <code>ParcelContainer</code> object is used to store the
 * ScriptingFramework specific Libraries.
 */
public class ParcelContainer implements XNameAccess {

    protected static XSimpleFileAccess m_xSFA;

    protected String language;
    protected String containerUrl;
    private Collection<Parcel> parcels = new ArrayList<Parcel>(10);
    protected XComponentContext m_xCtx;
    /**
     * Returns Name of this container. Name of this <tt>ParcelContainer</tt>
     * is determined from the <tt>containerUrl</tt> as the last portion
     * of the URL after the last forward slash.
     * @return    name of <tt>ParcelContainer</tt>
     * found.
     */
    public String getName() {
        String name = null;

        // TODO handler package ParcelContainer?
        if (!containerUrl.startsWith("vnd.sun.star.tdoc:")) {
            try {
                // return name
                String decodedUrl = java.net.URLDecoder.decode(containerUrl, "UTF-8");
                int indexOfSlash = decodedUrl.lastIndexOf('/');

                if (indexOfSlash != -1) {
                    name =  decodedUrl.substring(indexOfSlash + 1);
                }
            } catch (UnsupportedEncodingException e) {
                throw new cpo.uno.RuntimeException(e);
            }
        } else {
            name =  "document";
        }

        return name;
    }

    /**
     * Initializes a newly created <code>ParcelContainer</code> object.
     * @param    xCtx UNO component context
     * @param   containerUrl location of this container.
     * @param   language language for which entries are stored
     */
    public ParcelContainer(XComponentContext xCtx, String containerUrl,
                           String language) throws
        com.sun.star.lang.IllegalArgumentException,
        com.sun.star.lang.WrappedTargetException {

        LogUtils.DEBUG("Creating ParcelContainer for " + containerUrl +
                       " language = " + language);

        this.m_xCtx = xCtx;
        this.language = language;
        this.containerUrl = containerUrl;

        initSimpleFileAccess();
        loadParcels();
    }


    public String getContainerURL() {
        return this.containerUrl;
    }

    private void initSimpleFileAccess() {
        synchronized (ParcelContainer.class) {
            if (m_xSFA != null) {
                return;
            }

            try {

                m_xSFA = UnoRuntime.queryInterface(
                             XSimpleFileAccess.class,
                             m_xCtx.getServiceManager().createInstanceWithContext(
                                 "com.sun.star.ucb.SimpleFileAccess", m_xCtx));

            } catch (Exception e) {
                // TODO should throw
                LogUtils.DEBUG("Error instantiating simplefile access ");
                LogUtils.DEBUG(LogUtils.getTrace(e));
            }
        }
    }

    public String getParcelContainerDir() {
        // A container is a document, user or share, and the convention in
        // each case is to have a Scripts/[language] dir where scripts reside
        return PathUtils.make_url(containerUrl  ,  "Scripts/" + language.toLowerCase());
    }

    public Object getByName(String aName) throws
        com.sun.star.container.NoSuchElementException, WrappedTargetException {

        Parcel parcel = null;

        try {
            if (hasElements()) {
                for (Parcel parcelToCheck : parcels) {
                    if (parcelToCheck.getName().equals(aName)) {
                        parcel = parcelToCheck;
                        break;
                    }
                }
            }
        } catch (Exception e) {
            throw new WrappedTargetException(e);
        }

        if (parcel == null) {
            throw new com.sun.star.container.NoSuchElementException("Macro Library " + aName
                    + " not found");
        }

        return parcel;
    }

    public String[] getElementNames() {

        if (hasElements()) {

            Parcel[] theParcels = parcels.toArray(new Parcel[parcels.size()]);
            String[] names = new String[ theParcels.length ];

            for (int count = 0; count < names.length; count++) {
                names[count] = theParcels[ count ].getName();
            }

            return names;
        }

        return new String[0];
    }

    public boolean hasByName(String aName) {

        boolean isFound = false;

        try {
            if (getByName(aName) != null) {
                isFound = true;
            }

        } catch (Exception e) {
            //TODO - handle trace
        }

        return isFound;
    }

    public Type getElementType() {
        return new Type();
    }

    public boolean hasElements() {
        return !(parcels == null || parcels.isEmpty());
    }

    private void loadParcels() throws com.sun.star.lang.IllegalArgumentException,
        com.sun.star.lang.WrappedTargetException {

        try {
            LogUtils.DEBUG("About to load parcels from " + containerUrl);

            if (m_xSFA.isFolder(getParcelContainerDir())) {
                LogUtils.DEBUG(getParcelContainerDir() + " is a folder ");
                String[] children = m_xSFA.getFolderContents(getParcelContainerDir(), true);
                parcels  = new ArrayList<Parcel>(children.length);

                for (String child : children) {
                    LogUtils.DEBUG("Processing " + child);

                    try {
                        loadParcel(child);
                    } catch (java.lang.Exception e) {
                        // print an error message and move on to
                        // the next parcel
                        LogUtils.DEBUG("ParcelContainer.loadParcels caught " + e.getClass().getName() +
                                       " exception loading parcel " + child + ": " + e.getMessage());
                    }
                }
            } else {
                LogUtils.DEBUG(" ParcelCOntainer.loadParcels " + getParcelContainerDir()  +
                               " is not a folder ");
            }

        } catch (com.sun.star.ucb.CommandAbortedException e) {
            LogUtils.DEBUG("ParcelContainer.loadParcels caught exception processing folders for "
                           + getParcelContainerDir());
            LogUtils.DEBUG("TRACE: " + LogUtils.getTrace(e));
            throw new com.sun.star.lang.WrappedTargetException(e);
        } catch (cpo.uno.Exception e) {
            LogUtils.DEBUG("ParcelContainer.loadParcels caught exception processing folders for "
                           + getParcelContainerDir());
            LogUtils.DEBUG("TRACE: " + LogUtils.getTrace(e));
            throw new com.sun.star.lang.WrappedTargetException(e);
        }
    }

    public  XNameContainer createParcel(String name) throws
        ElementExistException, com.sun.star.lang.WrappedTargetException {

        Parcel p = null;

        if (hasByName(name)) {
            throw new ElementExistException("Parcel " + name + " already exists");
        }

        String pathToParcel = PathUtils.make_url(getParcelContainerDir(), name);

        try {
            LogUtils.DEBUG("ParcelContainer.createParcel, creating folder "
                           + pathToParcel);

            m_xSFA.createFolder(pathToParcel);

            LogUtils.DEBUG("ParcelContainer.createParcel, folder " + pathToParcel  +
                           " created ");

            ParcelDescriptor pd = new ParcelDescriptor();
            pd.setLanguage(language);

            String parcelDesc =
                PathUtils.make_url(pathToParcel, ParcelDescriptor.PARCEL_DESCRIPTOR_NAME);

            XSimpleFileAccess xSFA2 =
                UnoRuntime.queryInterface(XSimpleFileAccess.class, m_xSFA);

            if (xSFA2 != null) {
                LogUtils.DEBUG("createParcel() Using XSIMPLEFILEACCESS2 " + parcelDesc);
                ByteArrayOutputStream bos = new ByteArrayOutputStream(1024);
                pd.write(bos);
                bos.close();
                ByteArrayInputStream bis = new ByteArrayInputStream(bos.toByteArray());
                XInputStreamImpl xis = new XInputStreamImpl(bis);
                xSFA2.writeFile(parcelDesc, xis);
                xis.closeInput();
                p = loadParcel(pathToParcel);
            }
        } catch (Exception e) {
            LogUtils.DEBUG("createParcel() Exception while attempting to create = "
                           + name);
            throw new com.sun.star.lang.WrappedTargetException(e);
        }

        return p;
    }

    public Parcel loadParcel(String parcelUrl) throws
        com.sun.star.lang.WrappedTargetException,
        com.sun.star.lang.IllegalArgumentException {

        String parcelDescUrl =
            PathUtils.make_url(parcelUrl, ParcelDescriptor.PARCEL_DESCRIPTOR_NAME);

        Parcel parcel = null;
        XInputStream xis = null;
        InputStream is = null;

        try {
            if (m_xSFA.exists(parcelDescUrl)) {

                LogUtils.DEBUG("ParcelContainer.loadParcel opening " + parcelDescUrl);

                xis = m_xSFA.openFileRead(parcelDescUrl);
                is = new XInputStreamWrapper(xis);
                ParcelDescriptor pd = new ParcelDescriptor(is) ;

                try {
                    is.close();
                    is = null;
                } catch (Exception e) {
                    LogUtils.DEBUG(
                        "ParcelContainer.loadParcel Exception when closing stream for  "
                        + parcelDescUrl + " :" + e);
                }

                LogUtils.DEBUG("ParcelContainer.loadParcel closed " + parcelDescUrl);

                if (!pd.getLanguage().equals(language)) {
                    LogUtils.DEBUG("ParcelContainer.loadParcel Language of Parcel does not match this container ");
                    return null;
                }

                LogUtils.DEBUG("Processing " + parcelDescUrl + " closed ");

                int indexOfSlash = parcelUrl.lastIndexOf('/');
                String name = parcelUrl.substring(indexOfSlash + 1);

                parcel = new Parcel(m_xSFA, this, pd, name);

                LogUtils.DEBUG(" ParcelContainer.loadParcel created parcel for "
                               + parcelDescUrl + " for language " + language);

                parcels.add(parcel);
            } else {
                throw new java.io.IOException(parcelDescUrl + " does NOT exist!");
            }
        } catch (com.sun.star.ucb.CommandAbortedException e) {
            LogUtils.DEBUG("loadParcel() Exception while accessing filesystem url = "
                           + parcelDescUrl + e);
            throw new com.sun.star.lang.WrappedTargetException(e);
        } catch (java.io.IOException e) {
            LogUtils.DEBUG("ParcelContainer.loadParcel() caught IOException while accessing "
                           + parcelDescUrl + ": " + e);
            throw new com.sun.star.lang.WrappedTargetException(e);
        } catch (cpo.uno.Exception e) {
            LogUtils.DEBUG("loadParcel() Exception while accessing filesystem url = "
                           + parcelDescUrl + e);
            throw new com.sun.star.lang.WrappedTargetException(e);
        }

        finally {
            if (is != null) {
                try {
                    is.close(); // is will close xis
                } catch (Exception ignore) {
                }
            } else if (xis != null) {
                try {
                    xis.closeInput();
                } catch (Exception ignore) {
                }
            }
        }

        return parcel;
    }
    public void renameParcel(String oldName, String newName) throws
        com.sun.star.container.NoSuchElementException,
        com.sun.star.lang.WrappedTargetException {

        LogUtils.DEBUG(" ** ParcelContainer Renaming parcel " + oldName + " to " +
                       newName);
        LogUtils.DEBUG(" ** ParcelContainer is " + this);

        Parcel p = (Parcel)getByName(oldName);

        if (p == null) {
            throw new com.sun.star.container.NoSuchElementException(
                "No parcel named " + oldName);
        }

        String oldParcelDirUrl =
            PathUtils.make_url(getParcelContainerDir(), oldName);

        String newParcelDirUrl =
            PathUtils.make_url(getParcelContainerDir(), newName);

        try {
            if (!m_xSFA.isFolder(oldParcelDirUrl)) {
                Exception e = new com.sun.star.io.IOException(
                    "Invalid Parcel directory: " + oldName);
                throw new com.sun.star.lang.WrappedTargetException(e);
            }

            LogUtils.DEBUG(" ** ParcelContainer Renaming folder " + oldParcelDirUrl
                           + " to " + newParcelDirUrl);

            m_xSFA.move(oldParcelDirUrl, newParcelDirUrl);

        } catch (com.sun.star.ucb.CommandAbortedException ce) {
            LogUtils.DEBUG(" ** ParcelContainer Renaming failed with " + ce);
            throw new com.sun.star.lang.WrappedTargetException(ce);
        } catch (cpo.uno.Exception e) {
            LogUtils.DEBUG(" ** ParcelContainer Renaming failed with " + e);
            throw new com.sun.star.lang.WrappedTargetException(e);
        }

        p.rename(newName);
    }
    // removes but doesn't physically delete parcel from container
    public boolean removeParcel(String name) throws
        com.sun.star.container.NoSuchElementException,
        com.sun.star.lang.WrappedTargetException {

        Parcel p = (Parcel)getByName(name);

        if (p == null) {
            throw new com.sun.star.container.NoSuchElementException(
                "No parcel named " + name);
        }

        return  parcels.remove(p);
    }

    public boolean deleteParcel(String name) throws
        com.sun.star.container.NoSuchElementException,
        com.sun.star.lang.WrappedTargetException {

        LogUtils.DEBUG("deleteParcel for containerURL " + containerUrl
                       + " name = " + name  + " Language = " + language);

        Parcel p = (Parcel)getByName(name);

        if (p == null) {
            throw new com.sun.star.container.NoSuchElementException(
                "No parcel named " + name);
        }

        try {
            String pathToParcel = PathUtils.make_url(getParcelContainerDir(), name);
            m_xSFA.kill(pathToParcel);
        } catch (Exception e) {
            LogUtils.DEBUG("Error deleting parcel " + name);
            throw new com.sun.star.lang.WrappedTargetException(e);
        }

        return  parcels.remove(p);
    }

    public String getLanguage() {
        return language;
    }

    public ScriptMetaData findScript(ParsedScriptUri  parsedUri) throws
        com.sun.star.container.NoSuchElementException,
        com.sun.star.lang.WrappedTargetException {

        Parcel p = (Parcel)getByName(parsedUri.parcel);
        ScriptMetaData scriptData = p.getByName(parsedUri.function);

        LogUtils.DEBUG("** found script data for " +  parsedUri.function + " script is "
                       + scriptData);

        return scriptData;
    }

    public  ParsedScriptUri parseScriptUri(String scriptURI) throws
        com.sun.star.lang.IllegalArgumentException {

        XMultiComponentFactory xMcFac = null;
        XUriReferenceFactory xFac = null;

        try {
            xMcFac = m_xCtx.getServiceManager();

            xFac = UnoRuntime.queryInterface(
                       XUriReferenceFactory.class, xMcFac.createInstanceWithContext(
                           "com.sun.star.uri.UriReferenceFactory", m_xCtx));

        } catch (cpo.uno.Exception e) {
            LogUtils.DEBUG("Problems parsing  URL:" + e.toString());
            throw new com.sun.star.lang.IllegalArgumentException(
                e, "Problems parsing URL");
        }

        if (xFac == null) {
            LogUtils.DEBUG("Failed to create UrlReference factory");
            throw new com.sun.star.lang.IllegalArgumentException(
                "Failed to create UrlReference factory for url " + scriptURI);
        }

        XUriReference uriRef = xFac.parse(scriptURI);

        XVndSunStarScriptUrl sfUri =
            UnoRuntime.queryInterface(XVndSunStarScriptUrl.class, uriRef);

        if (sfUri == null) {
            LogUtils.DEBUG("Failed to parse url");
            throw new com.sun.star.lang.IllegalArgumentException(
                "Failed to parse url " + scriptURI);
        }

        ParsedScriptUri parsedUri = new ParsedScriptUri();
        parsedUri.function = sfUri.getName();
        parsedUri.parcel = "";

        // parse parcel name;
        StringTokenizer tokenizer = new StringTokenizer(parsedUri.function, ".");

        if (tokenizer.hasMoreElements()) {
            parsedUri.parcel = (String)tokenizer.nextElement();
            LogUtils.DEBUG("** parcelName = " + parsedUri.parcel);
        }

        if (parsedUri.function.length() > 0) {

            // strip out parcel name
            parsedUri.function =
                parsedUri.function.substring(parsedUri.parcel.length() + 1);

        }

        // parse location
        parsedUri.location = sfUri.getParameter("location");

        // TODO basic sanity check on language, location, function name, parcel
        // should be correct e.g. verified by MSP and LangProvider by the
        // time it's got to here

        LogUtils.DEBUG("** location = " + parsedUri.location +
                       "\nfunction = " + parsedUri.function +
                       "\nparcel = " + parsedUri.parcel +
                       "\nlocation = " + parsedUri.location);

        return parsedUri;
    }
}
