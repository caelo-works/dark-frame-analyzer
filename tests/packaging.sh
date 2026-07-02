#!/usr/bin/env bash
# ============================================================================
# tests/packaging.sh — packaging battery for build-update-package.sh
# ============================================================================
#
# Runs locally and in CI (same script):
#   1. unsigned build twice -> determinism on this environment (same sha1)
#   2. unsigned zip -> exact entry set, install layout, valid JSON contract
#   3. signing path exercised with a stubbed PixInsight -> two entries,
#      .xsgn present, no password in the published artifacts
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

echo "--- unsigned zip: install layout and exact entry set"
unzip -l dist/DarkFrameAnalyzer-*.zip | grep -q "src/scripts/CaeloWorks/DarkFrameAnalyzer/DarkFrameAnalyzer.js"
test "$(unzip -Z1 dist/DarkFrameAnalyzer-*.zip | wc -l)" -eq 1
python3 -m json.tool dist/update-package.json > /dev/null

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
test "$(unzip -Z1 dist/DarkFrameAnalyzer-*.zip | wc -l)" -eq 2
unzip -Z1 dist/DarkFrameAnalyzer-*.zip | grep -q '\.xsgn$'
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
