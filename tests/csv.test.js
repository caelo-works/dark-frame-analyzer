// buildCsv: column alignment, escaping, sorting, absent values
global.Dialog = function () {};
const assert = require("assert");
const m = require(__dirname + "/build/module.js");

function metric(overrides) {
   const base = {
      filename: "dark_0001.fits", filepath: "/data/dark_0001.fits",
      dateObs: "2026-04-17T09:58:00", imageType: "DARK",
      gain: 252, offset: 30, exptime: 120, setTemp: -10, ccdTemp: -9.9,
      tempDeviation: 0.1, readoutMode: "HCG;mode", bayerPat: "RGGB",
      width: 3856, height: 2180, min: 0, max: 65535, mean: 700.123,
      median: 672, stdDev: 350.5, mad: 198.1, meanClip: 695.28,
      medianClip: 672, stdClip: 190.2, nHot1k: 2605, nHot5k: 2605,
      nHot10k: 100, nSaturated: 29, nZero: 0, centreMedian: 671.5,
      maxCornerDelta: 3.2, severity: "warning",
      flags: ['median offset (736.0 vs ref 672.0)', 'noise "weird"'],
      error: null
   };
   return Object.assign(base, overrides || {});
}

const errored = metric({
   filename: "bad.fits", filepath: "/data/bad.fits", dateObs: null,
   imageType: null, gain: null, offset: null, exptime: null, setTemp: null,
   ccdTemp: null, tempDeviation: null, readoutMode: null, bayerPat: null,
   centreMedian: null, maxCornerDelta: null, severity: "critical",
   flags: ["read error"], error: "unable to open"
});

const csv = m.buildCsv([metric(), errored]);
const lines = csv.trim().split("\n");

// Field count identical on every line (naive split outside quotes)
function countFields(line) {
   let n = 1, inQ = false;
   for (const c of line) {
      if (c === '"') inQ = !inQ;
      else if (c === ";" && !inQ) n++;
   }
   return n;
}
const nHead = countFields(lines[0]);
assert.strictEqual(nHead, 33, "expected 33 columns");
for (let i = 1; i < lines.length; ++i)
   assert.strictEqual(countFields(lines[i]), nHead, `line ${i} misaligned`);

// Sorted by dateObs: the errored frame (null date) comes first
assert.ok(lines[1].startsWith("bad.fits;"), "null dateObs should sort first");

// Headers are fixed English identifiers, independent from the UI language
assert.ok(lines[0].startsWith("file;path;date_obs;"), "unexpected headers");

// Escaping: separator inside a field gets quoted, quotes get doubled
assert.ok(csv.includes('"HCG;mode"'), "separator not quoted");
assert.ok(csv.includes('""weird""'), "quotes not doubled");

// Absent values are empty fields, not 'null'
assert.ok(!csv.includes("null"), "null leaked into the CSV");

console.log("csv: 33 columns aligned, escaping and sorting correct");
