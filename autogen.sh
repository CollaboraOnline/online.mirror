#! /usr/bin/env bash

srcdir=`dirname $0`
test -n "$srcdir" || srcdir=.

builddir=`pwd`
cd "$srcdir"

function failed {
    cat << EOF 1>&2

Result: $1 failed

Please try running the commands from autogen.sh manually, and fix errors.
EOF
    exit 1
}

case `uname -s` in
Linux|FreeBSD|MINGW*|MSYS*)
    libtoolize || failed "libtool"
    ;;
Darwin)
    libtoolize 2>/dev/null || glibtoolize 2>/dev/null || {
        echo "Can't find libtoolize or glibtoolize. Use lode or install it yourself." >&2
        failed libtoolize
    }
    ;;
esac

aclocal || failed "aclocal"

autoheader || failed "autoheader"

automake --add-missing || failed "automake"

autoreconf || failed "autoreconf"

scripts/refresh-git-hooks || failed "refresh-git-hooks"

cd "${builddir}"

if [ $# -gt 0 ]; then
    # If we got parameters, we can execute configure directly. An unknown --with or --enable
    # option stops configure, unless --best-effort asks for only a warning.
    option_checking=fatal
    args=()
    for arg in "$@"
    do
        if [ "$arg" = "--best-effort" ]; then
            option_checking=warn
        else
            args+=("$arg")
        fi
    done
    args+=("--enable-option-checking=$option_checking")

    echo -n "Result: All went OK, running $srcdir/configure "
    for arg in "${args[@]}"
    do
        echo -n "'${arg}' "
    done
    echo "now."
    $srcdir/configure "${args[@]}" || failed "configure"
    exit 0
fi

cat << EOF

Result: All went OK, please run $srcdir/configure (with the appropriate parameters) now.

EOF

# vim:set shiftwidth=4 softtabstop=4 expandtab:
