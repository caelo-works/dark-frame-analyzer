# Changelog

All notable changes to Dark Frame Analyzer are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Script icon (`DarkFrameAnalyzer.svg`): shown by PixInsight in menus and
  Feature Scripts (`#feature-icon`), and shipped in the update package.
- Dialog header: icon, script title and a clickable "by CaeloWorks" link
  to the script catalogue.
- Script identifier in `#feature-id` — required by PixInsight to resolve
  the menu icon and to code-sign the script.
- GPL-3.0 license (LICENSE file and copyright headers).
- Distribution packaging for the CaeloWorks update repository
  (`scripts/build-update-package.sh`: reproducible install zip +
  `update-package.json` metadata contract).
- Node test suite (`tests/`) covering the statistics, CSV export,
  translations and outlier detection, and a CI pipeline (tests +
  packaging dry-run) required on every pull request.
- Optional code-signing step in the packaging (disabled until the
  CaeloWorks CPD identity is validated): `XSSK_PATH` triggers `.xsgn`
  generation through PixInsight. The key password is prompted (or preset
  for automation) and never persisted by the build.

### Changed
- README rewritten in English on the CaeloWorks template.
- The script now lives in the "CaeloWorks" menu category (was Utilities).
- The code-signing driver uses the actual PixInsight Security API
  (`loadSigningKeysFile` + 6-argument `generateScriptSignatureFile`),
  verified against PixInsight 1.9.4 with a local development key.

### Removed
- The Python reference implementation (`analyze_darks_series.py`). It had
  been frozen at the v1.0 behavior while the PixInsight script moved on
  (spatial uniformity detection, extended anti-quantization safeguards,
  CSV export, XISF); the versioned Node test suite now plays the
  statistical-reference role. It remains available in the git history.

## [1.8.0] — 2026-07-02

### Added
- Detection thresholds persist across sessions; a *Defaults* button
  restores the original values.

## [1.7.0] — 2026-07-02

### Added
- XISF dark frames are accepted alongside FITS (file picker and
  directory scan).

## [1.6.0] — 2026-07-02

### Added
- Spatial uniformity enters outlier detection: new "Δ corners" column,
  absolute gradient threshold (light leaks) and series-relative
  statistical check (abnormal amp glow), with a "Uniformity" settings
  group.

### Fixed
- No more false uniformity alerts on ADC-quantized values: the
  statistical test only engages when the series shows natural dispersion.
- Table columns fit their content and the File column absorbs the
  remaining width — no horizontal scrollbar, no elided "#" numbers on
  scaled displays.

## [1.5.0] — 2026-07-02

### Changed
- Clipped statistics now iterate to convergence (like astropy's
  `sigma_clipped_stats`) instead of a single clipping pass.

## [1.4.0] — 2026-07-02

### Changed
- The robust MAD is now exact, derived from the 16-bit histogram, instead
  of the Gaussian `avgDev × 1.2533` approximation that hot pixel tails
  inflated.

## [1.3.0] — 2026-07-02

### Added
- Bilingual interface (English/French): live language selector, choice
  persisted across sessions. English is the default and the reference.

### Changed
- CSV headers are fixed English identifiers regardless of the UI
  language.

## [1.2.0] — 2026-07-02

### Added
- "WBPP exclusions" dialog: list of frames to keep out of integration,
  `.txt` export, and one-click move of rejected files to a `rejected/`
  subdirectory.

## [1.1.0] — 2026-07-02

### Added
- CSV export of all per-frame metrics (33 columns, stable headers).

## [1.0.2] — 2026-07-02

### Fixed
- The interface is locked during an analysis: no re-entrant run or file
  list mutation mid-processing.

## [1.0.1] — 2026-07-02

### Fixed
- Row/data desynchronization after sorting the table: removal and
  re-analysis now target the right files (rows are identified by file
  path, never by index).

## [1.0.0] — 2026-07-02

### Added
- Initial release: dark series analysis for PixInsight — per-frame
  statistics (clipped median, MAD, hot pixels, saturation, thermal
  drift), robust series-relative outlier detection with
  anti-quantization safeguards, color-coded results table and detailed
  console report. Includes the Python reference implementation.

[Unreleased]: https://github.com/caelo-works/dark-frame-analyzer/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/caelo-works/dark-frame-analyzer/releases/tag/v1.8.0
