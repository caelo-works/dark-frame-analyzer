# Dark Frame Analyzer — support knowledge base

**This is written for a support agent, not for a user.** Quote it, do not
paraphrase it: the sentences here are checked, a paraphrase is not.

Applies to **1.9.0**. **The version is not printed in the window title.** To check
what a user is running: have them hover the mouse over the **by CaeloWorks** link
under the title in the script's window — the tooltip ends with the version
(`— v1.9.0`).

**The interface is bilingual — English and French — and the user will describe
*their* window.** A French user says *« Rejet »*, not "Rejected"; *« Seuils de
détection »*, not "Detection thresholds". Every label in this document is given in
both languages for that reason. If a user quotes a label you cannot find here, say
so and escalate rather than guess which control they mean.

**Never invent a figure, a path, a menu name, a threshold or a compatibility
claim.** This script tells astrophotographers which of their calibration frames to
throw away; a confident wrong answer costs them real data. If the answer is not in
this document, the correct answer is *"I don't know, I'm passing this to the team."*

- Repository and issue tracker: https://github.com/caelo-works/dark-frame-analyzer
- Product page: https://pixinsight-scripts.caelo.works/en/scripts/dark-frame-analyzer

---

## The product card — what Dark Frame Analyzer is

Dark Frame Analyzer is a **PixInsight script** that inspects a whole series of dark
frames at once, computes robust statistics for each frame, and flags the frames
that do not belong with the rest of the series — so the user integrates only clean
darks into their master dark in WBPP.

| | |
|---|---|
| Version | 1.9.0 |
| Licence | GPL-3.0 — free and open source |
| Requires | **PixInsight 1.9.0 or newer** — Windows, macOS, Linux |
| Where it appears | **Script → CaeloWorks → DarkFrameAnalyzer** |
| Input formats | FITS (`.fits`, `.fit`) and XISF (`.xisf`) |

**The menu entry is spelled `DarkFrameAnalyzer`, as one word, with no spaces.** The
window that opens is titled **Dark Frame Analyzer**. Users looking for a
three-word menu entry sometimes report they cannot find it.

**What it does, in order:**

1. The user adds dark frames — individual files or a whole directory.
2. **Analyze** (*« Analyser »*) opens each frame in turn and measures it: clipped
   median, exact MAD (noise), hot pixels, saturated pixels, sensor temperature
   drift, and spatial uniformity (centre versus corners).
3. It then compares every frame **to the series itself** and classifies each one
   **Valid** / **Alert** / **Rejected** (*« Valide » / « Alerte » / « Rejet »*).
4. Results land in a colour-coded table, in a full report in the **Process
   Console**, in a **CSV export**, and in a **WBPP exclusions** list.

**It never modifies a dark frame.** The only thing it can write is a CSV file, a
`.txt` exclusion list, or — on explicit confirmation — *move* rejected files into a
`rejected/` subdirectory.

**There is no process icon and no headless mode.** Dark Frame Analyzer is a dialog
only: it has no *New Instance* triangle, and its settings cannot be saved as a
process icon or replayed from a script. Users coming from other CaeloWorks scripts
ask for this. It does not exist in 1.9.0; do not promise it.

---

## Installation — how to install Dark Frame Analyzer

Two routes. The first is the one to recommend.

### From the CaeloWorks update repository (recommended)

1. In PixInsight: **Resources → Updates → Manage Repositories**.
2. Add this URL: `https://pixinsight-scripts.caelo.works/update/`
3. **Resources → Updates → Check for Updates**, accept the install.
4. **Restart PixInsight.** The script will not appear until you do.

Updates then arrive automatically through the same channel. This route also
installs the script's icon, so it shows up next to the menu entry.

### "PixInsight warns me about an unsigned repository"

**Expected, and harmless.** The CaeloWorks repository is not CPD-signed yet;
signing is underway. It is a signature on the *repository*, not a virus warning.
Tell the user it is safe to accept.

### Manual install

1. Download `DarkFrameAnalyzer.js` from the releases page:
   https://github.com/caelo-works/dark-frame-analyzer/releases
2. In PixInsight: **Script → Feature Scripts… → Add**, and select the **folder**
   containing the file (not the file itself).
3. Alternatively, run it once with **Script → Execute Script File…**

A manual install has no icon file, so two cosmetic things differ, and **neither is
a bug**: the menu shows PixInsight's default gear icon instead of the script's
icon, and the window header shows the title and the *by CaeloWorks* link with no
emblem next to them. The script itself works identically.

### "I installed it and I can't find it in the menus"

It lives at **Script → CaeloWorks → DarkFrameAnalyzer**. Almost always one of:

- **PixInsight was not restarted** after the update. This is the number one cause.
  Have them restart.
- They are looking in the wrong place, or for the wrong words. It is under a
  **CaeloWorks** submenu, not at the top level of Script, and the entry reads
  **DarkFrameAnalyzer** in one word — not "Dark Frame Analyzer".
- They upgraded from an old build and have a **stale Feature Scripts entry**
  pointing at a file that no longer exists. Have them open **Script → Feature
  Scripts…**, remove the old entry, and re-add it.

---

## The window — English / French label lookup

The user will name things in their own language. This is the lookup, and these are
the **exact** strings the dialog shows.

**Buttons and groups**

- **Darks** = **Darks**
- **+ Darks** = **+ Darks**
- **+ Directory** = **+ Répertoire**
- **- Remove** = **- Supprimer**
- **Clear all** = **Tout vider**
- **Detection thresholds** = **Seuils de détection**
- **Defaults** = **Défauts**
- **Analyze** = **Analyser**
- **Export CSV...** = **Exporter CSV...**
- **WBPP exclusions...** = **Exclusions WBPP...**
- **Close** = **Fermer**
- **Language:** = **Langue :**

**Table columns**

- **#** = **#**
- **File** = **Fichier**
- **Temp.** = **Temp.**
- **Median** = **Médiane**
- **Noise** = **Bruit**
- **Hot px** = **Hot px**
- **Sat.** = **Sat.**
- **Δ corn.** = **Δ coins**
- **Status** = **Etat**

**Statuses**

- **Valid** = **Valide**
- **Alert** = **Alerte**
- **Rejected** = **Rejet**
- **Error** = **Erreur**

**Threshold groups and fields**

- **Temperature** = **Température** — **Max deviation (°C):** = **Écart max (°C) :**
- **Median** = **Médiane** — **Sensitivity (sigma):** = **Sensibilité (sigma) :** ·
  **Warning (ADU):** = **Alerte (ADU) :** · **Rejection (ADU):** = **Rejet (ADU) :**
- **Noise** = **Bruit** — same *Sensitivity* and *Warning (ADU)* fields
- **Hot pixels** = **Hot pixels** — **Threshold (ADU):** = **Seuil (ADU) :**
- **Saturation** = **Saturation** — **Max saturated pixels:** = **Pixels saturés max :**
- **Uniformity** = **Uniformité** — **Max gradient (ADU):** = **Gradient max (ADU) :**

**Language switching:** the selector is top-right and the choice is remembered
across sessions. Static texts change immediately, but **the contents of a table
already filled in — the status words, the tooltips, the summary line — stay in the
previous language until the next analysis.** That is expected, not a bug: tell the
user to click **Analyze** again.

---

## The Darks list — adding and removing frames

The **Darks** group (*« Darks »*) holds the frames to analyze.

- **+ Darks** (*« + Darks »*) opens a file picker. **+ Directory**
  (*« + Répertoire »*) adds every dark found in a folder — **it does not recurse
  into subfolders.**
- Only **`.fits`, `.fit` and `.xisf`** are offered and scanned (upper case
  included). **`.fts` files are not recognized** and cannot be added — see the
  known-limits section.
- **Adding the same file twice does nothing.** Duplicates are silently ignored.
- **- Remove** (*« - Supprimer »*) removes the selected rows; **Clear all**
  (*« Tout vider »*) empties the list and the results. Neither deletes anything
  from disk.

**Nothing in the list is touched on disk by the analysis.** The script opens each
frame read-only and closes it immediately.

**During an analysis the whole window is locked** — the file list, the thresholds
and the buttons are all disabled until the run ends. **There is no Cancel button:**
a run cannot be interrupted from the script. See the known-limits section.

---

## Detection thresholds — every setting and its default

The **Detection thresholds** group (*« Seuils de détection »*). Every value is
remembered across sessions; **Defaults** (*« Défauts »*) restores all of them at
once. The defaults are calibrated for IMX585-class sensors.

All values are in **ADU on a 16-bit scale (0–65535)**. PixInsight normalizes pixels
to [0,1] and the script multiplies by 65535, so a 16-bit FITS shows its native
values.

### Temperature (*« Température »*)

- **Max deviation (°C):** (*« Écart max (°C) : »*) — default **0.5**, range 0.1 to 2.0.
- Compares the `CCD-TEMP` header (what the sensor actually reached) to `SET-TEMP`
  (what it was asked for). Beyond the threshold the frame is **Rejected**.
- **Both headers must be present.** If either is missing the check is skipped
  entirely — silently. A frame with no `CCD-TEMP` shows **N/A** in the **Temp.**
  column.

### Median (*« Médiane »*) — the thermal signal

Three fields, and they are the ones users misunderstand most.

- **Rejection (ADU):** (*« Rejet (ADU) : »*) — default **128**, range 20 to 512. A
  frame whose clipped median is further than this from the series median is
  **Rejected**, full stop.
- **Warning (ADU):** (*« Alerte (ADU) : »*) — default **80**, range 10 to 256. Past
  this distance the frame is an **Alert**.
- **Sensitivity (sigma):** (*« Sensibilité (sigma) : »*) — default **3.0**, range
  0.5 to 5.0. *In addition*, a frame more than this many sigmas from the series
  median is an **Alert**, even if it is within the ADU thresholds.

Lowering the ADU values flags more frames; raising them flags fewer.

### Noise (*« Bruit »*) — read noise

- **Sensitivity (sigma):** — default **3.0**, range 0.5 to 5.0.
- **Warning (ADU):** — default **20**, range 5 to 100.
- Measured on the frame's **exact MAD**, not its standard deviation. Either test
  raises an **Alert**; noise alone never Rejects a frame.

### Hot pixels (*« Hot pixels »*)

- **Threshold (ADU):** (*« Seuil (ADU) : »*) — default **5000**, range 500 to
  10000. This is what counts as "hot": every pixel above this value.
- **Sensitivity (sigma):** — default **3.0**, range 0.5 to 5.0. A frame whose hot
  pixel *count* is more than this many sigmas from the series is an **Alert**.
- Hot pixels alone never Reject a frame. A dark is *supposed* to have hot pixels;
  what matters is a frame that has unusually many, or unusually few.

### Saturation (*« Saturation »*)

- **Max saturated pixels:** (*« Pixels saturés max : »*) — default **1000**, range
  10 to 5000. Counts pixels at or above 65500 ADU. Beyond the threshold the frame
  is **Rejected** — a dark with massive saturation has seen light.

### Uniformity (*« Uniformité »*) — amp glow and light leaks

- **Max gradient (ADU):** (*« Gradient max (ADU) : »*) — default **100**, range 20
  to 1000. The script compares the median of a 200×200 px patch at the **centre**
  with the same patch at each of the **four corners**, and keeps the largest
  difference — the **Δ corn.** (*« Δ coins »*) column. Past the threshold: **Alert**.
- **Sensitivity (sigma):** — default **3.0**. A frame whose gradient differs from
  the rest of the series raises an **Alert** too (abnormal amp glow).
- **The frame must be larger than 400×400 px** for this to be measured at all — the
  five patches have to fit. A frame of 400×400 px or smaller shows **N/A** in the Δ
  column and is never flagged on uniformity.

---

## How a frame gets Rejected, and why the series matters

This is the section to read before telling a user why one of their darks was
flagged. **The reasons are always in the tooltip of the Status cell** (hover it),
and in full in the Process Console report.

### The three statuses

- **Rejected** (*« Rejet »*), red — exclude it. Caused by exactly four things: a
  **read error**, a median past the **Rejection (ADU)** threshold, a **thermal
  drift** past its threshold, or **massive saturation** past its threshold.
- **Alert** (*« Alerte »*), yellow — worth a look, not necessarily fatal. Caused by
  the median warning threshold, the statistical median test, abnormal noise, an
  unusual hot pixel count, or a uniformity problem.
- **Valid** (*« Valide »*), green — nothing to report.

The summary line under the table reads e.g. *"18 valid / 2 warning(s) / 1
rejected"* (*« 18 valide(s) / 2 alerte(s) / 1 rejet(s) »*).

### Detection is relative to the series, not absolute

The statistical tests compare every frame **to the median of the other frames in
the list**. There is no universal "good dark" value: a series is judged against
itself. Two consequences worth telling users:

- **Analyzing a mixed bag makes the result meaningless.** Darks of different
  exposure times, gains, offsets or temperatures do not belong in one analysis. The
  console prints a warning when it sees several — *"WARNING: multiple gains in the
  series"* (*« ATTENTION : plusieurs gains dans la série »*), and likewise for
  offsets and exposure times. **If a user is surprised by their results, check this
  first.**
- **If every frame in the series is bad in the same way, none of them will be
  flagged.** The script finds outliers, not intrinsically bad darks.

### Fewer than 3 readable frames: nothing is detected at all

**With fewer than 3 readable frames in the list, no detection runs.** Every
readable frame comes back **Valid**, whatever its content — the absolute thresholds
(temperature, saturation, median rejection) are not applied either. Only unreadable
files are marked in Error.

**This is by design** — three frames is the minimum for a robust median and MAD —
**but nothing in the window warns the user.** If someone reports *"I analyzed two
darks and it says they are perfect"*, this is the answer: add the rest of the
series.

### Why the script does not cry wolf on quantized data

The statistical tests deliberately stand down when a series shows no natural
dispersion. ADC quantization makes values land on a handful of discrete steps, and
a naive sigma test would turn a single quantization step into a huge deviation.
When a user asks why an obviously slightly-different frame was *not* flagged, and
the series is very uniform, this safeguard is usually why. It is intentional.

---

## The results table and the console report

**The table** fills in as the analysis runs. Columns: **#**, **File**, **Temp.**
(the `CCD-TEMP` header), **Median**, **Noise** (the MAD), **Hot px**, **Sat.**,
**Δ corn.** (the corner-versus-centre gradient), **Status**.

- Rows are colour-coded green / yellow / red, and the **Status cell has a tooltip
  listing every reason the frame was flagged**. That tooltip is the answer to
  almost every "why was this frame rejected" question.
- After an analysis the table is sorted by status, so flagged frames group at the
  top and valid frames at the bottom.
- **N/A** in a column means the measurement could not be made: no `CCD-TEMP` header
  for **Temp.**, or a frame smaller than 400×400 px for **Δ corn.**

**The Process Console report** is printed at the end of every run and is far more
detailed than the table. It contains, in order: the detected acquisition parameters
(gain, offset, exposure, `SET-TEMP`) with a warning if the series mixes several; a
per-frame metrics table; the **series statistical references** (median, sigma, min,
max and range for each metric); the list of alerts with their reasons; and a
**Recommendations** block naming the frames to exclude and suggesting *Winsorized
Sigma Clipping 3.0/4.0* with *no normalization* in WBPP.

**When escalating anything, ask for the console output.** It contains the whole
analysis and is almost always enough on its own.

---

## The CSV export

**Export CSV...** (*« Exporter CSV... »*) is enabled after an analysis and writes
every metric of every frame — far more than the table shows.

- **33 columns**, and the **headers are always English identifiers** (`file`,
  `median_clip_adu`, `hot_5k`, `corner_delta_adu`, `status`, `flags`, …) **whatever
  the interface language**, so downstream tooling stays stable.
- The separator is a **semicolon (`;`)** and the decimal separator is a **point
  (`.`)**.
- The `status` column holds the internal keys — **`ok`, `warning`, `critical`** —
  not the translated words shown in the table.
- The `flags` column holds the same reasons as the Status tooltip, joined by ` | `.
- Rows are ordered by `DATE-OBS`, like the console report.
- It defaults to saving `darks_analysis.csv` next to the first analyzed dark.
- `hot_5k` follows the **Hot pixels → Threshold (ADU)** setting; `hot_1k` and
  `hot_10k` are always counted at 1000 and 10000 ADU.

On failure the message is *"CSV export failed:"* (*« Échec de l'export CSV : »*)
followed by the reason — nearly always a read-only folder or a path the user cannot
write to.

---

## WBPP exclusions and the rejected/ subdirectory

**WBPP exclusions...** (*« Exclusions WBPP... »*) opens a second window listing the
darks to keep out of integration. It is enabled after an analysis.

- **Rejected frames are always listed. Alerts are not**, unless the user ticks
  **Include alerts (default: rejected only)** (*« Inclure les alertes (par défaut :
  rejets seuls) »*).
- **Files that failed to open are listed too** — a read error counts as a rejection.
- The list is plain text, one full path per line, and can simply be copied.

Two ways out of the window:

- **Export .txt...** (*« Exporter .txt... »*) writes the list, one path per line,
  defaulting to `darks_exclusions.txt` next to the darks. Nothing is moved.
- **Move to rejected/...** (*« Déplacer vers rejected/... »*) **physically moves the
  files on disk** into a `rejected` subdirectory created next to them, so WBPP never
  sees them. It asks for confirmation first, and the moved files disappear from the
  analysis list.

**Be careful with "Move to rejected/" when advising a user.** It is a real move on
their disk. The script cannot undo it — restoring the frames means dragging them
back out of `rejected/` by hand in the file manager. Nothing is deleted, and the
originals are intact in the subfolder, but say so plainly before recommending it.

If a file of the same name is already in `rejected/`, that one file is **not**
moved and is reported as a failure: *"a file with the same name already exists in
rejected/"* (*« un fichier du même nom existe déjà dans rejected/ »*). The others
still move.

If the series is clean, the button reports *"No dark to exclude — 100% clean
series."* (*« Aucun dark à exclure — série 100% propre. »*) and opens nothing.

---

## Error messages, word for word

The user will paste the message. English first, then the French the same message
shows in a French interface.

### Messages that stop what you were doing

**"No files to analyze.**
**Add dark frames first."** / *« Aucun fichier à analyser. Ajoutez des darks d'abord. »*
**Analyze** was clicked with an empty list.

**"Unable to open the file"** / *« Impossible d'ouvrir le fichier »*
PixInsight could not open that frame. It appears as the frame's error, the row goes
red and the status becomes **Error** (*« Erreur »*); the analysis carries on with
the other frames. Usual causes: a corrupt file, an unsupported variant, or a file
that has been moved or deleted since it was added to the list.

**"Error: …"** / *« Erreur : … »*
The tooltip of a row in Error. It carries the underlying reason.

### Export and move messages

**"CSV export failed:"** / *« Échec de l'export CSV : »* — followed by the reason.
Nearly always a folder the user cannot write to.

**"Export failed:"** / *« Échec de l'export : »* — the same, for the `.txt`
exclusion list.

**"Move N file(s) to a 'rejected' subdirectory (created next to the darks)?**
**Moved files will be removed from the analysis list."** /
*« Déplacer N fichier(s) vers un sous-répertoire 'rejected' (créé à côté des darks) ?
Les fichiers déplacés seront retirés de la liste d'analyse. »*
The confirmation before a real move on disk. Nothing has happened yet.

**"a file with the same name already exists in rejected/"** / *« un fichier du même
nom existe déjà dans rejected/ »* — that one file was not moved; the others were.

**"No dark to exclude — 100% clean series."** / *« Aucun dark à exclure — série 100%
propre. »* — not an error. Nothing was flagged.

### Console warnings

**"WARNING: multiple gains in the series"** / *« ATTENTION : plusieurs gains dans la
série »* — and the same for **multiple offsets** (*« plusieurs offsets »*) and
**multiple exposure times** (*« plusieurs durées »*).
**Take these seriously.** The series mixes acquisition settings, so it is not
homogeneous and the results are not trustworthy. Have the user analyze one coherent
set at a time. This is the first thing to check when someone is surprised by their
results.

These last three are printed **in English even in a French interface**, which
surprises French users. That is expected:

**"Error reading keywords: …"** — the FITS headers of a frame could not be read. The
frame is still measured; the temperature check is simply skipped.

**"Histogram API: … - trying fallback..."** — harmless. The analysis continues, more
slowly.

**"Histogram fallback failed: …"** — the frame's statistics are unreliable. Escalate
with the console output.

---

## Known bugs and limits — read before answering

Nothing here is a mistake by the user. If a user reports one of these, **confirm
it**; do not send them back to their settings to look for an error they did not
make.

### Fewer than 3 frames: everything comes back "Valid", with no warning

**Symptom:** *"I analyzed one or two darks and it tells me they are perfect."*

**Cause:** with fewer than 3 readable frames, no detection runs at all — not even
the absolute thresholds. Every readable frame is reported **Valid**. Three frames
is the honest minimum for a robust median and MAD, but **the window says nothing**.

**Answer:** have them add the whole series. This is a real gap in the interface;
report it if a user is annoyed by it.

### `.fts` dark frames cannot be added

**Symptom:** *"My darks don't show up in the file picker"* or *"+ Directory added
nothing."*

**Cause:** only `.fits`, `.fit` and `.xisf` are offered by the picker and scanned by
the directory search. The `.fts` extension — which some capture software writes —
is not recognized.

**Workaround:** rename the files to `.fits`. It is the same format. Escalate the
request so the extension gets added.

### An analysis cannot be cancelled

**Symptom:** *"I loaded 300 darks by mistake and now I'm stuck."*

**Cause:** the window locks during a run and there is no Cancel button. The run must
finish. The console shows the progress (*"Analyzing [12/300] …"* / *« Analyse
[12/300] … »*).

**Workaround:** none inside the script. Confirm the limit and apologise.

### The console labels hot pixels "Hot>5k" even when the threshold is different

**Symptom:** *"I set the hot pixel threshold to 3000 but the report still says
Hot>5k — is my setting being ignored?"*

**Cause:** the count is correct and does follow the threshold. Only the **label** is
hard-coded: the console table header reads `Hot>5k` and the statistics row reads
`Hot pixels > 5000` regardless of the setting. The CSV column is likewise always
named `hot_5k`.

**Answer:** reassure them — the setting *is* applied, only the column title is
wrong. Cosmetic, and ours to fix.

### Clicking a numeric column header sorts it as text

**Symptom:** *"Sorting by hot pixels puts 9 after 100."*

**Cause:** the table sorts column contents as text, so numbers of different lengths
come out in the wrong order. The **#** and **Status** columns are unaffected.

**Workaround:** use the **Export CSV...** output for reliable numeric sorting, or
read the ordered statistics in the console report.

### Colour (debayered) frames: only the first channel is analyzed

If a frame is opened as a multi-channel image — a dark that was already debayered —
**only channel 0 is measured**. A raw CFA dark straight from the camera is mono and
is not affected. Darks should not be debayered anyway; if a user has debayered
theirs, tell them to analyze the raw ones.

---

## Troubleshooting — symptom → cause → answer

**"All my darks came back Valid, even the obviously bad one."**
Three possibilities, in order of likelihood. (1) There are **fewer than 3 frames**
in the list — below that, no detection runs and everything is reported Valid. (2)
The whole series is bad in the same way: the script finds *outliers*, and a frame
is only an outlier compared to its peers. (3) The series is very uniform and the
anti-quantization safeguard is holding the statistical test back on purpose.

**"Why was this frame rejected?"**
**Hover the Status cell** — the tooltip lists every reason. The console report has
the same reasons with the numbers behind them. Only four things Reject a frame: a
read error, a median past the **Rejection (ADU)** threshold, a thermal drift past
its threshold, or saturation past its threshold. Everything else is an Alert.

**"It flags far too many / far too few frames."**
Check the console first for *"WARNING: multiple gains / offsets / exposure times in
the series"* — mixing acquisition settings in one analysis makes the result
meaningless. If the series is coherent, the thresholds are the dial: raise
**Rejection (ADU)** and **Warning (ADU)** under **Median** to flag fewer frames,
lower them to flag more. **Defaults** (*« Défauts »*) puts everything back.

**"The Temp. column says N/A."**
The frames carry no `CCD-TEMP` header. The thermal check needs **both** `CCD-TEMP`
and `SET-TEMP`; without them it is silently skipped. Nothing else is affected.

**"The Δ corn. column says N/A."**
The frames are **400×400 px or smaller**. The uniformity test measures 200×200 px
patches at the centre and the four corners and cannot fit them in.

**"The interface is half English, half French after I changed the language."**
The static texts switch immediately, but a table that is already filled keeps the
statuses and tooltips of the previous language. Click **Analyze** again.

**"My darks don't appear in the file picker."**
They are probably `.fts` files, which are not recognized in 1.9.0 — only `.fits`,
`.fit` and `.xisf`. Renaming them to `.fits` works. Also check that **+ Directory**
was not pointed at a parent folder: it does not search subfolders.

**"I moved frames to rejected/ by mistake."**
Nothing is lost — the files are intact in the `rejected` subfolder next to the
darks. The script cannot undo the move; they drag them back out in their file
manager. Then click **Analyze** again.

**"The menu shows a gear icon instead of the script's icon."**
Expected with a manual install: the icon file only ships through the update
repository. The script is not broken.

**"PixInsight says the repository is unsigned."**
Expected. The CaeloWorks repository is not CPD-signed yet. It is safe to accept.

**"I installed it but I can't find it."**
It is at **Script → CaeloWorks → DarkFrameAnalyzer** — one word, in the CaeloWorks
submenu — and **PixInsight must be restarted** after the install.

---

## Escalation — when to stop and hand over to a human

**Escalate, and do not improvise, when:**

- **the user's dark frames may be at risk.** Anything involving *Move to
  rejected/*, a file they cannot find any more, or a request that would have them
  delete or overwrite frames. Never tell a user to delete a calibration frame.
- **the user asks whether a specific frame is genuinely bad**, beyond what the
  script's own reasons say. Judging someone's data is not something to guess at:
  quote the tooltip and the console reasons, and hand over.
- the user reports one of the **known bugs and limits** above — confirm it, then
  hand over; do not promise a date.
- the console shows **"Histogram fallback failed"**, or any message not listed in
  this document.
- the user reports something this document does not cover. Say *"I don't know, I'm
  passing this to the team."* A plausible-sounding guess about someone's data is
  worse than silence.
- anything about payment, or licensing beyond "it is free and GPL-3.0".

**Collect these four things before escalating.** Without them the report is not
actionable:

1. **PixInsight version** and **operating system** (Help → About).
2. **Dark Frame Analyzer version** — hover the **by CaeloWorks** link under the
   title; the tooltip ends with the version.
3. **The Process Console output of the run.** It carries the detected acquisition
   parameters, the per-frame table, the series references and every alert with its
   numbers. It is almost always enough on its own.
4. **The CSV export** (**Export CSV...**) and/or a screenshot of the window with
   the thresholds visible.

Bugs can also be filed directly at
https://github.com/caelo-works/dark-frame-analyzer/issues
