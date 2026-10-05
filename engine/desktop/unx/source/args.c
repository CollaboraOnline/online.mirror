/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
#include <stdlib.h>
#include <string.h>
#include <osl/process.h>

#include "args.h"

/* do we start -env: */
static int
is_env_arg (rtl_uString const *str)
{
    return !rtl_ustr_ascii_compare_WithLength (str->buffer, 5, "-env:");
}

static const struct {
    const char   *name;
    unsigned int  bInhibitSplash : 1;
    unsigned int  bInhibitJavaLdx : 1;
    unsigned int  bInhibitPipe : 1;
} pArgDescr[] = {
    /* have a trailing argument */
    { "pt",         1, 0, 0 },
    { "p",          1, 0, 0 },
    { "display",    0, 0, 0 },

    /* no splash */
    { "nologo",     1, 0, 0 },
    { "headless",   1, 0, 0 },
    { "invisible",  1, 0, 0 },
    { "quickstart", 1, 0, 0 },
    { "minimized",  1, 0, 0 },
    { "convert-to", 1, 0, 0 },
    { "cat",        1, 0, 0 },

    /* Do not send --help/--version over the pipe, as their output shall go to
       the calling process's stdout (ideally, this would also happen in the
       presence of unknown options); also prevent splash/javaldx overhead
       (as these options will be processed early in soffice_main): */
    { "version",    1, 1, 1 },
    { "help",       1, 1, 1 },
    { "h",          1, 1, 1 },
    { "?",          1, 1, 1 },
};

Args *args_parse (void)
{
    Args *args;
    sal_uInt32 nArgs, i, j;

    nArgs = osl_getCommandArgCount();
    i = sizeof (Args) + sizeof (rtl_uString *) * nArgs;
    args = malloc (i);
    memset (args, 0, i);
    args->nArgsTotal = nArgs;

    j = 0;

    /* sort the -env: args to the front */
    for ( i = 0; i < nArgs; ++i )
    {
        rtl_uString *pTmp = NULL;
        osl_getCommandArg( i, &pTmp );
        if (is_env_arg (pTmp))
            args->ppArgs[j++] = pTmp;
        else
            rtl_uString_release (pTmp);
    }
    args->nArgsEnv = j;

    /* Then the other args */
    for ( i = 0; i < nArgs; ++i )
    {
        rtl_uString *pTmp = NULL;

        osl_getCommandArg( i, &pTmp );
        if (!is_env_arg (pTmp))
            args->ppArgs[j++] = pTmp;
        else
            rtl_uString_release (pTmp);
    }

    for ( i = args->nArgsEnv; i < args->nArgsTotal; i++ )
    {
        const sal_Unicode *arg = args->ppArgs[i]->buffer;
        sal_Int32 length = args->ppArgs[i]->length;

        /* grok only parameters */
        if (arg[0] != '-')
            continue;

        while (length > 1 && arg[0] == '-') {
            arg++;
            length--;
        }

        for ( j = 0; j < SAL_N_ELEMENTS (pArgDescr); ++j ) {
            if (rtl_ustr_ascii_compare_WithLength(
                    arg, length, pArgDescr[j].name)
                == 0)
            {
                args->bInhibitSplash  |= (bool)pArgDescr[j].bInhibitSplash;
                args->bInhibitJavaLdx |= (bool)pArgDescr[j].bInhibitJavaLdx;
                args->bInhibitPipe    |= (bool)pArgDescr[j].bInhibitPipe;
                break;
            }
        }
    }

    return args;
}

void
args_free (Args *args)
{
    /* FIXME: free ppArgs */
    rtl_uString_release( args->pAppPath );
    free (args);
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
