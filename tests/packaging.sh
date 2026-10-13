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
#   3. signing path exercised with a stubbed PixInsight -> .xsgn entry
#      added, no password in the published artifacts
#   4. failing signed build -> fails AND leaves no stale artifacts behind
#
# WARNING: rebuilds dist/ several times and leaves it in the state of the
# last (stub-signed) build. Rebuild unsigned before publishing anything.
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

echo "--- signing path with a stubbed PixInsight"
stub="$(mktemp -d)"
trap 'rm -rf "$stub"' EXIT
# The stub writes where the build script stages — same path derivation
cat > "$stub/fake-pi" <<EOF
#!/usr/bin/env bash
[ -n "\$XSSK_PASS" ] || { echo "stub: XSSK_PASS missing from the environment" >&2; exit 1; }
echo stub-signature > "$ROOT/dist/stage/DarkFrameAnalyzer.xsgn"
EOF
chmod +x "$stub/fake-pi"
touch "$stub/fake.xssk"
rm -rf dist
XSSK_PATH="$stub/fake.xssk" XSSK_PASS=stub-password PIXINSIGHT_BIN="$stub/fake-pi" \
   build > /dev/null
assert_entries "$BASE_ENTRIES
src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.xsgn" 6
if grep -r "stub-password" dist; then
   echo "ERROR: password leaked into the published artifacts" >&2
   exit 1
fi

echo "--- failing signed build: fails and leaves no stale artifacts"
printf '#!/usr/bin/env bash\nexit 7\n' > "$stub/fail-pi"
chmod +x "$stub/fail-pi"
if XSSK_PATH="$stub/fake.xssk" XSSK_PASS=bad PIXINSIGHT_BIN="$stub/fail-pi" \
      build > /dev/null 2>&1; then
   echo "ERROR: a failing signing did not fail the build" >&2
   exit 1
fi
if ls dist/DarkFrameAnalyzer-*.zip > /dev/null 2>&1; then
   echo "ERROR: a failed build left zip artifacts in dist/" >&2
   exit 1
fi
if [ -f dist/update-package.json ]; then
   echo "ERROR: a failed build left update-package.json in dist/" >&2
   exit 1
fi

echo "packaging battery passed"
