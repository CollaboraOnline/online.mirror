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

#include <avmedia/mediawindow.hxx>

#include <tools/stream.hxx>
#include <tools/urlobj.hxx>

#include <algorithm>
#include <array>
#include <utility>

namespace
{
// A width or height above this is not a real video, so the header that gave it is broken.
constexpr sal_uInt64 MaxVideoSide = 65535;

constexpr sal_uInt32 fourCC(const char (&rCode)[5])
{
    return (sal_uInt32(sal_uInt8(rCode[0])) << 24) | (sal_uInt32(sal_uInt8(rCode[1])) << 16)
           | (sal_uInt32(sal_uInt8(rCode[2])) << 8) | sal_uInt32(sal_uInt8(rCode[3]));
}

Size makeVideoSize(sal_uInt64 nWidth, sal_uInt64 nHeight)
{
    if (nWidth == 0 || nHeight == 0 || nWidth > MaxVideoSide || nHeight > MaxVideoSide)
        return Size();
    return Size(static_cast<tools::Long>(nWidth), static_cast<tools::Long>(nHeight));
}

// MP4 and QuickTime files (ISO base media file format) are a tree of boxes. Each box starts with
// a 32-bit size and a four-character type. A size of 1 means a 64-bit size follows the type, and
// a size of 0 means the box runs to the end of its parent.
struct Box
{
    sal_uInt32 nType = 0;
    sal_uInt64 nEnd = 0;
};

// Reads the header of the box at the current position. The stream is left at the box contents.
bool readBox(SvStream& rStream, sal_uInt64 nParentEnd, Box& rBox)
{
    const sal_uInt64 nStart = rStream.Tell();
    if (nStart >= nParentEnd || nParentEnd - nStart < 8)
        return false;

    sal_uInt32 nSize32 = 0;
    rStream.ReadUInt32(nSize32).ReadUInt32(rBox.nType);
    if (!rStream.good())
        return false;

    sal_uInt64 nSize = nSize32;
    if (nSize32 == 1)
    {
        if (nParentEnd - nStart < 16)
            return false;
        rStream.ReadUInt64(nSize);
        if (!rStream.good())
            return false;
    }
    else if (nSize32 == 0)
        nSize = nParentEnd - nStart;

    const sal_uInt64 nHeaderSize = rStream.Tell() - nStart;
    if (nSize < nHeaderSize || nSize > nParentEnd - nStart)
        return false;

    rBox.nEnd = nStart + nSize;
    return true;
}

// Finds the first child box of the given type, leaving the stream at its contents.
bool findBox(SvStream& rStream, sal_uInt64 nParentEnd, sal_uInt32 nType, Box& rBox)
{
    while (readBox(rStream, nParentEnd, rBox))
    {
        if (rBox.nType == nType)
            return true;
        rStream.Seek(rBox.nEnd);
    }
    return false;
}

// The track header box holds the display size of the track as 16.16 fixed-point numbers, after a
// transformation matrix that also records a rotation.
Size readTrackHeaderSize(SvStream& rStream, sal_uInt64 nEnd)
{
    sal_uInt8 nVersion = 0;
    rStream.ReadUChar(nVersion);
    // Flags, then the times, the track id and the duration, which are longer in version 1.
    rStream.SeekRel(3 + (nVersion == 1 ? 32 : 20));
    // Reserved, layer, alternate group, volume and reserved.
    rStream.SeekRel(16);

    std::array<sal_Int32, 9> aMatrix{};
    for (sal_Int32& rValue : aMatrix)
        rStream.ReadInt32(rValue);
    sal_uInt32 nWidth = 0;
    sal_uInt32 nHeight = 0;
    rStream.ReadUInt32(nWidth).ReadUInt32(nHeight);
    if (!rStream.good() || rStream.Tell() > nEnd)
        return Size();

    // A quarter turn leaves zero on the diagonal of the matrix, and the picture shows on its side.
    if (aMatrix[0] == 0 && aMatrix[4] == 0 && aMatrix[1] != 0)
        std::swap(nWidth, nHeight);

    return makeVideoSize(nWidth >> 16, nHeight >> 16);
}

// Whether the track's media handler box names a video track.
bool isVideoTrack(SvStream& rStream, sal_uInt64 nTrackEnd)
{
    Box aMedia;
    if (!findBox(rStream, nTrackEnd, fourCC("mdia"), aMedia))
        return false;
    Box aHandler;
    if (!findBox(rStream, aMedia.nEnd, fourCC("hdlr"), aHandler))
        return false;

    // Version and flags, then a predefined field, then the handler type.
    rStream.SeekRel(8);
    sal_uInt32 nHandlerType = 0;
    rStream.ReadUInt32(nHandlerType);
    return rStream.good() && rStream.Tell() <= aHandler.nEnd && nHandlerType == fourCC("vide");
}

Size readIsoMediaSize(SvStream& rStream, sal_uInt64 nFileEnd)
{
    rStream.SetEndian(SvStreamEndian::BIG);
    rStream.Seek(0);

    Box aMovie;
    if (!findBox(rStream, nFileEnd, fourCC("moov"), aMovie))
        return Size();

    Box aTrack;
    while (findBox(rStream, aMovie.nEnd, fourCC("trak"), aTrack))
    {
        const sal_uInt64 nTrackStart = rStream.Tell();
        Size aSize;
        Box aHeader;
        if (findBox(rStream, aTrack.nEnd, fourCC("tkhd"), aHeader))
            aSize = readTrackHeaderSize(rStream, aHeader.nEnd);

        rStream.Seek(nTrackStart);
        if (!aSize.IsEmpty() && isVideoTrack(rStream, aTrack.nEnd))
            return aSize;

        rStream.Seek(aTrack.nEnd);
    }
    return Size();
}

// Matroska and WebM files are EBML: each element has a variable-length id, then a variable-length
// size. The count of leading zero bits in the first byte gives the length of each number.
int numberLength(sal_uInt8 nFirstByte)
{
    for (int nLength = 1; nLength <= 8; ++nLength)
        if (nFirstByte & (0x80 >> (nLength - 1)))
            return nLength;
    return 0;
}

struct Element
{
    sal_uInt32 nId = 0;
    sal_uInt64 nEnd = 0;
    // The size field had all its value bits set, so the element runs to the end of its parent.
    bool bUnknownSize = false;
};

// Reads the header of the element at the current position. The stream is left at the element
// contents. The id keeps its length bits, as the specification writes ids that way.
bool readElement(SvStream& rStream, sal_uInt64 nParentEnd, Element& rElement)
{
    sal_uInt8 nByte = 0;
    rStream.ReadUChar(nByte);
    const int nIdLength = numberLength(nByte);
    if (!rStream.good() || nIdLength == 0 || nIdLength > 4)
        return false;
    rElement.nId = nByte;
    for (int i = 1; i < nIdLength; ++i)
    {
        rStream.ReadUChar(nByte);
        rElement.nId = (rElement.nId << 8) | nByte;
    }

    rStream.ReadUChar(nByte);
    const int nSizeLength = numberLength(nByte);
    if (!rStream.good() || nSizeLength == 0)
        return false;
    const sal_uInt8 nValueMask = 0xFF >> nSizeLength;
    sal_uInt64 nSize = nByte & nValueMask;
    bool bAllOnes = (nSize == nValueMask);
    for (int i = 1; i < nSizeLength; ++i)
    {
        rStream.ReadUChar(nByte);
        nSize = (nSize << 8) | nByte;
        bAllOnes = bAllOnes && nByte == 0xFF;
    }
    if (!rStream.good())
        return false;

    const sal_uInt64 nStart = rStream.Tell();
    if (nStart > nParentEnd)
        return false;
    rElement.bUnknownSize = bAllOnes;
    if (bAllOnes)
        rElement.nEnd = nParentEnd;
    else if (nSize <= nParentEnd - nStart)
        rElement.nEnd = nStart + nSize;
    else
        return false;
    return true;
}

bool readUnsigned(SvStream& rStream, const Element& rElement, sal_uInt64& rValue)
{
    const sal_uInt64 nLength = rElement.nEnd - rStream.Tell();
    if (nLength == 0 || nLength > 8)
        return false;
    rValue = 0;
    for (sal_uInt64 i = 0; i < nLength; ++i)
    {
        sal_uInt8 nByte = 0;
        rStream.ReadUChar(nByte);
        rValue = (rValue << 8) | nByte;
    }
    return rStream.good();
}

constexpr sal_uInt32 EbmlHeaderId = 0x1A45DFA3;
constexpr sal_uInt32 SegmentId = 0x18538067;
constexpr sal_uInt32 TracksId = 0x1654AE6B;
constexpr sal_uInt32 ClusterId = 0x1F43B675;
constexpr sal_uInt32 TrackEntryId = 0xAE;
constexpr sal_uInt32 TrackTypeId = 0x83;
constexpr sal_uInt32 VideoId = 0xE0;
constexpr sal_uInt32 PixelWidthId = 0xB0;
constexpr sal_uInt32 PixelHeightId = 0xBA;
constexpr sal_uInt32 DisplayWidthId = 0x54B0;
constexpr sal_uInt32 DisplayHeightId = 0x54BA;
constexpr sal_uInt32 DisplayUnitId = 0x54B2;
constexpr sal_uInt64 VideoTrackType = 1;

// The display size is in pixels when the display unit is absent or zero. In centimetres, in
// inches or as a bare aspect ratio it gives only the shape of the picture, which then keeps its
// pixel height.
Size readVideoElementSize(SvStream& rStream, const Element& rVideo)
{
    sal_uInt64 nPixelWidth = 0, nPixelHeight = 0, nDisplayWidth = 0, nDisplayHeight = 0;
    sal_uInt64 nDisplayUnit = 0;
    Element aElement;
    while (rStream.Tell() < rVideo.nEnd && readElement(rStream, rVideo.nEnd, aElement))
    {
        bool bRead = true;
        switch (aElement.nId)
        {
            case PixelWidthId:
                bRead = readUnsigned(rStream, aElement, nPixelWidth);
                break;
            case PixelHeightId:
                bRead = readUnsigned(rStream, aElement, nPixelHeight);
                break;
            case DisplayWidthId:
                bRead = readUnsigned(rStream, aElement, nDisplayWidth);
                break;
            case DisplayHeightId:
                bRead = readUnsigned(rStream, aElement, nDisplayHeight);
                break;
            case DisplayUnitId:
                bRead = readUnsigned(rStream, aElement, nDisplayUnit);
                break;
        }
        if (!bRead)
            return Size();
        rStream.Seek(aElement.nEnd);
    }

    if (nDisplayWidth && nDisplayHeight)
    {
        if (nDisplayUnit == 0)
            return makeVideoSize(nDisplayWidth, nDisplayHeight);
        if (nDisplayUnit <= 3 && nPixelHeight <= MaxVideoSide && nDisplayWidth <= MaxVideoSide)
            return makeVideoSize(nPixelHeight * nDisplayWidth / nDisplayHeight, nPixelHeight);
    }
    return makeVideoSize(nPixelWidth, nPixelHeight);
}

Size readTrackEntrySize(SvStream& rStream, const Element& rEntry)
{
    sal_uInt64 nTrackType = 0;
    Size aSize;
    Element aElement;
    while (rStream.Tell() < rEntry.nEnd && readElement(rStream, rEntry.nEnd, aElement))
    {
        if (aElement.nId == TrackTypeId && !readUnsigned(rStream, aElement, nTrackType))
            return Size();
        if (aElement.nId == VideoId)
            aSize = readVideoElementSize(rStream, aElement);
        rStream.Seek(aElement.nEnd);
    }
    return nTrackType == VideoTrackType ? aSize : Size();
}

Size readMatroskaSize(SvStream& rStream, sal_uInt64 nFileEnd)
{
    rStream.Seek(0);
    Element aHeader;
    if (!readElement(rStream, nFileEnd, aHeader) || aHeader.nId != EbmlHeaderId)
        return Size();
    rStream.Seek(aHeader.nEnd);

    Element aSegment;
    if (!readElement(rStream, nFileEnd, aSegment) || aSegment.nId != SegmentId)
        return Size();

    // The track list comes before the first cluster of frames, and a cluster can have an unknown
    // size, so the search stops there.
    Element aElement;
    while (rStream.Tell() < aSegment.nEnd && readElement(rStream, aSegment.nEnd, aElement))
    {
        if (aElement.nId == ClusterId || aElement.bUnknownSize)
            break;
        if (aElement.nId == TracksId)
        {
            Element aEntry;
            while (rStream.Tell() < aElement.nEnd && readElement(rStream, aElement.nEnd, aEntry))
            {
                if (aEntry.nId == TrackEntryId)
                {
                    const Size aSize = readTrackEntrySize(rStream, aEntry);
                    if (!aSize.IsEmpty())
                        return aSize;
                }
                rStream.Seek(aEntry.nEnd);
            }
            return Size();
        }
        rStream.Seek(aElement.nEnd);
    }
    return Size();
}
}

namespace avmedia
{
Size MediaWindow::readVideoSize(std::u16string_view rURL)
{
    const INetURLObject aURL(rURL);
    if (aURL.GetProtocol() != INetProtocol::File)
        return Size();

    SvFileStream aStream(aURL.getFSysPath(FSysStyle::Detect), StreamMode::READ);
    if (!aStream.IsOpen())
        return Size();
    const sal_uInt64 nFileEnd = aStream.TellEnd();

    // Both container formats name themselves in the first bytes of the file.
    std::array<sal_uInt8, 8> aStart{};
    if (aStream.ReadBytes(aStart.data(), aStart.size()) != aStart.size())
        return Size();
    if (aStart[0] == 0x1A && aStart[1] == 0x45 && aStart[2] == 0xDF && aStart[3] == 0xA3)
        return readMatroskaSize(aStream, nFileEnd);
    // Older QuickTime files can start with another top-level box instead of the file type box.
    const sal_uInt32 nFirstBoxType = (sal_uInt32(aStart[4]) << 24) | (sal_uInt32(aStart[5]) << 16)
                                     | (sal_uInt32(aStart[6]) << 8) | sal_uInt32(aStart[7]);
    for (sal_uInt32 nType : { fourCC("ftyp"), fourCC("moov"), fourCC("mdat"), fourCC("wide"),
                              fourCC("free"), fourCC("skip") })
        if (nFirstBoxType == nType)
            return readIsoMediaSize(aStream, nFileEnd);
    return Size();
}

Size MediaWindow::shrinkToFit(const Size& rSize, const Size& rBounds)
{
    if (rBounds.IsEmpty()
        || (rSize.Width() <= rBounds.Width() && rSize.Height() <= rBounds.Height()))
        return rSize;
    const double fScale = std::min(rBounds.Width() / double(rSize.Width()),
                                   rBounds.Height() / double(rSize.Height()));
    return Size(std::max<tools::Long>(1, rSize.Width() * fScale),
                std::max<tools::Long>(1, rSize.Height() * fScale));
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
