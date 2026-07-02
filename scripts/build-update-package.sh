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
#           src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.xsgn
#                                                        (signed builds only)
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
# The unsigned zip is reproducible on a given build environment (fixed
# entry order, mtimes, permissions, line endings and creator system):
# rebuilt there, its sha1 only changes when the content changes. Builds on
# a different zlib/Python may yield a different (equally valid) sha1 —
# the published sha1 is the one of the release build.
#
# --- Code signing (DISABLED by default) -----------------------------------
# The CaeloWorks CPD identity is pending validation by Pleiades Astrophoto.
# Until the public key ships with PixInsight, NO signed artifact must be
# published: an unverifiable signature can block users where "unsigned"
# only shows a dismissable warning. The signing step therefore runs ONLY
# when XSSK_PATH points to the .xssk key file:
#
#   XSSK_PATH=/path/to/key.xssk scripts/build-update-package.sh <version>
#
# - The key password is prompted interactively (read -s) and handed to
#   PixInsight through a transient environment variable: it is never
#   written to a file, a log, a command line or this repository.
# - Signing runs inside PixInsight (Security.generateScriptSignatureFile),
#   so a local PixInsight installation is required; override the detected
#   executable with PIXINSIGHT_BIN. Only the main script (the one carrying
#   the #feature-id) is signed; the .xsgn lands next to the .js in the zip.
# - The .xsgn embeds a signing timestamp: a SIGNED zip is NOT
#   byte-reproducible across signings. Each signing yields a new sha1;
#   the site re-ingests the new artifact and regenerates its updates.xri
#   (planned on the site side).
#
# Usage:
#   scripts/build-update-package.sh [expected-version]
#   RELEASE_DATE=YYYYMMDD scripts/build-update-package.sh   # date override
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_JS="$REPO_ROOT/DarkFrameAnalyzer.js"
DIST_DIR="$REPO_ROOT/dist"
STAGE_DIR="$DIST_DIR/stage"
INSTALL_PATH="src/scripts/CaeloWorks/DarkFrameAnalyzer"

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

mkdir -p "$DIST_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
rm -f "$DIST_DIR/$ZIP_NAME" "$DIST_DIR/update-package.json"

# --- Stage the exact bytes that ship ---------------------------------------
# Line endings normalized to LF here (not at zip time) so that a signature
# generated on the staged file matches the shipped bytes exactly, and the
# archive does not depend on the git autocrlf setting of the build machine.
sed 's/\r$//' "$SCRIPT_JS" > "$STAGE_DIR/DarkFrameAnalyzer.js"

# --- Optional code signing -------------------------------------------------
SIGNED="no"
if [ -n "${XSSK_PATH:-}" ]; then
   if [ ! -f "$XSSK_PATH" ]; then
      echo "ERROR: XSSK_PATH does not exist: $XSSK_PATH" >&2
      exit 1
   fi

   # Locate the PixInsight executable (signing runs inside PixInsight)
   PI_BIN="${PIXINSIGHT_BIN:-}"
   if [ -z "$PI_BIN" ]; then
      for cand in "/mnt/c/Program Files/PixInsight/bin/PixInsight.exe" \
                  "/opt/PixInsight/bin/PixInsight" \
                  "/Applications/PixInsight/PixInsight.app/Contents/MacOS/PixInsight"; do
         if [ -x "$cand" ]; then
            PI_BIN="$cand"
            break
         fi
      done
   fi
   if [ -z "$PI_BIN" ]; then
      echo "ERROR: PixInsight executable not found — set PIXINSIGHT_BIN" >&2
      exit 1
   fi

   # Key password: prompted, exported transiently for the PixInsight
   # process only — never written anywhere. WSLENV forwards the variable
   # to Windows processes when PixInsight runs on the Windows side.
   if [ -z "${XSSK_PASS:-}" ]; then
      read -r -s -p "Password for $(basename "$XSSK_PATH"): " XSSK_PASS
      echo
   fi
   export XSSK_PASS
   export WSLENV="${WSLENV:+$WSLENV:}XSSK_PASS"

   # Paths as PixInsight sees them (Windows drive paths under WSL;
   # forward slashes, which PixInsight uses on every platform)
   if [[ "$PI_BIN" == /mnt/* ]] && command -v wslpath > /dev/null 2>&1; then
      to_pi_path() { wslpath -m "$1"; }
   else
      to_pi_path() { printf '%s\n' "$1"; }
   fi

   # The signing driver contains paths only — never the password
   SIGN_TMP="$(mktemp -d)"
   trap 'rm -rf "$SIGN_TMP"; unset XSSK_PASS' EXIT
   cat > "$SIGN_TMP/sign.js" <<EOF
// Generated by build-update-package.sh — deleted after use
var pass = getEnvironmentVariable("XSSK_PASS");
if (!pass || pass.length === 0)
   throw new Error("XSSK_PASS not present in the environment");
Security.generateScriptSignatureFile(
   "$(to_pi_path "$STAGE_DIR/DarkFrameAnalyzer.js")",
   "$(to_pi_path "$XSSK_PATH")",
   pass);
EOF

   echo "Signing DarkFrameAnalyzer.js with PixInsight..."
   # NOTE: command-line flags untested until the first signed release —
   # adjust here if the local PixInsight version uses different options.
   "$PI_BIN" -n --run="$(to_pi_path "$SIGN_TMP/sign.js")" --force-exit \
      > /dev/null 2>&1 || true

   rm -rf "$SIGN_TMP"
   unset XSSK_PASS
   trap - EXIT

   if [ ! -f "$STAGE_DIR/DarkFrameAnalyzer.xsgn" ]; then
      echo "ERROR: PixInsight did not generate DarkFrameAnalyzer.xsgn" >&2
      echo "       (wrong password, invalid key, or PixInsight invocation" >&2
      echo "       flags to adjust — see the NOTE above in this script)" >&2
      exit 1
   fi
   SIGNED="yes"
else
   echo "NOTE: UNSIGNED package (CPD identity pending validation by Pleiades)."
   echo "      Set XSSK_PATH=/path/to/key.xssk to enable code signing."
fi

# --- Reproducible zip ------------------------------------------------------
# Built through Python's zipfile: entries are written in a fixed (sorted)
# order with a constant timestamp and fixed permissions, so identical
# content always yields an identical archive (stable sha1).
python3 - "$STAGE_DIR" "$DIST_DIR/$ZIP_NAME" "$INSTALL_PATH" <<'PYEOF'
import sys, os, zipfile

stage, dest, install_path = sys.argv[1], sys.argv[2], sys.argv[3]
FIXED_DATE = (2000, 1, 1, 0, 0, 0)  # constant mtime: sha1 depends on content only

with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(stage)):
        with open(os.path.join(stage, name), "rb") as f:
            data = f.read()
        info = zipfile.ZipInfo(install_path + "/" + name, date_time=FIXED_DATE)
        info.external_attr = 0o644 << 16
        info.create_system = 3  # fixed (unix): CPython defaults to 0 on Windows
        z.writestr(info, data)
PYEOF

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
echo "  version=$VERSION sha1=$SHA1 releaseDate=$RELEASE_DATE signed=$SIGNED"
