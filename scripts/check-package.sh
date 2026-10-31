#!/usr/bin/env bash
#
# check-package.sh [--signed] <zip>
#
#   --signed   the package is a release: it must carry the CaeloWorks code
#              signature. Without it the package is checked as a development
#              build (CI has neither PixInsight nor the keys, so cannot sign).
#
# Verifies a built package against the contract the CaeloWorks update site
# enforces on ingest (scripts/build-update-repo.sh in
# caelo-works/pixinsight-scripts), plus what only this repository knows.
# Catching a violation here costs a red CI run; catching it there costs a
# published release that has to be pulled.
#
# This checks the shape and the identity a signature claims. Only PixInsight
# can check that it is cryptographically valid: scripts/verify-signature.sh.
#
set -euo pipefail

SIGNED=0
if [ "${1:-}" = "--signed" ]; then SIGNED=1; shift; fi
ZIP="${1:?usage: check-package.sh [--signed] <zip>}"
[ -f "$ZIP" ] || { echo "error: no such file: $ZIP" >&2; exit 1; }
NAME="DarkFrameAnalyzer"
VENDOR="src/scripts/CaeloWorks/$NAME"
ICONS="rsc/icons/script/$NAME"

fail=0
note() { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

tree="$( unzip -Z1 "$ZIP" | grep -v '/$' )"
# File contents are captured whole, never piped into grep -q: grep would stop at
# the first match, unzip would die of SIGPIPE, and pipefail would report a
# failure on a good package.
member() { unzip -p "$ZIP" "$1" 2>/dev/null || true; }
has() { printf '%s\n' "$tree" | grep -qxF "$1"; }

echo "Package contract: $( basename "$ZIP" )"

# The entry script, with the script identifier the signature is bound to.
if has "$VENDOR/$NAME.js"; then
   note "entry script is in place"
   entry="$( member "$VENDOR/$NAME.js" )"
   if grep -q "^#feature-id[[:space:]]\{1,\}$NAME[[:space:]]*:" <<< "$entry"; then
      note "entry script declares #feature-id $NAME"
   else
      bad "$NAME.js has no '#feature-id $NAME : ...': it cannot be signed"
   fi
   if grep -q $'\r' <<< "$entry"; then
      bad "$NAME.js has CRLF line endings: the build normalizes to LF"
   fi
else
   bad "no $VENDOR/$NAME.js"
fi

# Code signature (CPD Program Rules, rule 5.1). Exactly one, the entry
# script's: it covers every file the entry #includes, and a signature on any
# other file would never be verified.
sigs="$( printf '%s\n' "$tree" | grep -i '\.xsgn$' || true )"
if [ -z "$sigs" ]; then
   if [ "$SIGNED" -eq 1 ]; then
      bad "no code signature: a release must ship $VENDOR/$NAME.xsgn"
   else
      note "unsigned: a development build, not a release"
   fi
elif [ "$sigs" != "$VENDOR/$NAME.xsgn" ]; then
   bad "the only signature must be $VENDOR/$NAME.xsgn, found:"
   printf '%s\n' "$sigs" | sed 's/^/          /'
elif ! grep -q "<Signature [^>]*scriptId=\"$NAME\"[^>]*developerId=\"CaeloWorks\"" \
       <<< "$( member "$VENDOR/$NAME.xsgn" )"; then
   bad "$NAME.xsgn is not a CaeloWorks signature of script $NAME"
else
   note "signed by CaeloWorks ($NAME.xsgn)"
fi

# Everything else the package installs.
for f in "$VENDOR/$NAME.svg" "$ICONS/$NAME.svg" \
         "doc/scripts/$NAME/$NAME.html" "doc/scripts/$NAME-fr/$NAME-fr.html"; do
   if has "$f"; then note "$f"; else bad "missing: $f"; fi
done

# A whitelist, not a blacklist: the package unpacks over someone's PixInsight
# installation, so every file must land in one of this script's own
# directories (all of them deployment directories allowed by rule 4.2).
stray="$( printf '%s\n' "$tree" \
          | grep -vE "^(${VENDOR}|${ICONS}|doc/scripts/${NAME}|doc/scripts/${NAME}-fr)/" || true )"
if [ -n "$stray" ]; then
   bad "files outside this script's directories:"
   printf '%s\n' "$stray" | sed 's/^/          /'
else
   note "every file lands in one of this script's own directories"
fi

# The sidecar, when it sits next to the zip, must describe this very zip.
SIDECAR="$( dirname "$ZIP" )/update-package.json"
if [ -f "$SIDECAR" ]; then
   sha1="$( sha1sum "$ZIP" | cut -d' ' -f1 )"
   if python3 - "$SIDECAR" "$( basename "$ZIP" )" "$sha1" <<'PY'
import json, sys
meta = json.load(open(sys.argv[1]))
sys.exit(0 if meta.get("fileName") == sys.argv[2] and meta.get("sha1") == sys.argv[3] else 1)
PY
   then
      note "update-package.json matches the zip (fileName, sha1 $sha1)"
   else
      bad "update-package.json does not match the zip (fileName or sha1)"
   fi
fi

echo
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAILED"
exit "$fail"
