#!/usr/bin/env bash
# ============================================================================
# build-update-package.sh — distribution artifacts for the CaeloWorks
# PixInsight update repository
# ============================================================================
#
# Produces, under dist/:
#
#   DarkFrameAnalyzer-<version>.zip
#       Tree relative to the PixInsight installation directory, extracted
#       as-is by the updater:
#           src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.js
#           src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.svg
#           rsc/icons/script/DarkFrameAnalyzer/DarkFrameAnalyzer.svg
#           doc/scripts/DarkFrameAnalyzer/DarkFrameAnalyzer.html
#           doc/scripts/DarkFrameAnalyzer-fr/DarkFrameAnalyzer-fr.html
#       The documentation pages are compiled from docs/pidoc/ by
#       scripts/build-script-doc.sh and versioned under doc/scripts/: they
#       ship as they are, so this build never needs PixInsight for them.
#       PixInsight integrates the page named after #feature-id; the French
#       page sits next to it and both link to each other.
#       The icon ships twice: the rsc/ copy backs the #feature-icon
#       directive (@script_icons_dir), the copy next to the script backs
#       the dialog header emblem. Contains ONLY what must be installed
#       into PixInsight (no README/LICENSE).
#
#   update-package.json
#       Metadata contract ingested by the site repository
#       (caelo-works/pixinsight-scripts) to build the aggregated,
#       signed updates.xri served at
#       https://pixinsight-scripts.caelo.works/update/
#
# The version is read from the "#define VERSION" line of
# DarkFrameAnalyzer.js — single source of truth. Pass the expected version
# as first argument to assert it (e.g. against a git tag): the build fails
# on mismatch.
#
# The unsigned zip is reproducible on a given build environment (fixed
# entry order, mtimes, permissions, line endings and creator system):
# rebuilt there, its sha1 only changes when the content changes. Entries
# are stored, not compressed, so the bytes do not depend on the zlib of the
# build machine either.
#
# --- Code signing -----------------------------------------------------
# This build never signs: CI has neither PixInsight nor the keys. A release
# zip is signed afterwards, in place, by scripts/sign-package.sh (CPD Program
# Rules, rule 5.1), which adds DarkFrameAnalyzer.xsgn next to the script,
# re-zips through scripts/repro-zip.py and rewrites the sha1 of
# update-package.json. See "Code signing" in the README.
#
# Usage:
#   scripts/build-update-package.sh [expected-version]
#   RELEASE_DATE=YYYYMMDD scripts/build-update-package.sh   # date override
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_JS="$REPO_ROOT/DarkFrameAnalyzer.js"
SCRIPT_SVG="$REPO_ROOT/DarkFrameAnalyzer.svg"
DIST_DIR="$REPO_ROOT/dist"
STAGE_DIR="$DIST_DIR/stage"
INSTALL_PATH="src/scripts/CaeloWorks/DarkFrameAnalyzer"
ICONS_PATH="rsc/icons/script/DarkFrameAnalyzer"
DOC_SRC_DIR="$REPO_ROOT/doc/scripts"
DOC_PATH="doc/scripts"
DOC_PAGES="DarkFrameAnalyzer DarkFrameAnalyzer-fr"

# --- Version and title: single source of truth is the #define lines ------
# The 'q' stops at the first match: a stray second #define would otherwise
# inject a newline into the value and corrupt the JSON and the zip name.
VERSION="$(sed -n '/^#define[[:space:]]\{1,\}VERSION[[:space:]]/{ s/^#define[[:space:]]\{1,\}VERSION[[:space:]]\{1,\}"\([^"]*\)".*/\1/p; q; }' "$SCRIPT_JS")"
if [ -z "$VERSION" ]; then
   echo "ERROR: could not read #define VERSION from $SCRIPT_JS" >&2
   exit 1
fi

SCRIPT_TITLE="$(sed -n '/^#define[[:space:]]\{1,\}TITLE[[:space:]]/{ s/^#define[[:space:]]\{1,\}TITLE[[:space:]]\{1,\}"\([^"]*\)".*/\1/p; q; }' "$SCRIPT_JS")"
if [ -z "$SCRIPT_TITLE" ]; then
   echo "ERROR: could not read #define TITLE from $SCRIPT_JS" >&2
   exit 1
fi
if [ -n "${1:-}" ] && [ "$1" != "$VERSION" ]; then
   echo "ERROR: expected version '$1' but DarkFrameAnalyzer.js declares '$VERSION'" >&2
   exit 1
fi

# UTC so the default date does not depend on the builder's timezone
RELEASE_DATE="${RELEASE_DATE:-$(date -u +%Y%m%d)}"
case "$RELEASE_DATE" in
   [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
   *) echo "ERROR: RELEASE_DATE must be YYYYMMDD (got '$RELEASE_DATE')" >&2; exit 1 ;;
esac

ZIP_NAME="DarkFrameAnalyzer-$VERSION.zip"

# Clean slate: a failed build must never leave a previous run's artifacts
# behind (a publish glob would ship them), and old-version zips must not
# accumulate next to the current one
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
rm -f "$DIST_DIR"/DarkFrameAnalyzer-*.zip "$DIST_DIR/update-package.json"

# --- Stage the install tree ----------------------------------------------
# The stage mirrors the PixInsight installation directory: the zip is that
# tree, as is. CRLF -> LF normalized byte-exactly (python, not a
# line-oriented tool) so the staged bytes never depend on the sed
# implementation or the git autocrlf setting of the build machine.
# The icon is staged twice: next to the script (dialog header emblem) and
# under rsc/icons (the #feature-icon @script_icons_dir location). The
# documentation pages are read from doc/scripts/, where
# scripts/build-script-doc.sh compiles them: building never needs PixInsight.
if [ ! -f "$SCRIPT_SVG" ]; then
   echo "ERROR: icon not found: $SCRIPT_SVG" >&2
   exit 1
fi
STAGE_FILES=(
   "$SCRIPT_JS"  "$INSTALL_PATH/DarkFrameAnalyzer.js"
   "$SCRIPT_SVG" "$INSTALL_PATH/DarkFrameAnalyzer.svg"
   "$SCRIPT_SVG" "$ICONS_PATH/DarkFrameAnalyzer.svg"
)
for page in $DOC_PAGES; do
   if [ ! -f "$DOC_SRC_DIR/$page/$page.html" ]; then
      echo "ERROR: documentation page not found: doc/scripts/$page/$page.html" >&2
      echo "       (run scripts/build-script-doc.sh and commit its output)" >&2
      exit 1
   fi
   STAGE_FILES+=("$DOC_SRC_DIR/$page/$page.html" "$DOC_PATH/$page/$page.html")
done
python3 - "$STAGE_DIR" "${STAGE_FILES[@]}" <<'PYEOF'
import os, sys

stage, args = sys.argv[1], sys.argv[2:]
for src, rel in zip(args[0::2], args[1::2]):
    dest = os.path.join(stage, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(src, "rb") as f:
        data = f.read()
    with open(dest, "wb") as f:
        f.write(data.replace(b"\r\n", b"\n"))
PYEOF

# --- Reproducible zip ------------------------------------------------------
python3 "$REPO_ROOT/scripts/repro-zip.py" "$STAGE_DIR" "$DIST_DIR/$ZIP_NAME"
rm -rf "$STAGE_DIR"

SHA1="$(sha1sum "$DIST_DIR/$ZIP_NAME" | cut -d' ' -f1)"

# --- Metadata contract for the site (aggregated updates.xri) ---------------
cat > "$DIST_DIR/update-package.json" <<EOF
{
  "name": "$SCRIPT_TITLE",
  "slug": "dark-frame-analyzer",
  "version": "$VERSION",
  "fileName": "$ZIP_NAME",
  "sha1": "$SHA1",
  "type": "script",
  "releaseDate": "$RELEASE_DATE",
  "piVersionRange": "1.9.0:1.9.99",
  "title": "$SCRIPT_TITLE v$VERSION",
  "descriptionHtml": "<p>Analyzes a series of dark frames (FITS or XISF) and flags out-of-spec frames before WBPP integration. Robust per-frame statistics — clipped median, exact MAD, hot pixels, thermal drift, spatial uniformity — with anti-quantization safeguards. Full console report, CSV export and WBPP exclusion tools.</p>"
}
EOF

echo "Built:"
echo "  $DIST_DIR/$ZIP_NAME"
echo "  $DIST_DIR/update-package.json"
echo "  version=$VERSION sha1=$SHA1 releaseDate=$RELEASE_DATE (unsigned)"
