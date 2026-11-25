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

#include <basegfx/polygon/b2dpolypolygoncutter.hxx>
#include <b2dpolypolygonsweep.hxx>
#include <basegfx/point/b2dpoint.hxx>
#include <basegfx/vector/b2dvector.hxx>
#include <basegfx/vector/b2enums.hxx>
#include <basegfx/polygon/b2dpolygon.hxx>
#include <basegfx/polygon/b2dpolygontools.hxx>
#include <basegfx/range/b2drange.hxx>
#include <basegfx/polygon/b2dpolypolygontools.hxx>
#include <utility>
#include <vector>
#include <map>
#include <tuple>

namespace basegfx
{
    namespace
    {

        struct StripHelper
        {
            B2DRange                                maRange;
            sal_Int32                               mnDepth;
            B2VectorOrientation                     meOrinetation;
        };

    } // end of anonymous namespace
} // end of namespace basegfx

namespace basegfx::utils
{

        B2DPolyPolygon stripNeutralPolygons(const B2DPolyPolygon& rCandidate)
        {
            B2DPolyPolygon aRetval;

            for(const auto& rPolygon : rCandidate)
            {
                if(utils::getOrientation(rPolygon) != B2VectorOrientation::Neutral)
                {
                    aRetval.append(rPolygon);
                }
            }

            return aRetval;
        }

        B2DPolyPolygon createNonzeroConform(const B2DPolyPolygon& rCandidate)
        {
            return solvePolygonsBySweep(rCandidate, SweepFillRule::Nonzero, B2DPolyPolygon(),
                                        SweepFillRule::EvenOdd, SweepOperation::Fill);
        }

        B2DPolyPolygon stripDispensablePolygons(const B2DPolyPolygon& rCandidate, bool bKeepAboveZero)
        {
            const sal_uInt32 nCount(rCandidate.count());
            B2DPolyPolygon aRetval;

            if(nCount)
            {
                if(nCount == 1)
                {
                    if(!bKeepAboveZero && utils::getOrientation(rCandidate.getB2DPolygon(0)) == B2VectorOrientation::Positive)
                    {
                        aRetval = rCandidate;
                    }
                }
                else
                {
                    sal_uInt32 a, b;
                    std::vector< StripHelper > aHelpers;
                    aHelpers.resize(nCount);

                    for(a = 0; a < nCount; a++)
                    {
                        const B2DPolygon& aCandidate(rCandidate.getB2DPolygon(a));
                        StripHelper* pNewHelper = &(aHelpers[a]);
                        pNewHelper->maRange = aCandidate.getB2DRange();
                        pNewHelper->meOrinetation = utils::getOrientation(aCandidate);
                        pNewHelper->mnDepth = (pNewHelper->meOrinetation == B2VectorOrientation::Negative ? -1 : 0);
                    }

                    for(a = 0; a < nCount - 1; a++)
                    {
                        const B2DPolygon& aCandA(rCandidate.getB2DPolygon(a));
                        StripHelper& rHelperA = aHelpers[a];

                        for(b = a + 1; b < nCount; b++)
                        {
                            const B2DPolygon& aCandB(rCandidate.getB2DPolygon(b));
                            StripHelper& rHelperB = aHelpers[b];
                            const bool bAInB(rHelperB.maRange.isInside(rHelperA.maRange) && utils::isInside(aCandB, aCandA, true));
                            const bool bBInA(rHelperA.maRange.isInside(rHelperB.maRange) && utils::isInside(aCandA, aCandB, true));

                            if(bAInB && bBInA)
                            {
                                // congruent
                                if(rHelperA.meOrinetation == rHelperB.meOrinetation)
                                {
                                    // two polys or two holes. Lower one of them to get one of them out of the way.
                                    // Since each will be contained in the other one, both will be increased, too.
                                    // So, for lowering, increase only one of them
                                    rHelperA.mnDepth++;
                                }
                                else
                                {
                                    // poly and hole. They neutralize, so get rid of both. Move securely below zero.
                                    rHelperA.mnDepth = - static_cast<sal_Int32>(nCount);
                                    rHelperB.mnDepth = - static_cast<sal_Int32>(nCount);
                                }
                            }
                            else
                            {
                                if(bAInB)
                                {
                                    if(rHelperB.meOrinetation == B2VectorOrientation::Negative)
                                    {
                                        rHelperA.mnDepth--;
                                    }
                                    else
                                    {
                                        rHelperA.mnDepth++;
                                    }
                                }
                                else if(bBInA)
                                {
                                    if(rHelperA.meOrinetation == B2VectorOrientation::Negative)
                                    {
                                        rHelperB.mnDepth--;
                                    }
                                    else
                                    {
                                        rHelperB.mnDepth++;
                                    }
                                }
                            }
                        }
                    }

                    for(a = 0; a < nCount; a++)
                    {
                        const StripHelper& rHelper = aHelpers[a];
                        bool bAcceptEntry(bKeepAboveZero ? 1 <= rHelper.mnDepth : rHelper.mnDepth == 0);

                        if(bAcceptEntry)
                        {
                            aRetval.append(rCandidate.getB2DPolygon(a));
                        }
                    }
                }
            }

            return aRetval;
        }

        B2DPolyPolygon prepareForPolygonOperation(const B2DPolygon& rCandidate)
        {
            return prepareForPolygonOperation(B2DPolyPolygon(rCandidate));
        }

        B2DPolyPolygon prepareForPolygonOperation(const B2DPolyPolygon& rCandidate)
        {
            // the area filled even-odd, without crossings; a polygon the sweep gives back as it
            // was can still be one without area or turned the wrong way
            B2DPolyPolygon aRetval(solvePolygonsBySweep(rCandidate, SweepFillRule::EvenOdd,
                                                        B2DPolyPolygon(), SweepFillRule::EvenOdd,
                                                        SweepOperation::Fill));
            aRetval = stripNeutralPolygons(aRetval);

            return correctOrientations(aRetval);
        }

        B2DPolyPolygon solvePolygonOperationOr(const B2DPolyPolygon& rCandidateA, const B2DPolyPolygon& rCandidateB)
        {
            if(!rCandidateA.count())
            {
                return rCandidateB;
            }
            else if(!rCandidateB.count())
            {
                return rCandidateA;
            }
            else
            {
                // without overlap both stay as they are
                if(!rCandidateA.getB2DRange().overlaps(rCandidateB.getB2DRange()))
                {
                    B2DPolyPolygon aRetval(rCandidateA);
                    aRetval.append(rCandidateB);
                    return aRetval;
                }

                return solvePolygonsBySweep(rCandidateA, SweepFillRule::EvenOdd, rCandidateB,
                                            SweepFillRule::EvenOdd, SweepOperation::Or);
            }
        }

        B2DPolyPolygon solvePolygonOperationXor(const B2DPolyPolygon& rCandidateA, const B2DPolyPolygon& rCandidateB)
        {
            if(!rCandidateA.count())
            {
                return rCandidateB;
            }
            else if(!rCandidateB.count())
            {
                return rCandidateA;
            }
            else
            {
                // without overlap both stay as they are
                if(!rCandidateA.getB2DRange().overlaps(rCandidateB.getB2DRange()))
                {
                    B2DPolyPolygon aRetval(rCandidateA);
                    aRetval.append(rCandidateB);
                    return aRetval;
                }

                return solvePolygonsBySweep(rCandidateA, SweepFillRule::EvenOdd, rCandidateB,
                                            SweepFillRule::EvenOdd, SweepOperation::Xor);
            }
        }

        B2DPolyPolygon solvePolygonOperationAnd(const B2DPolyPolygon& rCandidateA, const B2DPolyPolygon& rCandidateB)
        {
            if(!rCandidateA.count())
            {
                return B2DPolyPolygon();
            }
            else if(!rCandidateB.count())
            {
                return B2DPolyPolygon();
            }
            else
            {
                // tdf#130150 shortcut & precision: If both are simple ranges,
                // solve based on ranges
                if(basegfx::utils::isRectangle(rCandidateA) && basegfx::utils::isRectangle(rCandidateB))
                {
                    // *if* both are ranges, AND always can be solved
                    const basegfx::B2DRange aRangeA(rCandidateA.getB2DRange());
                    const basegfx::B2DRange aRangeB(rCandidateB.getB2DRange());

                    if(aRangeA.isInside(aRangeB))
                    {
                        // 2nd completely inside 1st -> 2nd is result of AND
                        return rCandidateB;
                    }

                    if(aRangeB.isInside(aRangeA))
                    {
                        // 2nd completely inside 1st -> 2nd is result of AND
                        return rCandidateA;
                    }

                    // solve by intersection
                    basegfx::B2DRange aIntersect(aRangeA);
                    aIntersect.intersect(aRangeB);

                    if(aIntersect.isEmpty())
                    {
                        // no overlap -> empty polygon as result of AND
                        return B2DPolyPolygon();
                    }

                    // create polygon result
                    return B2DPolyPolygon(
                        basegfx::utils::createPolygonFromRect(
                            aIntersect));
                }

                // without overlap nothing is left
                if(!rCandidateA.getB2DRange().overlaps(rCandidateB.getB2DRange()))
                {
                    return B2DPolyPolygon();
                }

                return solvePolygonsBySweep(rCandidateA, SweepFillRule::EvenOdd, rCandidateB,
                                            SweepFillRule::EvenOdd, SweepOperation::And);
            }
        }

        B2DPolyPolygon solvePolygonOperationDiff(const B2DPolyPolygon& rCandidateA, const B2DPolyPolygon& rCandidateB)
        {
            if(!rCandidateA.count())
            {
                return B2DPolyPolygon();
            }
            else if(!rCandidateB.count())
            {
                return rCandidateA;
            }
            else
            {
                // without overlap A stays as it is
                if(!rCandidateA.getB2DRange().overlaps(rCandidateB.getB2DRange()))
                {
                    return rCandidateA;
                }

                return solvePolygonsBySweep(rCandidateA, SweepFillRule::EvenOdd, rCandidateB,
                                            SweepFillRule::EvenOdd, SweepOperation::Diff);
            }
        }

        B2DPolyPolygon mergeToSinglePolyPolygon(const B2DPolyPolygonVector& rInput)
        {
            if(rInput.empty())
                return B2DPolyPolygon();

            // first step: prepareForPolygonOperation and simple merge of non-overlapping
            // PolyPolygons for speedup; this is possible for the wanted OR-operation
            B2DPolyPolygonVector aResult;
            aResult.reserve(rInput.size());

            for(const basegfx::B2DPolyPolygon & a : rInput)
            {
                const basegfx::B2DPolyPolygon aCandidate(prepareForPolygonOperation(a));

                if(!aResult.empty())
                {
                    const B2DRange aCandidateRange(aCandidate.getB2DRange());
                    bool bCouldMergeSimple(false);

                    for(auto & b: aResult)
                    {
                        basegfx::B2DPolyPolygon aTarget(b);
                        const B2DRange aTargetRange(aTarget.getB2DRange());

                        if(!aCandidateRange.overlaps(aTargetRange))
                        {
                            aTarget.append(aCandidate);
                            b = std::move(aTarget);
                            bCouldMergeSimple = true;
                            break;
                        }
                    }

                    if(!bCouldMergeSimple)
                    {
                        aResult.push_back(aCandidate);
                    }
                }
                else
                {
                    aResult.push_back(aCandidate);
                }
            }

            // second step: melt pairwise to a single PolyPolygon
            while(aResult.size() > 1)
            {
                B2DPolyPolygonVector aResult2;
                aResult2.reserve((aResult.size() / 2) + 1);

                for(size_t a(0); a < aResult.size(); a += 2)
                {
                    if(a + 1 < aResult.size())
                    {
                        // a pair for processing
                        aResult2.push_back(solvePolygonOperationOr(aResult[a], aResult[a + 1]));
                    }
                    else
                    {
                        // last single PolyPolygon; copy to target to not lose it
                        aResult2.push_back(aResult[a]);
                    }
                }

                aResult = std::move(aResult2);
            }

            // third step: get result
            if(aResult.size() == 1)
            {
                return aResult[0];
            }

            return B2DPolyPolygon();
        }

        namespace
        {
        struct B2DPointCompare
        {
            bool operator()(const basegfx::B2DPoint& lhs, const basegfx::B2DPoint& rhs) const
            {
                return std::make_pair(lhs.getX(), lhs.getY()) < std::make_pair(rhs.getX(), rhs.getY());
            }
        };

        struct B2DPointCompareYThenX
        {
            bool operator()(const basegfx::B2DPoint& lhs, const basegfx::B2DPoint& rhs) const
            {
                return std::make_pair(lhs.getY(), lhs.getX()) < std::make_pair(rhs.getY(), rhs.getX());
            }
        };

        }

        // Combine rectangles geometrically to a single OR'ed polygon.
        // Algorithm is from
        //     "Uniqueness of orthogonal connect-the-dots" Joseph O'Rourke 1988
        // The basic algorithm is:
        //   Sort points by lowest x, lowest y
        //   Go through each column and create edges between the vertices 2i and 2i + 1 in that column
        //   Sort points by lowest y, lowest x
        //   Go through each row and create edges between the vertices 2i and 2i + 1 in that row.
        //
        basegfx::B2DPolyPolygon combineRectanglesToPolyPolygon(const std::vector< basegfx::B2DRange >& rRectangles)
        {
            o3tl::sorted_vector<basegfx::B2DPoint, B2DPointCompare> sort_x;
            for (auto const & rRect : rRectangles)
            {
                auto checkPoint = [&sort_x](double x, double y)
                {
                    basegfx::B2DPoint pt(x, y);
                    auto it = sort_x.find(pt);
                    if (it != sort_x.end()) // Shared vertice, remove it.
                        sort_x.erase(it);
                    else
                        sort_x.insert(pt);
                };
                checkPoint(rRect.getMinX(), rRect.getMinY());
                checkPoint(rRect.getMinX(), rRect.getMaxY());
                checkPoint(rRect.getMaxX(), rRect.getMinY());
                checkPoint(rRect.getMaxX(), rRect.getMaxY());
            }

            o3tl::sorted_vector<basegfx::B2DPoint, B2DPointCompareYThenX> sort_y;
            for (auto const & i : sort_x)
                sort_y.insert(i);

            std::map<basegfx::B2DPoint, basegfx::B2DPoint, B2DPointCompare> edges_h;
            std::map<basegfx::B2DPoint, basegfx::B2DPoint, B2DPointCompare> edges_v;

            size_t i = 0;
            while (i < sort_y.size())
            {
                auto curr_y = sort_y[i].getY();
                while (i < sort_y.size() && sort_y[i].getY() == curr_y)
                {
                    edges_h[sort_y[i]] = sort_y[i + 1];
                    edges_h[sort_y[i + 1]] = sort_y[i];
                    i += 2;
                }
            }
            i = 0;
            while (i < sort_x.size())
            {
                auto curr_x = sort_x[i].getX();
                while (i < sort_x.size() && sort_x[i].getX() == curr_x)
                {
                    edges_v[sort_x[i]] = sort_x[i + 1];
                    edges_v[sort_x[i + 1]] = sort_x[i];
                    i += 2;
                }
            }

           // Get all the polygons.
            basegfx::B2DPolyPolygon aPolyPolygon;
            std::vector<std::tuple<basegfx::B2DPoint, bool>> tmpPolygon;
            while (!edges_h.empty())
            {
                tmpPolygon.clear();
                // We can start with any point.
                basegfx::B2DPoint pt = edges_h.begin()->first;
                edges_h.erase(edges_h.begin());
                tmpPolygon.push_back({pt, false});
                for (;;)
                {
                    auto [curr, e] = tmpPolygon.back();
                    if (!e)
                    {
                        auto it = edges_v.find(curr);
                        auto next_vertex = it->second;
                        edges_v.erase(it);
                        tmpPolygon.push_back({next_vertex, true});
                    }
                    else
                    {
                        auto it = edges_h.find(curr);
                        auto next_vertex = it->second;
                        edges_h.erase(it);
                        tmpPolygon.push_back({next_vertex, false});
                    }
                    if (tmpPolygon.back() == tmpPolygon.front())
                    {
                        // Closed polygon
                        break;
                    }
                }
                for (auto const & pair : tmpPolygon)
                {
                    auto const & vertex = std::get<0>(pair);
                    edges_h.erase(vertex);
                    edges_v.erase(vertex);
                }
                basegfx::B2DPolygon aPoly;
                aPoly.reserve(tmpPolygon.size());
                for (auto const & pair : tmpPolygon)
                    aPoly.append(std::get<0>(pair));
                aPolyPolygon.append(std::move(aPoly));
            }

            return aPolyPolygon;
        }

} // end of namespace

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
