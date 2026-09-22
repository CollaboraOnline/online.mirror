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
#ifndef INCLUDED_SVX_SOURCE_UNODRAW_SHAPEIMPL_HXX
#define INCLUDED_SVX_SOURCE_UNODRAW_SHAPEIMPL_HXX

#include <cassert>

#include <svx/svdovirt.hxx>
#include <svx/unoprov.hxx>
#include <svx/unoshape.hxx>

/** The object a shape's content lives on.

    A shape drawn in several places has an SdrVirtObj standing in for it in each of them, and an
    SdrVirtObj reports the kind of the object it refers to. The UNO wrapper is picked by that
    kind, so casting the stand-in itself is wrong: read the referenced object. Anything else of
    another kind is a wrapper over the wrong object, which asserts and gives nullptr. */
template <class SdrObjectType> SdrObjectType* ReferencedSdrObject(SdrObject* pObject)
{
    if (auto* pStandIn = dynamic_cast<SdrVirtObj*>(pObject))
        pObject = &pStandIn->ReferencedObj();
    auto* pTyped = dynamic_cast<SdrObjectType*>(pObject);
    assert((!pObject || pTyped) && "shape wrapped over an object of another kind");
    return pTyped;
}

class SvxShapeCaption : public SvxShapeText
{
public:
    explicit SvxShapeCaption(SdrObject* pObj);
    virtual ~SvxShapeCaption() noexcept override;
};

class SvxFrameShape : public SvxOle2Shape
{
private:
    OUString m_sInitialFrameURL;
protected:
    // override these for special property handling in subcasses. Return true if property is handled
    virtual bool setPropertyValueImpl( const OUString& rName, const SfxItemPropertyMapEntry* pProperty, const cpo::uno::Any& rValue ) override;
    virtual bool getPropertyValueImpl(const OUString& rName, const SfxItemPropertyMapEntry* pProperty,
        cpo::uno::Any& rValue) override;

public:
    explicit SvxFrameShape(SdrObject* pObj, OUString referer);
    virtual ~SvxFrameShape() noexcept override;

    virtual void setPropertyValue( const OUString& aPropertyName, const cpo::uno::Any& aValue ) override;
    using SvxUnoTextRangeBase::setPropertyValue;

    virtual void setPropertyValues( const cpo::uno::Sequence< OUString >& aPropertyNames, const cpo::uno::Sequence< cpo::uno::Any >& aValues ) override;

    virtual void Create( SdrObject* pNewOpj, SvxDrawPage* pNewPage ) override;

    virtual OUString GetAndClearInitialFrameURL() override;
};

SvxUnoPropertyMapProvider& getSvxMapProvider();

#endif

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
