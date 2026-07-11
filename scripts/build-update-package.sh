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
#           src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.xsgn
#                                                        (signed builds only)
#           rsc/icons/script/DarkFrameAnalyzer/DarkFrameAnalyzer.svg
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
# - The key password is prompted on the terminal (read -s) and crosses to
#   PixInsight as a command-scoped environment variable: this script never
#   writes it to a file, a log, a command line or this repository, and its
#   other child processes never inherit it (a preset XSSK_PASS is moved
#   out of the exported environment at startup). Presetting XSSK_PASS
#   skips the prompt (automation/tests) — then YOU own where that value
#   lives before it reaches this script (shell history, CI logs...).
# - Signing runs inside PixInsight (Security.generateScriptSignatureFile),
#   so a local PixInsight installation is required; override the detected
#   executable with PIXINSIGHT_BIN. Only the main script (the one carrying
#   the #feature-id) is signed; the .xsgn lands next to the .js in the zip.
# - The .xsgn embeds a signing timestamp: a SIGNED zip is NOT
#   byte-reproducible across signings. Each signing yields a new sha1;
#   the site re-ingests the new artifact and regenerates its updates.xri.
#
# FIRST-SIGNING CHECKLIST (untestable until the CPD key is validated):
#   1. PixInsight command-line flags (-n --run= --force-exit) — adjust at
#      the invocation below if the local version differs; its output is
#      captured and shown on failure.
#   2. WSL layouts: paths are handed to Windows PixInsight as
#      //wsl.localhost/... — PixInsight reads scripts from there in daily
#      use, but confirm it can also WRITE the .xsgn back. If not, stage on
#      a Windows-side directory (e.g. under /mnt/c) and retry.
#
# Usage:
#   scripts/build-update-package.sh [expected-version]
#   RELEASE_DATE=YYYYMMDD scripts/build-update-package.sh   # date override
# ============================================================================
set -euo pipefail

# If the key password was preset in the environment (automation), move it
# out of the exported environment IMMEDIATELY: no child of this script may
# inherit it. It is re-injected only into the PixInsight invocation.
XSSK_PASS_LOCAL="${XSSK_PASS:-}"
unset XSSK_PASS

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_JS="$REPO_ROOT/DarkFrameAnalyzer.js"
SCRIPT_SVG="$REPO_ROOT/DarkFrameAnalyzer.svg"
DIST_DIR="$REPO_ROOT/dist"
STAGE_DIR="$DIST_DIR/stage"
INSTALL_PATH="src/scripts/CaeloWorks/DarkFrameAnalyzer"
ICONS_PATH="rsc/icons/script/DarkFrameAnalyzer"

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

# --- Stage the exact bytes that ship ---------------------------------------
# CRLF -> LF normalized byte-exactly (python, not a line-oriented tool) so
# the staged bytes never depend on the sed implementation or the git
# autocrlf setting of the build machine. A signature generated on the
# staged file covers exactly the shipped bytes.
if [ ! -f "$SCRIPT_SVG" ]; then
   echo "ERROR: icon not found: $SCRIPT_SVG" >&2
   exit 1
fi
python3 - "$SCRIPT_JS" "$STAGE_DIR/DarkFrameAnalyzer.js" \
          "$SCRIPT_SVG" "$STAGE_DIR/DarkFrameAnalyzer.svg" <<'PYEOF'
import sys

args = sys.argv[1:]
for src, dest in zip(args[0::2], args[1::2]):
    with open(src, "rb") as f:
        data = f.read()
    with open(dest, "wb") as f:
        f.write(data.replace(b"\r\n", b"\n"))
PYEOF

# --- Optional code signing -------------------------------------------------
if [ -n "${XSSK_PATH:-}" ]; then
   if [ ! -f "$XSSK_PATH" ]; then
      echo "ERROR: XSSK_PATH does not exist: $XSSK_PATH" >&2
      exit 1
   fi

   # These paths are interpolated into a generated PJSR string literal:
   # reject characters that would break out of it or split it
   case "$XSSK_PATH$STAGE_DIR" in
      *\"*|*\\*|*$'\n'*)
         echo "ERROR: paths used by the signing driver must not contain quotes, backslashes or newlines" >&2
         exit 1 ;;
   esac

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

   # Key password: prompted on the terminal; a preset XSSK_PASS (captured
   # and un-exported at startup) skips the prompt for automation/tests
   if [ -z "$XSSK_PASS_LOCAL" ]; then
      if [ ! -t 0 ]; then
         echo "ERROR: no terminal to prompt for the key password" >&2
         echo "       (preset XSSK_PASS in the environment for non-interactive runs)" >&2
         exit 1
      fi
      read -r -s -p "Password for $(basename "$XSSK_PATH"): " XSSK_PASS_LOCAL
      echo
   fi

   # Paths as PixInsight sees them (Windows drive paths under WSL;
   # forward slashes, which PixInsight uses on every platform)
   if [[ "$PI_BIN" == /mnt/* ]] && command -v wslpath > /dev/null 2>&1; then
      to_pi_path() { wslpath -m "$1"; }
   else
      to_pi_path() { printf '%s\n' "$1"; }
   fi

   # The signing driver contains paths only — never the password
   SIGN_TMP="$(mktemp -d)"
   trap 'rm -rf "$SIGN_TMP"' EXIT
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
   # The password crosses to PixInsight as a command-scoped environment
   # variable: assignment prefixes are not part of argv, this script's
   # other children never inherit it, and WSLENV (scoped the same way)
   # forwards it across the WSL->Windows boundary when needed.
   PI_STATUS=0
   XSSK_PASS="$XSSK_PASS_LOCAL" WSLENV="${WSLENV:+$WSLENV:}XSSK_PASS" \
      "$PI_BIN" -n --run="$(to_pi_path "$SIGN_TMP/sign.js")" --force-exit \
      > "$SIGN_TMP/pi.log" 2>&1 || PI_STATUS=$?

   if [ "$PI_STATUS" -ne 0 ] || [ ! -s "$STAGE_DIR/DarkFrameAnalyzer.xsgn" ]; then
      echo "ERROR: signing failed — PixInsight exit=$PI_STATUS (output below)" >&2
      echo "--- PixInsight output ------------------------------------------" >&2
      # Redacted line by line in pure bash: the password must never reach
      # a durable log, and must not appear on any command line either
      while IFS= read -r line; do
         [ -n "$XSSK_PASS_LOCAL" ] && line="${line//"$XSSK_PASS_LOCAL"/[redacted]}"
         printf '%s\n' "$line" >&2
      done < "$SIGN_TMP/pi.log"
      echo "----------------------------------------------------------------" >&2
      echo "See the FIRST-SIGNING CHECKLIST in this script's header." >&2
      exit 1
   fi
   XSSK_PASS_LOCAL=""
else
   echo "NOTE: UNSIGNED package (CPD identity pending validation by Pleiades)."
   echo "      Set XSSK_PATH=/path/to/key.xssk to enable code signing."
fi

# --- Reproducible zip ------------------------------------------------------
# Built through Python's zipfile: entries are written in a fixed (sorted)
# order with a constant timestamp and fixed permissions, so identical
# content always yields an identical archive (stable sha1). Only the
# expected files may ship: anything else in the stage is a hard error.
# The icon is written twice: next to the script (dialog header emblem) and
# under rsc/icons (the #feature-icon @script_icons_dir location).
python3 - "$STAGE_DIR" "$DIST_DIR/$ZIP_NAME" "$INSTALL_PATH" "$ICONS_PATH" <<'PYEOF'
import sys, os, zipfile

stage, dest, install_path, icons_path = sys.argv[1:5]
FIXED_DATE = (2000, 1, 1, 0, 0, 0)  # constant mtime: sha1 depends on content only
ALLOWED = {"DarkFrameAnalyzer.js", "DarkFrameAnalyzer.svg",
           "DarkFrameAnalyzer.xsgn"}

names = sorted(os.listdir(stage))
unexpected = [n for n in names if n not in ALLOWED]
if unexpected:
    sys.exit("ERROR: unexpected entries in the stage directory: "
             + ", ".join(unexpected))

entries = [(install_path + "/" + n, n) for n in names]
if "DarkFrameAnalyzer.svg" in names:
    entries.append((icons_path + "/DarkFrameAnalyzer.svg",
                    "DarkFrameAnalyzer.svg"))
entries.sort()

with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    for arcname, name in entries:
        with open(os.path.join(stage, name), "rb") as f:
            data = f.read()
        info = zipfile.ZipInfo(arcname, date_time=FIXED_DATE)
        info.external_attr = 0o644 << 16
        info.create_system = 3  # fixed (unix): CPython defaults to 0 on Windows
        z.writestr(info, data)
PYEOF

SHA1="$(sha1sum "$DIST_DIR/$ZIP_NAME" | cut -d' ' -f1)"
SIGNED="$([ -s "$STAGE_DIR/DarkFrameAnalyzer.xsgn" ] && echo yes || echo no)"

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
