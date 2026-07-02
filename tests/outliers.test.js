// detectOutliers: every check, including the anti-quantization safeguards
const assert = require("assert");
const m = require(__dirname + "/build/module.js");

function metric(overrides) {
   const base = {
      error: null, medianClip: 672, mad: 198, nHot5k: 2600,
      tempDeviation: 0.1, nSaturated: 20, maxCornerDelta: 5,
      filepath: "/x", filename: "x", dateObs: ""
   };
   return Object.assign(base, overrides || {});
}
function series(n, overrides) {
   return Array.from({ length: n }, (_, i) =>
      metric(Object.assign({ maxCornerDelta: 4 + (i % 3) }, overrides || {})));
}
function run(metrics) { return m.detectOutliers(metrics, m.DEFAULT_PARAMS); }

// --- Homogeneous series: everything ok -----------------------------------
{
   const res = run(series(10));
   assert.ok(res.metrics.every(x => x.severity === "ok"), "clean series flagged");
   assert.ok(res.refs !== null, "refs missing");
}

// --- Uniformity: statistical outlier and absolute gradient ----------------
{
   const metrics = series(10);
   metrics.push(metric({ maxCornerDelta: 40 }));   // outlier vs series
   metrics.push(metric({ maxCornerDelta: 150 }));  // above absolute threshold
   metrics.push(metric({ maxCornerDelta: null })); // metric absent: never flagged
   const res = run(metrics);
   assert.strictEqual(res.metrics[10].severity, "warning");
   assert.match(res.metrics[10].flags.join(), /uniformity|uniformité/);
   assert.strictEqual(res.metrics[11].severity, "warning");
   assert.match(res.metrics[11].flags.join(), /gradient/);
   assert.strictEqual(res.metrics[12].severity, "ok");
}

// --- Anti-quantization: ADC-stepped deltas (16 ADU), series MAD = 0 -------
// One quantization step must NOT become a multi-sigma outlier
{
   const metrics = [];
   for (let i = 0; i < 23; ++i) metrics.push(metric({ maxCornerDelta: 64 }));
   for (let i = 0; i < 10; ++i) metrics.push(metric({ maxCornerDelta: 48 }));
   const res = run(metrics);
   assert.ok(res.metrics.every(x => x.severity === "ok"),
      "quantized deltas produced false positives");
}

// --- Median: absolute critical deviation ----------------------------------
{
   const metrics = series(10);
   metrics.push(metric({ medianClip: 672 + 200 }));  // > crit threshold (128)
   const res = run(metrics);
   assert.strictEqual(res.metrics[10].severity, "critical");
   assert.match(res.metrics[10].flags.join(), /median|médiane/);
}

// --- Temperature drift and massive saturation are critical ----------------
{
   const metrics = series(10);
   metrics.push(metric({ tempDeviation: 1.0 }));
   metrics.push(metric({ nSaturated: 5000 }));
   const res = run(metrics);
   assert.strictEqual(res.metrics[10].severity, "critical");
   assert.match(res.metrics[10].flags.join(), /drift|dérive/);
   assert.strictEqual(res.metrics[11].severity, "critical");
   assert.match(res.metrics[11].flags.join(), /saturation/);
}

// --- Read error: critical with a readError flag ---------------------------
{
   const metrics = series(10);
   metrics.push(metric({ error: "unable to open" }));
   const res = run(metrics);
   assert.strictEqual(res.metrics[10].severity, "critical");
   assert.match(res.metrics[10].flags.join(), /read error|erreur lecture/);
}

// --- Fewer than 3 valid frames: no statistical detection -------------------
{
   const res = run([metric(), metric({ error: "boom" })]);
   assert.strictEqual(res.refs, null);
   assert.strictEqual(res.metrics[0].severity, "ok");
   assert.strictEqual(res.metrics[1].severity, "critical");
}

console.log("outliers: uniformity, quantization safeguard, median, temperature, saturation, errors — all good");
