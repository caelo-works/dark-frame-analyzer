<div align="center">

# Dark Frame Analyzer

### Analyze your dark frame series and reject out-of-spec frames before WBPP integration

[![Version](https://img.shields.io/badge/version-1.9.0-22d3ee?style=for-the-badge&labelColor=0f172a)](https://github.com/caelo-works/dark-frame-analyzer/releases/latest)
[![PixInsight](https://img.shields.io/badge/PixInsight-%E2%89%A5%201.9.0-67e8f9?style=for-the-badge&labelColor=0f172a)](https://pixinsight.com/)
[![Status](https://img.shields.io/badge/status-stable-34d399?style=for-the-badge&labelColor=0f172a)](https://pixinsight-scripts.caelo.works/en/scripts/dark-frame-analyzer)
[![License](https://img.shields.io/badge/license-GPL--3.0-94a3b8?style=for-the-badge&labelColor=0f172a)](LICENSE)
[![Website](https://img.shields.io/badge/%E2%86%92%20see%20all%20scripts-pixinsight--scripts.caelo.works-0f172a?style=for-the-badge&labelColor=22d3ee)](https://pixinsight-scripts.caelo.works/en)

[![CaeloWorks · PixInsight Scripts](https://pixinsight-scripts.caelo.works/assets/readme-banner.png)](https://pixinsight-scripts.caelo.works/en)

</div>

---

## Overview

A bad dark silently degrades your master dark — and everything calibrated
with it. Dark Frame Analyzer inspects a whole series at once, computes
robust per-frame statistics (clipped median, exact MAD, hot pixels, thermal
drift, spatial uniformity) and flags the frames that don't belong, so you
integrate only clean darks in WBPP. Results appear in a color-coded table,
a detailed console report, a CSV export and a ready-to-use exclusion list.

> 📖 **Full details, screenshots & docs:** **[pixinsight-scripts.caelo.works/en/scripts/dark-frame-analyzer](https://pixinsight-scripts.caelo.works/en/scripts/dark-frame-analyzer)**

## Screenshots

<div align="center">

![Main dialog with the analyzed dark series and color-coded status](https://pixinsight-scripts.caelo.works/assets/scripts/dark-frame-analyzer-1-dialog.webp)

![WBPP exclusions dialog with the list of rejected frames](https://pixinsight-scripts.caelo.works/assets/scripts/dark-frame-analyzer-2-exclusions.webp)

</div>

## Features

| | |
|---|---|
| ✨ **Robust outlier detection** | Series-relative statistics (median, exact MAD, hot pixels, thermal drift, spatial uniformity) with anti-quantization safeguards — ADC quantization steps never become false positives |
| ⚡ **Native-speed statistics** | Histograms and iterative sigma clipping (astropy-style, converged) computed by PixInsight's C++ engine — a 50-frame series is analyzed in seconds |
| 🛠️ **WBPP-ready workflow** | Exclusion list as text or file, or one click to move rejected frames to a `rejected/` subdirectory WBPP never sees |
| 📊 **Full reporting** | Color-coded results table with per-frame tooltips, detailed console report, CSV export with stable machine-readable headers |
| 🎛️ **Tunable & persistent** | Every detection threshold is adjustable, remembered across sessions, and restorable with one *Defaults* click |
| 🌍 **Bilingual UI** | English and French, switchable live, choice remembered — FITS and XISF input |

## Installation

### From the CaeloWorks update repository (recommended)

In PixInsight, open **Resources → Updates → Manage Repositories** and add
`https://pixinsight-scripts.caelo.works/update/`, then run
**Resources → Updates → Check for Updates**, accept the install and restart.
Updates are then delivered automatically through the same channel.

> The repository is not CPD-signed yet, so PixInsight shows an
> "unsigned repository" warning; signing is underway.

### Manual install

Download `DarkFrameAnalyzer.js` from the **[Releases](https://github.com/caelo-works/dark-frame-analyzer/releases)**, then in
PixInsight use **Script → Feature Scripts…**, click **Add** and select the
folder containing the file. Alternatively, run it once via
**Script → Execute Script File…**.

> **Requires PixInsight 1.9.0 or newer** — Windows, macOS and Linux.

## Getting started

1. Add your dark frames — FITS or XISF, individual files or a whole directory.
2. Adjust the detection thresholds if needed (defaults are calibrated for IMX585-class sensors and persist across sessions).
3. Click **Analyze**: each frame is classified **Valid** / **Alert** / **Rejected**, with the reasons in the status tooltip and the full report in the process console.
4. Export the **CSV** for your records, and use **WBPP exclusions…** to keep the flagged frames out of integration.

## Development

<details>
<summary><b>Tests &amp; CI</b></summary>

Logic-level tests (statistics, CSV, i18n, outlier detection) run under
Node without PixInsight:

```bash
tests/run.sh
```

The same suite plus a packaging dry-run runs in CI on every pull request;
GUI and image I/O are validated manually in PixInsight.

</details>

## Releasing — update-repository package

Distribution through the CaeloWorks update repository relies on a
standardized artifact built here and ingested by the site repository
(which owns the aggregated, signed `updates.xri`). To build it:

```bash
RELEASE_DATE=YYYYMMDD scripts/build-update-package.sh <version>
```

This produces two files under `dist/`:

- **`DarkFrameAnalyzer-<version>.zip`** — the install tree extracted as-is
  by the PixInsight updater: the script under
  `src/scripts/CaeloWorks/DarkFrameAnalyzer/` plus its icon, shipped both
  next to the script (dialog header emblem) and under
  `rsc/icons/script/DarkFrameAnalyzer/` (the `#feature-icon` location for
  menus). The archive is reproducible on a given build environment (fixed
  entry order, mtimes, permissions, line endings and creator system):
  rebuilt there, its sha1 only changes when the content changes.
- **`update-package.json`** — the metadata contract for the site: name,
  slug, version, `fileName`, `sha1`, type, `releaseDate`,
  `piVersionRange`, title and `descriptionHtml`.

The version is read from the `#define VERSION` line of
`DarkFrameAnalyzer.js` (single source of truth); the build fails if the
version passed as argument doesn't match.

**Every GitHub release must attach three assets:** `DarkFrameAnalyzer.js`,
the versioned zip and `update-package.json` — and move the corresponding
`CHANGELOG.md` entries out of *Unreleased*.

### Code signing (not enabled yet)

Once the CaeloWorks CPD identity is validated by Pleiades Astrophoto,
releases will be signed by pointing the build at the key file:

```bash
XSSK_PATH=/path/to/key.xssk scripts/build-update-package.sh <version>
```

The key password is prompted on the terminal and handed to PixInsight as
a command-scoped environment variable — the build never writes it to a
file, a log or a command line, and none of its other child processes see
it. Presetting `XSSK_PASS` in the environment skips the prompt (for
automation): the build un-exports it immediately, but the value then
lives in *your* shell history or CI configuration before reaching it.
Signing runs inside a local PixInsight installation and adds the `.xsgn`
next to the script in the zip. A signed zip is not byte-reproducible
across signings (the signature is timestamped): each signing produces a
new sha1, which the update repository re-ingests. **Until the identity is
validated, releases stay unsigned on purpose** — an unverifiable
signature is worse for users than the dismissable "unsigned" warning.

## Links

- 🌐 **Script page:** [pixinsight-scripts.caelo.works/en/scripts/dark-frame-analyzer](https://pixinsight-scripts.caelo.works/en/scripts/dark-frame-analyzer)
- 📦 **Releases:** [github.com/caelo-works/dark-frame-analyzer/releases](https://github.com/caelo-works/dark-frame-analyzer/releases)

---

<div align="center">

### 🌌 More PixInsight scripts by CaeloWorks

**[Explore the full catalogue → pixinsight-scripts.caelo.works](https://pixinsight-scripts.caelo.works/en)**

<sub>Made by <a href="https://caelo.works/en">CaeloWorks</a> · astrophotography software, firmware & hardware · GPL-3.0 License</sub>

<sub>PixInsight is a registered trademark of Pleiades Astrophoto, S.L. CaeloWorks is an independent third-party developer.</sub>

</div>
