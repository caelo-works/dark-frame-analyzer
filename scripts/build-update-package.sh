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
#       Contains ONLY what must be installed into PixInsight (no Python
#       reference script, no README/LICENSE).
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
# The zip is reproducible (fixed entry order, fixed mtimes, fixed
# permissions): its sha1 only changes when the content changes.
#
# Usage:
#   scripts/build-update-package.sh [expected-version]
#   RELEASE_DATE=YYYYMMDD scripts/build-update-package.sh   # date override
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_JS="$REPO_ROOT/DarkFrameAnalyzer.js"
DIST_DIR="$REPO_ROOT/dist"
INSTALL_PATH="src/scripts/CaeloWorks/DarkFrameAnalyzer"

# --- Version: single source of truth is the #define in the script --------
VERSION="$(sed -n 's/^#define[[:space:]]\{1,\}VERSION[[:space:]]\{1,\}"\([^"]*\)".*/\1/p' "$SCRIPT_JS")"
if [ -z "$VERSION" ]; then
   echo "ERROR: could not read #define VERSION from $SCRIPT_JS" >&2
   exit 1
fi
if [ -n "${1:-}" ] && [ "$1" != "$VERSION" ]; then
   echo "ERROR: expected version '$1' but DarkFrameAnalyzer.js declares '$VERSION'" >&2
   exit 1
fi

RELEASE_DATE="${RELEASE_DATE:-$(date +%Y%m%d)}"
case "$RELEASE_DATE" in
   [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
   *) echo "ERROR: RELEASE_DATE must be YYYYMMDD (got '$RELEASE_DATE')" >&2; exit 1 ;;
esac

ZIP_NAME="DarkFrameAnalyzer-$VERSION.zip"

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/$ZIP_NAME" "$DIST_DIR/update-package.json"

# --- Reproducible zip ------------------------------------------------------
# Built through Python's zipfile: entries are written in a fixed order with
# a constant timestamp and fixed permissions, so identical content always
# yields an identical archive (stable sha1).
python3 - "$SCRIPT_JS" "$DIST_DIR/$ZIP_NAME" "$INSTALL_PATH" <<'PYEOF'
import sys, zipfile

src, dest, install_path = sys.argv[1], sys.argv[2], sys.argv[3]
FIXED_DATE = (2000, 1, 1, 0, 0, 0)  # constant mtime: sha1 depends on content only

with open(src, "rb") as f:
    data = f.read()
# Normalize line endings so the archive does not depend on the git
# autocrlf setting of the machine that built it
data = data.replace(b"\r\n", b"\n")

with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    info = zipfile.ZipInfo(install_path + "/DarkFrameAnalyzer.js",
                           date_time=FIXED_DATE)
    info.external_attr = 0o644 << 16
    z.writestr(info, data)
PYEOF

SHA1="$(sha1sum "$DIST_DIR/$ZIP_NAME" | cut -d' ' -f1)"

# --- Metadata contract for the site (aggregated updates.xri) ---------------
cat > "$DIST_DIR/update-package.json" <<EOF
{
  "name": "Dark Frame Analyzer",
  "slug": "dark-frame-analyzer",
  "version": "$VERSION",
  "fileName": "$ZIP_NAME",
  "sha1": "$SHA1",
  "type": "script",
  "releaseDate": "$RELEASE_DATE",
  "piVersionRange": "1.9.0:1.9.99",
  "title": "Dark Frame Analyzer v$VERSION",
  "descriptionHtml": "<p>Analyzes a series of dark frames (FITS or XISF) and flags out-of-spec frames before WBPP integration. Robust per-frame statistics — clipped median, exact MAD, hot pixels, thermal drift, spatial uniformity — with anti-quantization safeguards. Full console report, CSV export and WBPP exclusion tools.</p>"
}
EOF

echo "Built:"
echo "  $DIST_DIR/$ZIP_NAME"
echo "  $DIST_DIR/update-package.json"
echo "  version=$VERSION sha1=$SHA1 releaseDate=$RELEASE_DATE"
