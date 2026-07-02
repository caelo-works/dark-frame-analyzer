#!/usr/bin/env bash
# ============================================================================
# tests/run.sh — test runner for DarkFrameAnalyzer
# ============================================================================
#
# PixInsight scripts cannot run headless, so the strategy is:
#   1. strip the PixInsight preprocessor directives (#feature-id, #include,
#      #define with line continuations) to obtain plain JavaScript;
#   2. check its syntax with node --check;
#   3. expose the pure-logic internals as a Node module and run every
#      tests/*.test.js against it (statistics, i18n, CSV, outlier
#      detection — everything that does not need the PixInsight runtime).
#
# The GUI and image I/O layers are exercised manually in PixInsight.
#
# Usage: tests/run.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/tests/build"
JS="$ROOT/DarkFrameAnalyzer.js"

mkdir -p "$BUILD"

# #define values (same extraction as scripts/build-update-package.sh)
VERSION="$(sed -n '/^#define[[:space:]]\{1,\}VERSION[[:space:]]/{ s/^#define[[:space:]]\{1,\}VERSION[[:space:]]\{1,\}"\([^"]*\)".*/\1/p; q; }' "$JS")"
TITLE="$(sed -n '/^#define[[:space:]]\{1,\}TITLE[[:space:]]/{ s/^#define[[:space:]]\{1,\}TITLE[[:space:]]\{1,\}"\([^"]*\)".*/\1/p; q; }' "$JS")"
if [ -z "$VERSION" ] || [ -z "$TITLE" ]; then
   echo "ERROR: could not read #define VERSION/TITLE from $JS" >&2
   exit 1
fi

# Strip the preprocessor directives (including multi-line continuations),
# substitute the #define tokens, drop the main() invocation
awk '{ sub(/\r$/,"") } cont { cont = /\\$/; next } /^#/ { cont = /\\$/; next } { print }' "$JS" \
   | sed -e "s/\\bVERSION\\b/\"$VERSION\"/g" \
         -e "s/\\bTITLE\\b/\"$TITLE\"/g" \
         -e "s/\\bSCALE\\b/65535/g" \
         -e '/^main();$/d' \
   > "$BUILD/body.js"

node --check "$BUILD/body.js"
echo "OK   syntax (node --check)"

# Node module exposing the internals under test
cp "$BUILD/body.js" "$BUILD/module.js"
cat >> "$BUILD/module.js" <<'EOF'

module.exports = {
   DEFAULT_PARAMS: DEFAULT_PARAMS,
   STRINGS: STRINGS,
   tr: tr,
   setLanguage: function (lang) { gLanguage = lang; },
   arrayMedian: arrayMedian,
   arrayMAD: arrayMAD,
   histogramMAD: histogramMAD,
   iterativeClippedStats: iterativeClippedStats,
   detectOutliers: detectOutliers,
   buildCsv: buildCsv,
   csvField: csvField
};
EOF

failures=0
for t in "$ROOT"/tests/*.test.js; do
   if node "$t" > "$BUILD/last.log" 2>&1; then
      echo "OK   $(basename "$t")"
   else
      echo "FAIL $(basename "$t")"
      cat "$BUILD/last.log"
      failures=1
   fi
done

if [ "$failures" -ne 0 ]; then
   echo "Tests failed." >&2
   exit 1
fi
echo "All tests passed."
