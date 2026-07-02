// iterativeClippedStats against an astropy-like sigma_clipped_stats reference
global.Dialog = function () {};
const assert = require("assert");
const m = require(__dirname + "/build/module.js");

function stats(arr) {
   const n = arr.length;
   if (n === 0) return { mean: 0, median: 0, std: 0 };
   const mean = arr.reduce((a, b) => a + b, 0) / n;
   const s = arr.slice().sort((a, b) => a - b);
   const mid = Math.floor(n / 2);
   const median = (n % 2) ? s[mid] : (s[mid - 1] + s[mid]) / 2;
   const v = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
   return { mean, median, std: Math.sqrt(v) };
}

// Mock of the PixInsight image API: values in [0,1], statistics honor
// the range clipping like PI's native engine
function MockImage(valuesADU) {
   const values = valuesADU.map(v => v / 65535);
   this.rangeClippingEnabled = false;
   this.rangeClipLow = 0;
   this.rangeClipHigh = 1;
   const visible = () => this.rangeClippingEnabled
      ? values.filter(v => v >= this.rangeClipLow && v <= this.rangeClipHigh)
      : values;
   this.mean = () => stats(visible()).mean;
   this.median = () => stats(visible()).median;
   this.stdDev = () => stats(visible()).std;
}

// astropy-like reference: iterate a mask at median ± 3*std, maxiters=5
function refSigmaClippedStats(arr) {
   let kept = arr.slice();
   for (let i = 0; i < 5; ++i) {
      const st = stats(kept);
      const lo = st.median - 3 * st.std, hi = st.median + 3 * st.std;
      const next = kept.filter(v => v >= lo && v <= hi);
      if (next.length === kept.length) break;
      kept = next;
   }
   return stats(kept);
}

let seed = 1234;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function gauss(mu, sigma) {
   const u = Math.max(rnd(), 1e-12), v = rnd();
   return Math.round(mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
}

// Synthetic dark: gaussian 672/198 + 3% violent hot pixels
const data = Array.from({ length: 120000 },
   () => Math.min(65535, Math.max(0, gauss(672, 198))));
for (let i = 0; i < data.length; i += 33)
   data[i] = 5000 + Math.floor(rnd() * 60000);

const img = new MockImage(data);
const got = m.iterativeClippedStats(img, img.median() * 65535, 198);
const ref = refSigmaClippedStats(data);

const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;
assert.ok(close(got.mean, ref.mean, 0.01), `meanClip ${got.mean} vs ${ref.mean}`);
assert.ok(close(got.median, ref.median, 0.01), `medianClip ${got.median} vs ${ref.median}`);
assert.ok(close(got.std, ref.std, 0.02), `stdClip ${got.std} vs ${ref.std}`);

// Range clipping must be restored for the caller
assert.strictEqual(img.rangeClippingEnabled, false, "clipping not restored");

// Degenerate case: constant image (float-noise tolerance on the mock)
const flat = new MockImage(Array.from({ length: 1000 }, () => 700));
const gotFlat = m.iterativeClippedStats(flat, 700, 0);
assert.strictEqual(Math.round(gotFlat.median), 700);
assert.ok(gotFlat.std < 1e-9, "constant image should have ~0 std");

console.log("clipping: aligned with sigma_clipped_stats, clipping restored, constant case handled");
