// tr() substitutions, fallback, and EN/FR table consistency
global.Dialog = function () {};
const assert = require("assert");
const m = require(__dirname + "/build/module.js");

// Placeholder substitution in both languages
m.setLanguage("en");
assert.strictEqual(m.tr("rep.files", 50, 48),
   "Files       : 50 FITS analyzed (48 read successfully)");
m.setLanguage("fr");
assert.strictEqual(m.tr("rep.files", 50, 48),
   "Fichiers    : 50 FITS analysés (48 lus avec succès)");

// Unknown key falls back to the key itself
assert.strictEqual(m.tr("no.such.key"), "no.such.key");

// '$' patterns in substituted values must pass through verbatim
assert.strictEqual(m.tr("tt.error", "file$&weird.fits"),
   "Erreur : file$&weird.fits");

// Key parity between the two languages
const en = Object.keys(m.STRINGS.en).sort();
const fr = Object.keys(m.STRINGS.fr).sort();
assert.deepStrictEqual(
   en.filter(k => !fr.includes(k)), [],
   "keys missing in FR");
assert.deepStrictEqual(
   fr.filter(k => !en.includes(k)), [],
   "keys missing in EN");

// Same %n placeholders in each EN/FR string pair
for (const k of en) {
   const pe = (m.STRINGS.en[k].match(/%\d/g) || []).sort().join(",");
   const pf = (m.STRINGS.fr[k].match(/%\d/g) || []).sort().join(",");
   assert.strictEqual(pe, pf, `placeholder mismatch on "${k}"`);
}

console.log(`i18n: ${en.length} keys, EN/FR parity and placeholders consistent`);
