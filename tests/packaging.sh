#!/usr/bin/env bash
# ============================================================================
# tests/packaging.sh — packaging battery for build-update-package.sh
# ============================================================================
#
# Runs locally and in CI (same script):
#   1. unsigned build twice -> determinism on this environment (same sha1)
#   2. unsigned zip -> exact entry set (script + icon in both install
#      locations + compiled documentation pages), install layout, valid
#      JSON contract
#   2b. CPD Program Rules compliance of the package (rule 4.2): every entry
#      in a deployment directory of the PixInsight Update Repository
#      Reference, no etc/ tree, no file of the PixInsight distribution
#      (checked against etc/security/protected when an installation is
#      available), and the integrated documentation page named after the
#      #feature-id of the script
#   3. scripts/check-package.sh on the unsigned zip (the update site's
#      ingest contract)
#   4. scripts/sign-package.sh driven against a stubbed PixInsight: the
#      .xsgn is added next to the entry script, every other file stays
#      byte-identical, update-package.json gets the new sha1,
#      check-package.sh --signed passes, the password reaches no artifact;
#      a refused signature fails AND leaves the zip and sidecar untouched
#
# The real signing needs PixInsight and the CaeloWorks keys: never in CI.
#
# Leaves dist/ in the state of a clean unsigned build.
#
# Usage: tests/packaging.sh [expected-version]
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPECTED="${1:-}"
build() {
   RELEASE_DATE=20000101 scripts/build-update-package.sh ${EXPECTED:+"$EXPECTED"}
}

echo "--- unsigned build, twice: determinism on this environment"
rm -rf dist
build > /dev/null
first=$(sha1sum dist/DarkFrameAnalyzer-*.zip | cut -d' ' -f1)
rm -rf dist
build > /dev/null
second=$(sha1sum dist/DarkFrameAnalyzer-*.zip | cut -d' ' -f1)
echo "sha1: $first / $second"
test "$first" = "$second"

BASE_ENTRIES="src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.js
src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.svg
rsc/icons/script/DarkFrameAnalyzer/DarkFrameAnalyzer.svg
doc/scripts/DarkFrameAnalyzer/DarkFrameAnalyzer.html
doc/scripts/DarkFrameAnalyzer-fr/DarkFrameAnalyzer-fr.html"
assert_entries() {
   # Exact-path membership for every expected entry (no regex, no suffix
   # matching: a misplaced file must fail even if the count is right)
   while IFS= read -r entry; do
      unzip -Z1 dist/DarkFrameAnalyzer-*.zip | grep -qxF "$entry"
   done <<< "$1"
   test "$(unzip -Z1 dist/DarkFrameAnalyzer-*.zip | wc -l)" -eq "$2"
}

echo "--- unsigned zip: install layout and exact entry set"
assert_entries "$BASE_ENTRIES" 5
python3 -m json.tool dist/update-package.json > /dev/null

echo "--- CPD Program Rules: deployment directories and protected files"
# Rule 4.2: the deployment directories of the Update Repository Reference
# (Table 3). Anything else is reserved to official PixInsight packages.
ALLOWED_DIRS='^(bin|rsc/icons/(script|module)|rsc/cursors/(script|module)|rsc/images/(script|module)|src/scripts|doc/docs|doc/tools|doc/scripts)/'
outside="$(unzip -Z1 dist/DarkFrameAnalyzer-*.zip | grep -Ev "$ALLOWED_DIRS" || true)"
if [ -n "$outside" ]; then
   echo "ERROR: entries outside the allowed deployment directories:" >&2
   echo "$outside" >&2
   exit 1
fi
if unzip -Z1 dist/DarkFrameAnalyzer-*.zip | grep -Eq '(^|/)etc/'; then
   echo "ERROR: the package contains an etc/ tree" >&2
   exit 1
fi
PROTECTED_LIST="${PROTECTED_LIST:-/mnt/c/Program Files/PixInsight/etc/security/protected}"
if [ -f "$PROTECTED_LIST" ]; then
   clash="$(unzip -Z1 dist/DarkFrameAnalyzer-*.zip \
            | grep -xFf <(tr -d '\r' < "$PROTECTED_LIST" | sed '/^$/d') || true)"
   if [ -n "$clash" ]; then
      echo "ERROR: the package ships files protected by the PixInsight distribution:" >&2
      echo "$clash" >&2
      exit 1
   fi
   echo "protected files: none ($(grep -c . "$PROTECTED_LIST") entries checked)"
else
   echo "protected files: skipped (no PixInsight installation; set PROTECTED_LIST)"
fi
# PixInsight integrates the documentation page named after #feature-id
FEATURE_ID="$(sed -n 's/^#feature-id[[:space:]]\{1,\}\([^[:space:]]\{1,\}\).*/\1/p' DarkFrameAnalyzer.js | head -n 1)"
test -n "$FEATURE_ID"
unzip -Z1 dist/DarkFrameAnalyzer-*.zip | grep -qxF "doc/scripts/$FEATURE_ID/$FEATURE_ID.html"

echo "--- update site ingest contract (unsigned)"
scripts/check-package.sh dist/DarkFrameAnalyzer-*.zip
if scripts/check-package.sh --signed dist/DarkFrameAnalyzer-*.zip > /dev/null; then
   echo "ERROR: check-package.sh --signed accepted an unsigned zip" >&2
   exit 1
fi

echo "--- sign-package.sh with a stubbed PixInsight"
stub="$(mktemp -d)"
trap 'rm -rf "$stub"' EXIT
# Plays both PJSR runners (sign, verify) the way PixInsight would: reads
# their inputs from the environment, writes their report. Only the password
# "right-password" signs.
cat > "$stub/fake-pi" <<'EOF'
#!/usr/bin/env bash
if [ -n "${DFASIGN_REPORT:-}" ]; then
   IFS=';' read -r -a files <<< "$DFASIGN_FILES"
   : > "$DFASIGN_REPORT"
   for f in "${files[@]}"; do
      if [ "$DFASIGN_PW" = right-password ]; then
         printf '<?xml version="1.0" encoding="UTF-8"?>\n<xsgn version="1.0">\n<Signature scriptId="DarkFrameAnalyzer" developerId="CaeloWorks" timestamp="%s">stub</Signature>\n</xsgn>\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" > "$DFASIGN_DIR/${f%.js}.xsgn"
         echo "valid CaeloWorks $f" >> "$DFASIGN_REPORT"
      else
         echo "error - $f : Invalid signing keys file" >> "$DFASIGN_REPORT"
      fi
   done
   echo done >> "$DFASIGN_REPORT"
elif [ -n "${DFAVERIFY_REPORT:-}" ]; then
   if [ -f "${DFAVERIFY_JS%.js}.xsgn" ]; then
      echo "valid CaeloWorks DarkFrameAnalyzer 2026-01-01T00:00:00Z identity entitlements []" > "$DFAVERIFY_REPORT"
   else
      echo "invalid  DarkFrameAnalyzer" > "$DFAVERIFY_REPORT"
   fi
fi
EOF
chmod +x "$stub/fake-pi"
touch "$stub/fake.xssk"
ZIP="$(ls dist/DarkFrameAnalyzer-*.zip)"
unsigned_sha1="$(sha1sum "$ZIP" | cut -d' ' -f1)"
mkdir "$stub/unsigned"
( cd "$stub/unsigned" && unzip -q "$ROOT/$ZIP" )

# A refused signature: fails, zip and sidecar untouched
if echo wrong-password | PI_EXE="$stub/fake-pi" XSSK_PATH="$stub/fake.xssk" \
      scripts/sign-package.sh "$ZIP" > /dev/null 2>&1; then
   echo "ERROR: sign-package.sh succeeded with a refused signature" >&2
   exit 1
fi
test "$(sha1sum "$ZIP" | cut -d' ' -f1)" = "$unsigned_sha1"
grep -q "\"sha1\": \"$unsigned_sha1\"" dist/update-package.json

# A good signature
echo right-password | PI_EXE="$stub/fake-pi" XSSK_PATH="$stub/fake.xssk" \
   scripts/sign-package.sh "$ZIP" > /dev/null
assert_entries "$BASE_ENTRIES
src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.xsgn" 6
signed_sha1="$(sha1sum "$ZIP" | cut -d' ' -f1)"
test "$signed_sha1" != "$unsigned_sha1"
python3 - dist/update-package.json "$signed_sha1" <<'PYEOF'
import json, sys
meta = json.load(open(sys.argv[1]))
assert meta["sha1"] == sys.argv[2], "sidecar sha1 not rewritten"
assert meta["version"] and meta["fileName"], "sidecar fields lost"
PYEOF
# Every shipped file is byte-identical to the unsigned build's
mkdir "$stub/signed"
( cd "$stub/signed" && unzip -q "$ROOT/$ZIP" )
diff -r -x '*.xsgn' "$stub/unsigned" "$stub/signed"
scripts/check-package.sh --signed "$ZIP" > /dev/null
if grep -rq "right-password" dist "$stub/signed"; then
   echo "ERROR: password leaked into the published artifacts" >&2
   exit 1
fi
# A second signature is rejected
cp "$stub/signed/src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.xsgn" \
   "$stub/signed/src/scripts/CaeloWorks/DarkFrameAnalyzer/Other.xsgn"
python3 scripts/repro-zip.py "$stub/signed" "$stub/two-sigs.zip"
if scripts/check-package.sh --signed "$stub/two-sigs.zip" > /dev/null; then
   echo "ERROR: check-package.sh accepted a second signature" >&2
   exit 1
fi

# Back to a clean unsigned build
rm -rf dist
build > /dev/null

echo "packaging battery passed"
