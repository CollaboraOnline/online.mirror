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

#include <osl/interlck.h>
#include <rtl/character.hxx>
#include <rtl/ustrbuf.h>
#include <rtl/ustrbuf.hxx>
#include "strimp.hxx"

#if USE_SDT_PROBES
#define RTL_LOG_STRING_BITS         16
#endif

#include "strtmpl.hxx"

void rtl_uStringbuffer_newFromStr_WithLength( rtl_uString ** newStr,
                                                       const sal_Unicode * value,
                                                       sal_Int32 count)
{
    rtl::str::stringbuffer_newFromStr_WithLength(newStr, value, count);
}

rtl_uString * rtl_uStringBuffer_refReturn( rtl_uString * pThis )
{
    RTL_LOG_STRING_NEW( pThis );
    rtl::str::acquire( pThis );
    return pThis;
}

rtl_uString * rtl_uStringBuffer_makeStringAndClear( rtl_uString ** ppThis,
                                                             sal_Int32 *nCapacity )
{
    assert(ppThis);
    assert(nCapacity);
    // avoid an un-necessary atomic ref/unref pair
    rtl_uString *pStr = *ppThis;
    *ppThis = nullptr;

    rtl::str::new_(ppThis);
    *nCapacity = 0;

    RTL_LOG_STRING_NEW( pStr );

    return pStr;
}

sal_Int32 rtl_uStringbuffer_newFromStringBuffer( rtl_uString ** newStr,
                                                          sal_Int32 capacity,
                                                          rtl_uString * oldStr )
{
    return rtl::str::stringbuffer_newFromStringBuffer(newStr, capacity, oldStr);
}

void rtl_uStringbuffer_ensureCapacity
    (rtl_uString ** This, sal_Int32* capacity, sal_Int32 minimumCapacity)
{
    rtl::str::stringbuffer_ensureCapacity(This, capacity, minimumCapacity);
}

void rtl_uStringbuffer_insert( rtl_uString ** This,
                                        sal_Int32 * capacity,
                                        sal_Int32 offset,
                                        const sal_Unicode * str,
                                        sal_Int32 len)
{
    rtl::str::stringbuffer_insert(This, capacity, offset, str, len);
}

void rtl_uStringbuffer_insertUtf32(
    rtl_uString ** pThis, sal_Int32 * capacity, sal_Int32 offset, sal_uInt32 c) noexcept
{
    sal_Unicode buf[2];
    sal_Int32 len = rtl::splitSurrogates(c, buf);
    rtl::str::stringbuffer_insert(pThis, capacity, offset, buf, len);
}

void rtl_uStringbuffer_insert_ascii(   /*inout*/rtl_uString ** This,
                                                /*inout*/sal_Int32 * capacity,
                                                sal_Int32 offset,
                                                const char * str,
                                                sal_Int32 len)
{
    rtl::str::stringbuffer_insert(This, capacity, offset, str, len);
}

/*************************************************************************
 *  rtl_uStringbuffer_remove
 */
void rtl_uStringbuffer_remove( rtl_uString ** This,
                                       sal_Int32 start,
                                       sal_Int32 len )
{
    rtl::str::stringbuffer_remove(This, start, len);
}

/** Similar to OUString::replaceAt

    Replace n = count characters
    from position index in this string with newStr.
 */
void rtl::OUStringBuffer::replaceAt(sal_Int32 nIndex, sal_Int32 nCount, std::u16string_view newStr )
{
    assert(nIndex >= 0 && nIndex <= getLength());
    assert(nCount >= 0);
    assert(nCount <= getLength() - nIndex);

    /* Append? */
    const sal_Int32 nOldLength = getLength();
    if ( nIndex == nOldLength )
    {
        append(newStr);
        return;
    }

    sal_Int32 nNewLength = nOldLength + newStr.size() - nCount;
    if (newStr.size() > o3tl::make_unsigned(nCount))
        ensureCapacity(nOldLength + newStr.size() - nCount);

    sal_Unicode* pStr = const_cast<sal_Unicode*>(getStr());
    // move the piece after the insert site into the right place
    memmove(
        pStr + nIndex + newStr.size(),
        pStr + nIndex + nCount,
        (nOldLength - nIndex - nCount) * sizeof(sal_Unicode));
    // copy the inserted data into place
    memcpy(
        pStr + nIndex,
        newStr.data(),
        newStr.size() * sizeof(sal_Unicode));

    setLength(nNewLength);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
