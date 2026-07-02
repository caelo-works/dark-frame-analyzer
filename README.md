# Dark Frame Analyzer

A PixInsight script that analyzes a series of dark frames, computes key
statistics for each frame, and flags out-of-spec darks to exclude before
integration in WBPP.

Calibrated for IMX585-class sensors (ATR585C), but every detection
threshold is adjustable from the GUI.

## Contents

| File | Description |
|---|---|
| `DarkFrameAnalyzer.js` | PixInsight (PJSR) script with GUI — main version |
| `analyze_darks_series.py` | Python reference implementation (CLI), requires `numpy` + `astropy` |

## Installation

Either add the directory containing `DarkFrameAnalyzer.js` through
`Script > Feature Scripts...` (the script then appears under
`Script > Utilities > DarkFrameAnalyzer`), or run it directly with
`Script > Execute Script File...`.

## Usage

1. Add dark frames — FITS or XISF, individual files or a whole directory.
2. Adjust the detection thresholds if needed (they persist across sessions;
   the *Defaults* button restores the original values).
3. Run the analysis — every dark is classified **Valid** / **Alert** /
   **Rejected**, with the reasons shown in the status tooltip and a full
   report written to the process console.
4. Export the results:
   - **Export CSV...** — one row per frame with all metrics (headers are
     stable English identifiers, decimal point notation);
   - **WBPP exclusions...** — the list of frames to keep out of
     integration: copy it, export it as a `.txt` file, or physically move
     the files to a `rejected/` subdirectory so WBPP never sees them.

The interface is available in English and French (top-right selector,
choice remembered across sessions).

## Metrics and outlier detection

For each dark frame:

- **Clipped median** (thermal signal) — compared to the series reference
  with absolute (ADU) and statistical (sigma) thresholds
- **Robust MAD** (noise) — exact value derived from a 16-bit histogram,
  sigma-equivalent (×1.4826), immune to hot pixel tails
- **Clipped statistics** — iterative sigma clipping to convergence, like
  astropy's `sigma_clipped_stats`
- **Hot pixels** — count above a configurable ADU threshold
- **Saturation** — pixels ≥ 65500 ADU
- **Thermal drift** — difference between `SET-TEMP` and `CCD-TEMP`
- **Spatial uniformity** — center vs corner medians (amp glow, gradients,
  light leaks), with both an absolute gradient threshold and a
  series-relative statistical test

Outlier detection uses robust statistics (series median + MAD) with
anti-quantization safeguards: statistical tests only engage when the
series shows a natural dispersion, so ADC quantization steps never turn
into false positives.

## Python reference script

```bash
pip install numpy astropy
python analyze_darks_series.py /path/to/darks
```
