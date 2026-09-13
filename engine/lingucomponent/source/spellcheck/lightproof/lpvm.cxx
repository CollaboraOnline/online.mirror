/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include "lpvm.hxx"
#include "lprfile.hxx"

#include <sal/log.hxx>

namespace lightproof
{
Value Value::boolean(bool b)
{
    Value aValue;
    aValue.m_eType = Type::Bool;
    aValue.m_bBool = b;
    return aValue;
}

Value Value::integer(sal_Int32 n)
{
    Value aValue;
    aValue.m_eType = Type::Int;
    aValue.m_nInt = n;
    return aValue;
}

Value Value::string(OUString aString)
{
    Value aValue;
    aValue.m_eType = Type::Str;
    aValue.m_aString = std::move(aString);
    return aValue;
}

bool Value::isTrue() const
{
    switch (m_eType)
    {
        case Type::Null:
            return false;
        case Type::Bool:
            return m_bBool;
        case Type::Int:
            return m_nInt != 0;
        case Type::Str:
            return !m_aString.isEmpty();
    }
    return false;
}

namespace
{
// One option lookup. The Python looks the page up as "<lang>_<country>" and
// falls back to the first two characters of that; here the package is already
// chosen by locale, so the option name alone identifies the flag.
bool getOption(const Context& rContext, const OUString& rName)
{
    const sal_Int32 nIndex = rContext.rFile.findOption(rName);
    if (nIndex < 0 || static_cast<size_t>(nIndex) >= rContext.rOptions.size())
        return false;
    return rContext.rOptions[nIndex];
}

sal_uInt32 readU32(const sal_uInt8* pAt)
{
    return static_cast<sal_uInt32>(pAt[0]) | (static_cast<sal_uInt32>(pAt[1]) << 8)
           | (static_cast<sal_uInt32>(pAt[2]) << 16) | (static_cast<sal_uInt32>(pAt[3]) << 24);
}
}

Value run(const Context& rContext, const sal_uInt8* pCode)
{
    if (pCode == nullptr)
        return Value();

    std::vector<Value> aStack;
    aStack.reserve(8);
    const sal_uInt8* pAt = pCode;

    // A malformed expression should never reach here, but a stack underflow
    // must not read past the end of the vector if one does.
    const auto pop = [&aStack]() -> Value {
        if (aStack.empty())
            return Value();
        Value aTop = std::move(aStack.back());
        aStack.pop_back();
        return aTop;
    };

    for (;;)
    {
        const sal_uInt8 nOpcode = *pAt++;
        switch (nOpcode)
        {
            case OP_END:
                return aStack.empty() ? Value() : aStack.back();

            case OP_PUSH_STR:
                aStack.push_back(Value::string(rContext.rFile.getString(readU32(pAt))));
                pAt += 4;
                break;

            case OP_PUSH_INT:
                aStack.push_back(Value::integer(static_cast<sal_Int32>(readU32(pAt))));
                pAt += 4;
                break;

            case OP_PUSH_BOOL:
                aStack.push_back(Value::boolean(readU32(pAt) != 0));
                pAt += 4;
                break;

            case OP_PUSH_NULL:
                aStack.emplace_back();
                break;

            case OP_LOAD_TEXT:
            case OP_LOAD_SENTENCE:
                // Lightproof checks a whole paragraph as one unit, so the
                // sentence and the text are the same string.
                aStack.push_back(Value::string(rContext.rText));
                break;

            case OP_LOAD_LOCALE:
                // The locale is only ever passed straight back to a host
                // function, which reads it from the context.
                aStack.emplace_back();
                break;

            case OP_LOCALE_LANG:
                aStack.push_back(Value::string(rContext.rLocale.Language));
                break;

            case OP_LOCALE_COUNTRY:
                aStack.push_back(Value::string(rContext.rLocale.Country));
                break;

            case OP_NOT:
                aStack.push_back(Value::boolean(!pop().isTrue()));
                break;

            case OP_TRUTHY:
                aStack.push_back(Value::boolean(pop().isTrue()));
                break;

            case OP_POP:
                pop();
                break;

            case OP_JMP:
                pAt = pCode + readU32(pAt);
                break;

            case OP_JMP_IF_FALSE_KEEP:
                if (!aStack.empty() && !aStack.back().isTrue())
                    pAt = pCode + readU32(pAt);
                else
                    pAt += 4;
                break;

            case OP_JMP_IF_TRUE_KEEP:
                if (!aStack.empty() && aStack.back().isTrue())
                    pAt = pCode + readU32(pAt);
                else
                    pAt += 4;
                break;

            case OP_CALL:
            {
                const sal_uInt8 nFunc = *pAt++;
                const sal_uInt8 nArgc = *pAt++;
                std::vector<Value> aArgs(nArgc);
                for (sal_uInt8 i = nArgc; i > 0; --i)
                    aArgs[i - 1] = pop();
                switch (nFunc)
                {
                    case FN_OPTION:
                        aStack.push_back(Value::boolean(
                            nArgc == 2 && getOption(rContext, aArgs[1].getString())));
                        break;
                    default:
                        SAL_WARN("lingucomponent.lightproof",
                                 "host function " << int(nFunc) << " is not implemented");
                        aStack.emplace_back();
                        break;
                }
                break;
            }

            default:
                SAL_WARN("lingucomponent.lightproof", "opcode " << int(nOpcode) << " is not implemented");
                return Value();
        }
    }
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
