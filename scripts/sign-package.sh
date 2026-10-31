#!/usr/bin/env bash
#
# sign-package.sh <zip>
#
# Signs a package built by build-update-package.sh with the CaeloWorks identity
# of the Certified PixInsight Developer program (CPD Program Rules, rule 5.1),
# in place: the zip gains <NAME>.xsgn and is re-zipped reproducibly, and the
# update-package.json next to it gets the new sha1. Then it checks the result
# with check-package.sh --signed and verify-signature.sh.
#
#   XSSK_PATH=/path/to/caeloworks.xssk scripts/sign-package.sh dist/DarkFrameAnalyzer-X.Y.Z.zip
#
# The key password is read from stdin: prompted on a terminal, one line when
# piped. It is passed only through the environment of the PixInsight process that
# signs, and never written anywhere.
#
# What gets signed, and why only that:
#   Only the entry script, DarkFrameAnalyzer.js (it carries the #feature-id),
#   into DarkFrameAnalyzer.xsgn. A signature covers every file the entry
#   #includes, recursively - CodeSigning.html, section 6 - except the standard
#   scripting resources: the include/pjsr headers DFA uses are secure code,
#   excluded from the signed source, so a PixInsight update that changes them
#   does not invalidate this signature. DFA has no include of its own, so this
#   one signature covers all of its code. The signed code is canonicalized
#   (comments and blank lines removed): a tamper test has to change code.
#
#   Entitlements: the signature declares none (generateScriptSignatureFile gets
#   [], and the .xsgn carries no <Entitlements> element). verify-signature.sh
#   still prints com.pixinsight.security.pjsr.*,com.pixinsight.security.pcl.*:
#   those belong to the CaeloWorks identity, from its entry in PixInsight's
#   etc/security/certified-developers.xcdev. Nothing in the script needs more.
#
#   The file signed is the one in the zip, as it ships (LF line endings), not
#   DarkFrameAnalyzer.js in the repository.
#
# A signed zip is not reproducible: the signature carries a timestamp, so each
# signing gives a new sha1. The sidecar is what carries the right one.
#
set -euo pipefail

ZIP="${1:?usage: sign-package.sh <zip>}"
[ -f "$ZIP" ] || { echo "error: no such file: $ZIP" >&2; exit 1; }
ZIP="$( cd "$( dirname "$ZIP" )" && pwd )/$( basename "$ZIP" )"
SIDECAR="$( dirname "$ZIP" )/update-package.json"
[ -f "$SIDECAR" ] || { echo "error: no update-package.json next to $ZIP" >&2; exit 1; }
: "${XSSK_PATH:?set XSSK_PATH to the CaeloWorks signing keys (.xssk)}"
[ -f "$XSSK_PATH" ] || { echo "error: XSSK_PATH not found: $XSSK_PATH" >&2; exit 1; }

NAME="DarkFrameAnalyzer"
DEVELOPER="CaeloWorks"
VENDOR="src/scripts/CaeloWorks/$NAME"
REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

# shellcheck source=scripts/pi-run.sh
. "$REPO/scripts/pi-run.sh"
pi_setup
WORK="$( pi_tmpdir )"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/pkg"
( cd "$WORK/pkg" && unzip -q "$ZIP" )
[ -f "$WORK/pkg/$VENDOR/$NAME.js" ] || { echo "error: no $VENDOR/$NAME.js in $ZIP" >&2; exit 1; }
# Re-signing replaces, never stacks: start from no signature at all.
find "$WORK/pkg" -name '*.xsgn' -delete

# The files to sign, relative to the package directory, ';'-separated. The runner
# takes a list so that a second entry point, if one is ever added, is one word.
SIGN_LIST="$NAME.js"

if [ -t 0 ]; then
  printf 'PixInsight signing-key password for %s (not stored): ' "$DEVELOPER" >&2
fi
IFS= read -r -s __PW || true
[ -t 0 ] && echo >&2
[ -n "$__PW" ] || { echo "error: no password given" >&2; exit 1; }

# The runner signs, then checks each signature back through the core rather than
# trusting that a .xsgn appeared: a wrong password or a foreign key must fail here.
cat > "$WORK/sign.js" <<'PJSR'
var dir    = getEnvironmentVariable( "DFASIGN_DIR" ).replace( /\\/g, "/" );
var files  = getEnvironmentVariable( "DFASIGN_FILES" ).split( ";" );
var xssk   = getEnvironmentVariable( "DFASIGN_XSSK" ).replace( /\\/g, "/" );
var pw     = getEnvironmentVariable( "DFASIGN_PW" );
var report = getEnvironmentVariable( "DFASIGN_REPORT" ).replace( /\\/g, "/" );
var lines  = [];
for ( var i = 0; i < files.length; ++i )
{
   var js = dir + "/" + files[i];
   var xsgn = js.replace( /\.js$/, ".xsgn" );
   try
   {
      Security.generateScriptSignatureFile( xsgn, js, [], xssk, pw );
      var sig = Security.getScriptSignature( js );
      lines.push( ( sig.valid ? "valid " : "invalid " ) + sig.developerId + " " + files[i] );
   }
   catch ( e )
   {
      lines.push( "error - " + files[i] + " : " + e );
   }
}
lines.push( "done" );
File.writeTextFile( report, lines.join( "\n" ) + "\n" );
PJSR

REPORT="$WORK/report.txt"
DFASIGN_DIR="$( pi_native "$WORK/pkg/$VENDOR" )" DFASIGN_FILES="$SIGN_LIST" \
DFASIGN_XSSK="$( pi_native "$XSSK_PATH" )" DFASIGN_PW="$__PW" \
DFASIGN_REPORT="$( pi_native "$REPORT" )" \
  pi_run "$WORK/sign.js" DFASIGN_DIR DFASIGN_FILES DFASIGN_XSSK DFASIGN_PW DFASIGN_REPORT
unset __PW

[ -f "$REPORT" ] || {
  echo "error: PixInsight did not run the signing script" >&2
  echo "       (the runner is an unsigned script: is Preferences > Security >" >&2
  echo "       Allow execution of unsigned scripts turned on for this PixInsight?)" >&2
  exit 1
}
tr -d '\r' < "$REPORT" | sed 's/^/  sign: /' >&2
fail=0
IFS=';' read -r -a sign_files <<< "$SIGN_LIST"
for f in "${sign_files[@]}"; do
  grep -qxF "valid $DEVELOPER $f" <( tr -d '\r' < "$REPORT" ) \
    || { echo "error: $f is not validly signed by $DEVELOPER" >&2; fail=1; }
  [ -f "$WORK/pkg/$VENDOR/${f%.js}.xsgn" ] || { echo "error: no ${f%.js}.xsgn produced" >&2; fail=1; }
done
[ "$fail" = 0 ] || exit 1
rm -f "$WORK/sign.js" "$REPORT"

# Re-zip exactly as the build does and give the sidecar the new sha1, both in the
# work directory, and check them there: the zip and update-package.json next to
# it are replaced only once the signed pair has passed every check, so a failure
# at any point leaves them as they were.
OUT="$WORK/out"
mkdir -p "$OUT"
python3 "$REPO/scripts/repro-zip.py" "$WORK/pkg" "$OUT/$( basename "$ZIP" )"
SHA1="$( sha1sum "$OUT/$( basename "$ZIP" )" | cut -d' ' -f1 )"
python3 - "$SIDECAR" "$OUT/update-package.json" "$SHA1" <<'PY'
import json, sys
src, dest, sha1 = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src) as f:
    meta = json.load(f)
meta["sha1"] = sha1
with open(dest, "w") as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

bash "$REPO/scripts/check-package.sh" --signed "$OUT/$( basename "$ZIP" )"
bash "$REPO/scripts/verify-signature.sh" "$OUT/$( basename "$ZIP" )"

# Copy next to the targets first (the work directory may be on another
# filesystem), then rename: each file is swapped in one step.
cp "$OUT/$( basename "$ZIP" )" "$ZIP.signing"
cp "$OUT/update-package.json" "$SIDECAR.signing"
mv "$ZIP.signing" "$ZIP"
mv "$SIDECAR.signing" "$SIDECAR"
echo "$( basename "$ZIP" ) signed by $DEVELOPER - sha1 $SHA1 (update-package.json updated)"
