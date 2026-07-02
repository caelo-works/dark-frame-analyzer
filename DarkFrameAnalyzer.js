// ============================================================================
// DarkFrameAnalyzer.js — Dark frame series analysis for PixInsight
// ============================================================================
//
// Analyzes a series of dark FITS frames, computes key statistics for each
// frame and identifies outliers to exclude before WBPP integration.
//
// ATR585C calibration pipeline
// ============================================================================

#feature-id    Utilities > DarkFrameAnalyzer
#feature-info  Astrophotography dark series analysis for outlier detection \
               before WBPP integration. Computes median, MAD, hot pixels and \
               spatial uniformity, and flags out-of-spec frames.

#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/UndoFlag.jsh>

#define VERSION "1.5.0"
#define TITLE   "Dark Frame Analyzer"
#define SCALE   65535


// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

var DEFAULT_PARAMS = {
   outlierSigmaMedian:    3.0,
   outlierSigmaMad:       3.0,
   outlierSigmaHotpx:     3.0,
   tempDeviationMax:      0.5,
   hotPixelThresholdADU:  5000,
   saturatedPixelsMax:    1000,
   medianAbsDeviationWarn: 80.0,
   medianAbsDeviationCrit: 128.0,
   madAbsDeviationWarn:   20.0,
   patchSize:             200
};


// ============================================================================
// LOCALIZATION
// ============================================================================
//
// All user-visible strings live in the STRINGS table below. English is the
// reference language and the fallback when a key is missing in another
// language. The selected language persists across sessions via Settings.
//
// tr("key", a, b, ...) returns the string for the current language with
// %1, %2, ... placeholders replaced by the extra arguments.

var SETTINGS_KEY_BASE = "DarkFrameAnalyzer";

var STRINGS = {

   en: {
      // Main dialog
      "help":              "Add dark FITS files, configure the detection thresholds, then run the analysis.",
      "lang.label":        "Language:",
      "col.num":           "#",
      "col.file":          "File",
      "col.temp":          "Temp.",
      "col.median":        "Median",
      "col.noise":         "Noise",
      "col.hotpx":         "Hot px",
      "col.sat":           "Sat.",
      "col.state":         "Status",
      "files.group":       "Darks",
      "btn.addFiles":      "+ Darks",
      "btn.addFiles.tt":   "Add FITS files",
      "btn.addDir":        "+ Directory",
      "btn.addDir.tt":     "Add all FITS files from a directory",
      "btn.remove":        "- Remove",
      "btn.remove.tt":     "Remove the selected files",
      "btn.clear":         "Clear all",
      "btn.clear.tt":      "Remove all files",
      "dlg.selectFiles":   "Select dark FITS files",
      "dlg.fitsFilter":    "FITS files",
      "dlg.selectDir":     "Select a directory of darks",
      "params.group":      "Detection thresholds",
      "temp.group":        "Temperature",
      "temp.hint":         "Tolerated difference between setpoint and sensor temperature.",
      "temp.max":          "Max deviation (°C):",
      "median.group":      "Median",
      "median.hint":       "Detects darks whose thermal signal differs from the series.",
      "lbl.sigma":         "Sensitivity (sigma):",
      "lbl.warnAdu":       "Warning (ADU):",
      "lbl.critAdu":       "Rejection (ADU):",
      "noise.group":       "Noise",
      "noise.hint":        "Detects abnormal read noise (image MAD).",
      "hotpx.group":       "Hot pixels",
      "hotpx.hint":        "Counts pixels above the threshold and detects deviations.",
      "hotpx.threshold":   "Threshold (ADU):",
      "sat.group":         "Saturation",
      "sat.hint":          "Maximum number of saturated pixels accepted per dark.",
      "sat.max":           "Max saturated pixels:",
      "btn.analyze":       "Analyze",
      "btn.analyze.tt":    "Run the analysis on all darks",
      "btn.exportCsv":     "Export CSV...",
      "btn.exportCsv.tt":  "Export the metrics of the last analysis to a CSV file",
      "btn.exclusions":    "WBPP exclusions...",
      "btn.exclusions.tt": "List of darks to keep out of integration: .txt export or move to a rejected/ subdirectory",
      "btn.close":         "Close",
      "msg.noFiles":       "No files to analyze.\nAdd FITS files first.",
      "err.open":          "Unable to open the file",
      "state.valid":       "Valid",
      "state.warning":     "Alert",
      "state.rejected":    "Rejected",
      "state.error":       "Error",
      "state.err":         "ERR",
      "tt.noAnomaly":      "No anomaly",
      "tt.error":          "Error: %1",
      "sum.valid":         "valid",
      "sum.warn":          "warning(s)",
      "sum.crit":          "rejected",
      "csv.caption":       "Export metrics to CSV",
      "csv.filter":        "CSV files",
      "filter.all":        "All files",
      "csv.done":          "Metrics exported:\n%1",
      "csv.doneLog":       "Metrics exported: %1",
      "csv.fail":          "CSV export failed:\n%1",
      "excl.none":         "No dark to exclude — 100% clean series.",

      // Analysis run + console report
      "run.start":         "Starting analysis of %1 darks...",
      "run.progress":      "Analyzing [%1/%2] ",
      "run.elapsed":       "Per-frame analysis completed in %1 s",
      "rep.title":         "DARK SERIES ANALYSIS",
      "rep.files":         "Files       : %1 FITS analyzed (%2 read successfully)",
      "rep.params":        "Detected parameters:",
      "rep.gain":          "  Gain        : [%1]",
      "rep.offset":        "  Offset      : [%1]",
      "rep.expt":          "  Exposure    : [%1] s",
      "rep.settemp":       "  SET-TEMP    : [%1] °C",
      "rep.multiGain":     "  WARNING: multiple gains in the series",
      "rep.multiOffset":   "  WARNING: multiple offsets in the series",
      "rep.multiExpt":     "  WARNING: multiple exposure times in the series",
      "rep.tableTitle":    "PER-DARK METRICS TABLE",
      "rep.colFile":       "File",
      "rep.colTccd":       "T_ccd",
      "rep.colMedian":     "Median",
      "rep.colMeanClip":   "MeanClip",
      "rep.colMad":        "MAD",
      "rep.colHot":        "Hot>5k",
      "rep.colSat":        "Sat.",
      "rep.colState":      "Status",
      "rep.error":         " ERROR: %1",
      "rep.refsTitle":     "SERIES STATISTICAL REFERENCES",
      "rep.statMetric":    "Metric",
      "rep.statMedian":    "Median",
      "rep.statSigma":     "s (MAD)",
      "rep.statMin":       "Min",
      "rep.statMax":       "Max",
      "rep.statRange":     "Range",
      "rep.statClipMed":   "Clipped median (ADU)",
      "rep.statMad":       "Robust MAD (ADU)",
      "rep.statHot":       "Hot pixels > 5000",
      "rep.statSat":       "Saturated pixels",
      "rep.statTemp":      "CCD temperature (C)",
      "rep.alertsTitle":   "ALERTS - OUT-OF-SPEC DARKS (%1/%2)",
      "rep.noAnomaly":     "No anomaly detected. Homogeneous, good-quality series.",
      "rep.recoTitle":     "RECOMMENDATIONS",
      "rep.critList":      "%1 critical dark(s) to exclude from integration:",
      "rep.warnList":      "%1 dark(s) to review (potentially exclude):",
      "rep.warnAdvice":    "   -> These darks will probably be handled fine by a Winsorized\n      Sigma 3.0/4.0 rejection in WBPP, but you may exclude them\n      manually for extra cleanliness.",
      "rep.clean":         "100% homogeneous series — ready for integration without exclusions.",
      "rep.stackTitle":    "For integration:",
      "rep.stackTotal":    "  - %1 usable darks in total",
      "rep.stackClean":    "  - %1 perfectly clean darks",
      "rep.stackReco":     "  - Recommendation: Winsorized Sigma Clipping 3.0/4.0 in WBPP",
      "rep.stackNorm":     "  - Normalization: No normalization",
      "rep.stackOut":      "  - Output: float32 FITS or XISF",
      "rep.done":          "Analysis complete — %1 files processed",

      // Outlier flags
      "flag.readError":    "read error: %1",
      "flag.medianCrit":   "median strongly offset (%1 vs ref %2, d=%3 ADU)",
      "flag.medianWarn":   "median offset (%1 vs ref %2, d=%3 ADU%4)",
      "flag.medianStat":   "statistically offset median (%1 vs ref %2, %3s)",
      "flag.noiseWarn":    "abnormal noise (MAD=%1 vs ref %2, d=%3 ADU%4)",
      "flag.noiseStat":    "abnormal noise (MAD=%1 vs ref %2, %3s)",
      "flag.hotpx":        "unusual hot pixel count (%1 vs ref %2, %3s)",
      "flag.tempDrift":    "thermal drift (%1 °C)",
      "flag.saturation":   "massive saturation (%1 pixels)",
      "flag.sigmaSuffix":  ", %1s",

      // WBPP exclusion dialog
      "excl.title":        "WBPP exclusions",
      "excl.help":         "List of darks to keep out of integration. Copy it, export it to a .txt file, or move the files to a 'rejected' subdirectory so WBPP won't see them.",
      "excl.inclWarn":     "Include alerts (default: rejected only)",
      "excl.inclWarn.tt":  "Rejected (critical) darks are always listed. Check to also include warning-level darks.",
      "excl.count":        "%1 file(s) to exclude",
      "excl.movedCount":   " — %1 already moved",
      "excl.exportTxt":    "Export .txt...",
      "excl.exportTxt.tt": "Write the list (one path per line) to a text file",
      "excl.move":         "Move to rejected/...",
      "excl.move.tt":      "Move the listed files to a 'rejected' subdirectory next to the darks (with confirmation)",
      "excl.exportCaption": "Export the exclusion list",
      "txt.filter":        "Text files",
      "excl.exportDone":   "Exclusion list exported:\n%1",
      "excl.exportDoneLog": "Exclusion list exported: %1",
      "excl.exportFail":   "Export failed:\n%1",
      "excl.confirmMove":  "Move %1 file(s) to a 'rejected' subdirectory (created next to the darks)?\n\nMoved files will be removed from the analysis list.",
      "excl.exists":       "a file with the same name already exists in rejected/",
      "excl.movedLog":     "Moved: %1 -> %2",
      "excl.moveReport":   "%1 file(s) moved to rejected/",
      "excl.moveFailures": "\n\nFailures (%1):\n%2"
   },

   fr: {
      // Dialogue principal
      "help":              "Ajoutez des fichiers FITS de darks, configurez les seuils, puis lancez l'analyse.",
      "lang.label":        "Langue :",
      "col.num":           "#",
      "col.file":          "Fichier",
      "col.temp":          "Temp.",
      "col.median":        "Médiane",
      "col.noise":         "Bruit",
      "col.hotpx":         "Hot px",
      "col.sat":           "Sat.",
      "col.state":         "Etat",
      "files.group":       "Darks",
      "btn.addFiles":      "+ Darks",
      "btn.addFiles.tt":   "Ajouter des fichiers FITS",
      "btn.addDir":        "+ Répertoire",
      "btn.addDir.tt":     "Ajouter tous les FITS d'un répertoire",
      "btn.remove":        "- Supprimer",
      "btn.remove.tt":     "Supprimer les fichiers sélectionnés",
      "btn.clear":         "Tout vider",
      "btn.clear.tt":      "Supprimer tous les fichiers",
      "dlg.selectFiles":   "Sélectionner des darks FITS",
      "dlg.fitsFilter":    "Fichiers FITS",
      "dlg.selectDir":     "Sélectionner un répertoire de darks",
      "params.group":      "Seuils de détection",
      "temp.group":        "Température",
      "temp.hint":         "Écart toléré entre température de consigne et température capteur.",
      "temp.max":          "Écart max (°C) :",
      "median.group":      "Médiane",
      "median.hint":       "Détecte les darks dont le signal thermique diffère de la série.",
      "lbl.sigma":         "Sensibilité (sigma) :",
      "lbl.warnAdu":       "Alerte (ADU) :",
      "lbl.critAdu":       "Rejet (ADU) :",
      "noise.group":       "Bruit",
      "noise.hint":        "Détecte un bruit de lecture anormal (MAD de l'image).",
      "hotpx.group":       "Hot pixels",
      "hotpx.hint":        "Compte les pixels au-dessus du seuil et détecte les écarts.",
      "hotpx.threshold":   "Seuil (ADU) :",
      "sat.group":         "Saturation",
      "sat.hint":          "Nombre max de pixels saturés accepté par dark.",
      "sat.max":           "Pixels saturés max :",
      "btn.analyze":       "Analyser",
      "btn.analyze.tt":    "Lancer l'analyse de tous les darks",
      "btn.exportCsv":     "Exporter CSV...",
      "btn.exportCsv.tt":  "Exporter les métriques de la dernière analyse dans un fichier CSV",
      "btn.exclusions":    "Exclusions WBPP...",
      "btn.exclusions.tt": "Liste des darks à écarter de l'empilement : export .txt ou déplacement vers un sous-répertoire rejected/",
      "btn.close":         "Fermer",
      "msg.noFiles":       "Aucun fichier à analyser.\nAjoutez des fichiers FITS d'abord.",
      "err.open":          "Impossible d'ouvrir le fichier",
      "state.valid":       "Valide",
      "state.warning":     "Alerte",
      "state.rejected":    "Rejet",
      "state.error":       "Erreur",
      "state.err":         "ERR",
      "tt.noAnomaly":      "Aucune anomalie",
      "tt.error":          "Erreur : %1",
      "sum.valid":         "valide(s)",
      "sum.warn":          "alerte(s)",
      "sum.crit":          "rejet(s)",
      "csv.caption":       "Exporter les métriques en CSV",
      "csv.filter":        "Fichiers CSV",
      "filter.all":        "Tous les fichiers",
      "csv.done":          "Métriques exportées :\n%1",
      "csv.doneLog":       "Métriques exportées : %1",
      "csv.fail":          "Échec de l'export CSV :\n%1",
      "excl.none":         "Aucun dark à exclure — série 100% propre.",

      // Analyse + rapport console
      "run.start":         "Début de l'analyse de %1 darks...",
      "run.progress":      "Analyse [%1/%2] ",
      "run.elapsed":       "Analyse individuelle terminée en %1 s",
      "rep.title":         "ANALYSE DE SERIE DE DARKS",
      "rep.files":         "Fichiers    : %1 FITS analysés (%2 lus avec succès)",
      "rep.params":        "Paramètres détectés :",
      "rep.gain":          "  Gain        : [%1]",
      "rep.offset":        "  Offset      : [%1]",
      "rep.expt":          "  Durée       : [%1] s",
      "rep.settemp":       "  SET-TEMP    : [%1] °C",
      "rep.multiGain":     "  ATTENTION : plusieurs gains dans la série",
      "rep.multiOffset":   "  ATTENTION : plusieurs offsets dans la série",
      "rep.multiExpt":     "  ATTENTION : plusieurs durées dans la série",
      "rep.tableTitle":    "TABLEAU DES METRIQUES PAR DARK",
      "rep.colFile":       "Fichier",
      "rep.colTccd":       "T_ccd",
      "rep.colMedian":     "Mediane",
      "rep.colMeanClip":   "MeanClip",
      "rep.colMad":        "MAD",
      "rep.colHot":        "Hot>5k",
      "rep.colSat":        "Sat.",
      "rep.colState":      "Etat",
      "rep.error":         " ERREUR : %1",
      "rep.refsTitle":     "REFERENCES STATISTIQUES DE LA SERIE",
      "rep.statMetric":    "Metrique",
      "rep.statMedian":    "Mediane",
      "rep.statSigma":     "s (MAD)",
      "rep.statMin":       "Min",
      "rep.statMax":       "Max",
      "rep.statRange":     "Etendue",
      "rep.statClipMed":   "Médiane clippée (ADU)",
      "rep.statMad":       "MAD robuste (ADU)",
      "rep.statHot":       "Hot pixels > 5000",
      "rep.statSat":       "Pixels saturés",
      "rep.statTemp":      "Température CCD (C)",
      "rep.alertsTitle":   "ALERTES - DARKS HORS NORME (%1/%2)",
      "rep.noAnomaly":     "Aucune anomalie détectée. Série homogène et de qualité.",
      "rep.recoTitle":     "RECOMMANDATIONS",
      "rep.critList":      "%1 dark(s) critique(s) à exclure absolument de l'empilement :",
      "rep.warnList":      "%1 dark(s) à examiner (potentiellement à exclure) :",
      "rep.warnAdvice":    "   -> Ces darks seront probablement bien gérés par une réjection\n      Winsorized Sigma 3.0/4.0 dans WBPP, mais tu peux les exclure\n      manuellement pour plus de propreté.",
      "rep.clean":         "Série 100% homogène — prête pour empilement sans exclusion.",
      "rep.stackTitle":    "Pour l'empilement :",
      "rep.stackTotal":    "  - %1 darks utilisables au total",
      "rep.stackClean":    "  - %1 darks totalement propres",
      "rep.stackReco":     "  - Recommandation : Winsorized Sigma Clipping 3.0/4.0 dans WBPP",
      "rep.stackNorm":     "  - Normalization : No normalization",
      "rep.stackOut":      "  - Output : float32 FITS ou XISF",
      "rep.done":          "Analyse terminée — %1 fichiers traités",

      // Alertes de détection
      "flag.readError":    "erreur lecture : %1",
      "flag.medianCrit":   "médiane très décalée (%1 vs ref %2, d=%3 ADU)",
      "flag.medianWarn":   "médiane décalée (%1 vs ref %2, d=%3 ADU%4)",
      "flag.medianStat":   "médiane statistiquement décalée (%1 vs ref %2, %3s)",
      "flag.noiseWarn":    "bruit anormal (MAD=%1 vs ref %2, d=%3 ADU%4)",
      "flag.noiseStat":    "bruit anormal (MAD=%1 vs ref %2, %3s)",
      "flag.hotpx":        "hot pixels inhabituel(s) (%1 vs ref %2, %3s)",
      "flag.tempDrift":    "dérive thermique (%1 °C)",
      "flag.saturation":   "saturation massive (%1 pixels)",
      "flag.sigmaSuffix":  ", %1s",

      // Fenêtre d'exclusions WBPP
      "excl.title":        "Exclusions WBPP",
      "excl.help":         "Liste des darks à écarter de l'empilement. Copiez-la, exportez-la en .txt, ou déplacez les fichiers dans un sous-répertoire 'rejected' pour que WBPP ne les voie plus.",
      "excl.inclWarn":     "Inclure les alertes (par défaut : rejets seuls)",
      "excl.inclWarn.tt":  "Les rejets (critiques) sont toujours listés. Cochez pour ajouter les darks en alerte (warning).",
      "excl.count":        "%1 fichier(s) à exclure",
      "excl.movedCount":   " — %1 déjà déplacé(s)",
      "excl.exportTxt":    "Exporter .txt...",
      "excl.exportTxt.tt": "Écrire la liste (un chemin par ligne) dans un fichier texte",
      "excl.move":         "Déplacer vers rejected/...",
      "excl.move.tt":      "Déplacer les fichiers listés dans un sous-répertoire 'rejected' à côté des darks (avec confirmation)",
      "excl.exportCaption": "Exporter la liste d'exclusion",
      "txt.filter":        "Fichiers texte",
      "excl.exportDone":   "Liste d'exclusion exportée :\n%1",
      "excl.exportDoneLog": "Liste d'exclusion exportée : %1",
      "excl.exportFail":   "Échec de l'export :\n%1",
      "excl.confirmMove":  "Déplacer %1 fichier(s) vers un sous-répertoire 'rejected' (créé à côté des darks) ?\n\nLes fichiers déplacés seront retirés de la liste d'analyse.",
      "excl.exists":       "un fichier du même nom existe déjà dans rejected/",
      "excl.movedLog":     "Déplacé : %1 -> %2",
      "excl.moveReport":   "%1 fichier(s) déplacé(s) vers rejected/",
      "excl.moveFailures": "\n\nÉchecs (%1) :\n%2"
   }
};

// Language codes/names in ComboBox item order
var LANG_CODES = ["en", "fr"];
var LANG_NAMES = ["English", "Français"];

var gLanguage = "en";  // default; overridden by the saved setting

function loadLanguageSetting()
{
   var lang = Settings.read(SETTINGS_KEY_BASE + "/language", DataType_String);
   if (Settings.lastReadOK && lang && STRINGS[lang] !== undefined)
      gLanguage = lang;
}

function saveLanguageSetting()
{
   Settings.write(SETTINGS_KEY_BASE + "/language", DataType_String, gLanguage);
}

function tr(key)
{
   var table = STRINGS[gLanguage];
   var s = (table && table[key] !== undefined) ? table[key] : STRINGS.en[key];
   if (s === undefined) return key;
   // split/join instead of replace(): replaces every occurrence and is
   // immune to '$' patterns in the substituted values
   for (var i = 1; i < arguments.length; ++i)
      s = s.split("%" + i).join(String(arguments[i]));
   return s;
}


// ============================================================================
// HELPERS — STATISTICS ON JS ARRAYS
// ============================================================================

function arrayMedian(arr)
{
   if (arr.length === 0) return 0;
   var sorted = arr.slice().sort(function(a, b) { return a - b; });
   var mid = Math.floor(sorted.length / 2);
   if (sorted.length % 2 !== 0)
      return sorted[mid];
   return (sorted[mid - 1] + sorted[mid]) / 2.0;
}

function arrayMAD(arr)
{
   // MAD normalized x1.4826 (sigma-equivalent, like astropy's mad_std)
   var med = arrayMedian(arr);
   var deviations = [];
   for (var i = 0; i < arr.length; ++i)
      deviations.push(Math.abs(arr[i] - med));
   return arrayMedian(deviations) * 1.4826;
}

function arrayMin(arr)
{
   var m = arr[0];
   for (var i = 1; i < arr.length; ++i)
      if (arr[i] < m) m = arr[i];
   return m;
}

function arrayMax(arr)
{
   var m = arr[0];
   for (var i = 1; i < arr.length; ++i)
      if (arr[i] > m) m = arr[i];
   return m;
}

function uniqueValues(arr)
{
   var seen = {};
   var result = [];
   for (var i = 0; i < arr.length; ++i) {
      var key = String(arr[i]);
      if (!seen[key]) {
         seen[key] = true;
         result.push(arr[i]);
      }
   }
   return result.sort(function(a, b) { return a - b; });
}

function padRight(str, len)
{
   str = String(str);
   while (str.length < len) str += ' ';
   return str;
}

function padLeft(str, len)
{
   str = String(str);
   while (str.length < len) str = ' ' + str;
   return str;
}

function formatNumber(val, decimals)
{
   if (val === null || val === undefined) return "N/A";
   return val.toFixed(decimals);
}

function truncateFilename(name, maxLen)
{
   if (name.length <= maxLen) return name;
   var half = Math.floor((maxLen - 3) / 2);
   return name.substring(0, half) + "..." + name.substring(name.length - half);
}


// ============================================================================
// FITS KEYWORD READING
// ============================================================================

function readFITSKeywordsFromWindow(window)
{
   // Reads FITS keywords straight from the open ImageWindow
   // (PI already extracts them when opening the file)
   var result = {
      gain: null,
      offset: null,
      exptime: null,
      setTemp: null,
      ccdTemp: null,
      readoutMode: null,
      imageType: null,
      dateObs: null,
      bayerPat: null
   };

   try {
      var keywords = window.keywords;
      for (var i = 0; i < keywords.length; ++i) {
         var kw = keywords[i];
         var name = kw.name.trim();
         // strippedValue removes the quotes of FITS string values
         var val = kw.strippedValue.trim();

         switch (name) {
            case "GAIN":     result.gain = parseFloat(val); break;
            case "OFFSET":   result.offset = parseFloat(val); break;
            case "EXPTIME":  result.exptime = parseFloat(val); break;
            case "EXPOSURE": if (result.exptime === null) result.exptime = parseFloat(val); break;
            case "SET-TEMP": result.setTemp = parseFloat(val); break;
            case "CCD-TEMP": result.ccdTemp = parseFloat(val); break;
            case "READOUTM": result.readoutMode = val; break;
            case "IMAGETYP": result.imageType = val; break;
            case "DATE-OBS": result.dateObs = val; break;
            case "BAYERPAT": result.bayerPat = val; break;
         }
      }
   }
   catch (e) {
      console.warningln("Error reading keywords: " + e.message);
   }

   return result;
}


// ============================================================================
// SINGLE DARK FRAME ANALYSIS
// ============================================================================

function analyzeSingleDark(filePath, params)
{
   var filename = File.extractName(filePath) + File.extractExtension(filePath);

   var metrics = {
      filepath: filePath,
      filename: filename,
      error: null,
      gain: null,
      offset: null,
      exptime: null,
      setTemp: null,
      ccdTemp: null,
      readoutMode: null,
      imageType: null,
      dateObs: null,
      bayerPat: null,
      width: 0,
      height: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      mad: 0,
      meanClip: 0,
      medianClip: 0,
      stdClip: 0,
      nHot1k: 0,
      nHot5k: 0,
      nHot10k: 0,
      nSaturated: 0,
      nZero: 0,
      tempDeviation: null,
      centreMedian: null,
      maxCornerDelta: null,
      flags: [],
      severity: "ok"
   };

   // Open the image
   var windows;
   try {
      windows = ImageWindow.open(filePath);
   }
   catch (e) {
      metrics.error = e.message;
      return metrics;
   }

   if (windows.length === 0) {
      metrics.error = tr("err.open");
      return metrics;
   }

   var window = windows[0];
   var image = window.mainView.image;

   // Read the FITS keywords from the open window
   var kw = readFITSKeywordsFromWindow(window);
   metrics.gain = kw.gain;
   metrics.offset = kw.offset;
   metrics.exptime = kw.exptime;
   metrics.setTemp = kw.setTemp;
   metrics.ccdTemp = kw.ccdTemp;
   metrics.readoutMode = kw.readoutMode;
   metrics.imageType = kw.imageType;
   metrics.dateObs = kw.dateObs;
   metrics.bayerPat = kw.bayerPat;

   try {
      // Dimensions
      metrics.width = image.width;
      metrics.height = image.height;

      // Multi-channel image (debayered CFA?): use channel 0
      if (image.numberOfChannels > 1)
         image.selectedChannel = 0;

      // --- Basic statistics (through PI's C++ engine) ---
      // All PI values are in [0,1]; converted to ADU x65535

      metrics.min = image.minimum() * SCALE;
      metrics.max = image.maximum() * SCALE;
      metrics.mean = image.mean() * SCALE;
      metrics.median = image.median() * SCALE;
      metrics.stdDev = image.stdDev() * SCALE;

      // --- 16-bit histogram (single C++ pass) ---
      // Used for the exact MAD below and the hot pixel counts
      var histogram = computeHistogramCounts(image);

      // --- Exact robust MAD from the histogram ---
      // The former avgDev*1.2533 approximation is only valid for a
      // Gaussian distribution: hot pixel tails inflate avgDev. Walking
      // the histogram outward from the exact median gives the true MAD,
      // like astropy's mad_std.
      metrics.mad = histogramMAD(histogram, metrics.median);

      // --- Clipped statistics (iterative, like astropy) ---
      // Seeded with the robust median/MAD, then iterated to convergence
      var clipped = iterativeClippedStats(image, metrics.median,
         metrics.mad > 0 ? metrics.mad : metrics.stdDev);
      metrics.meanClip = clipped.mean;
      metrics.medianClip = clipped.median;
      metrics.stdClip = clipped.std;

      // --- Hot pixel counting through the histogram ---
      metrics.nHot1k = sumBinsAbove(histogram, 1000);
      metrics.nHot5k = sumBinsAbove(histogram, Math.round(params.hotPixelThresholdADU));
      metrics.nHot10k = sumBinsAbove(histogram, 10000);
      metrics.nSaturated = sumBinsAbove(histogram, 65500);
      metrics.nZero = histogram[0];

      // --- Temperature deviation ---
      if (metrics.setTemp !== null && metrics.ccdTemp !== null) {
         metrics.tempDeviation = Math.abs(metrics.ccdTemp - metrics.setTemp);
      }

      // --- Spatial uniformity (center + 4 corners) ---
      var ps = params.patchSize;
      var h = image.height;
      var w = image.width;

      if (h > ps * 2 && w > ps * 2) {
         // Center
         var cx = Math.floor(w / 2 - ps / 2);
         var cy = Math.floor(h / 2 - ps / 2);
         var centreMedian = patchMedian(image, cx, cy, ps, ps);

         // 4 corners
         var corners = [
            patchMedian(image, 0, 0, ps, ps),
            patchMedian(image, w - ps, 0, ps, ps),
            patchMedian(image, 0, h - ps, ps, ps),
            patchMedian(image, w - ps, h - ps, ps, ps)
         ];

         metrics.centreMedian = centreMedian * SCALE;
         var maxCorner = arrayMax(corners);
         metrics.maxCornerDelta = (maxCorner - centreMedian) * SCALE;
      }

   }
   catch (e) {
      metrics.error = e.message;
   }

   // Close the image immediately to free memory
   window.forceClose();

   return metrics;
}


// ============================================================================
// IMAGE STATISTICS HELPERS
// ============================================================================

function computeHistogramCounts(image)
{
   // Builds a 16-bit histogram (65536 bins) through PJSR's Histogram class.
   // Returns a JS array where index = ADU value, value = pixel count
   var resolution = 65536;
   var counts = new Array(resolution);
   for (var i = 0; i < resolution; ++i) counts[i] = 0;

   try {
      var H = new Histogram(resolution);
      H.generate(image);
      for (var i = 0; i < resolution; ++i)
         counts[i] = H.count(i);
   }
   catch (e) {
      // Fallback: rebuild the histogram manually, pixel by pixel, if the
      // Histogram class is not available in this form
      console.warningln("Histogram API: " + e.message + " - trying fallback...");
      try {
         for (var y = 0; y < image.height; ++y) {
            for (var x = 0; x < image.width; ++x) {
               var val = Math.round(image.sample(x, y) * 65535);
               if (val >= 0 && val < resolution)
                  counts[val]++;
            }
            // Keep the UI alive every few hundred rows
            if (y % 500 === 0)
               processEvents();
         }
      }
      catch (e2) {
         console.warningln("Histogram fallback failed: " + e2.message);
      }
   }

   return counts;
}

function sumBinsAbove(histogram, threshold)
{
   var count = 0;
   for (var b = threshold; b < histogram.length; ++b)
      count += histogram[b];
   return count;
}

function histogramMAD(histogram, median)
{
   // Exact median absolute deviation from a histogram: walk outward from
   // the median bin, accumulating pixel counts, until half of the pixels
   // are within the current deviation. That deviation is the MAD.
   // x1.4826 makes it sigma-equivalent (like astropy's mad_std).
   var total = 0;
   for (var i = 0; i < histogram.length; ++i)
      total += histogram[i];
   if (total === 0) return 0;

   var m = Math.round(median);
   if (m < 0) m = 0;
   if (m > histogram.length - 1) m = histogram.length - 1;

   var half = total / 2;
   var acc = histogram[m];
   var maxDev = Math.max(m, histogram.length - 1 - m);
   for (var d = 1; d <= maxDev; ++d) {
      if (acc >= half)
         return (d - 1) * 1.4826;
      var lo = m - d;
      var hi = m + d;
      if (lo >= 0) acc += histogram[lo];
      if (hi < histogram.length) acc += histogram[hi];
   }
   return maxDev * 1.4826;
}

function patchMedian(image, x0, y0, w, h)
{
   image.selectedRect = new Rect(x0, y0, x0 + w, y0 + h);
   var med = image.median();
   image.resetSelections();
   return med;
}

function iterativeClippedStats(image, startCenter, startSigma)
{
   // Iterative sigma clipping like astropy's sigma_clipped_stats: clip at
   // center +/- 3*sigma, recompute median/std on the surviving pixels,
   // tighten the bounds and repeat until convergence (max 5 iterations).
   // The single-pass version underestimated how much the hot pixel tails
   // widen the first set of bounds.
   var result = { mean: 0, median: 0, std: 0 };

   if (startSigma <= 0) {
      // Degenerate (constant) distribution: nothing to clip
      result.mean = image.mean() * SCALE;
      result.median = image.median() * SCALE;
      result.std = image.stdDev() * SCALE;
      return result;
   }

   var center = startCenter;
   var sigma = startSigma;
   var prevLow = null, prevHigh = null;

   image.rangeClippingEnabled = true;
   try {
      for (var it = 0; it < 5; ++it) {
         var clipLow = (center - 3.0 * sigma) / SCALE;
         var clipHigh = (center + 3.0 * sigma) / SCALE;
         if (clipLow < 0) clipLow = 0;
         if (clipHigh > 1) clipHigh = 1;
         if (clipLow === prevLow && clipHigh === prevHigh)
            break;  // bounds stable: converged
         prevLow = clipLow;
         prevHigh = clipHigh;

         image.rangeClipLow = clipLow;
         image.rangeClipHigh = clipHigh;
         result.mean = image.mean() * SCALE;
         result.median = image.median() * SCALE;
         result.std = image.stdDev() * SCALE;

         center = result.median;
         sigma = result.std;
         if (sigma <= 0)
            break;  // everything identical inside the bounds
      }
   }
   finally {
      // Always restore unclipped statistics for the caller
      image.rangeClippingEnabled = false;
   }

   return result;
}


// ============================================================================
// OUTLIER DETECTION
// ============================================================================

function detectOutliers(allMetrics, params)
{
   // Keep only valid metrics
   var valid = [];
   for (var i = 0; i < allMetrics.length; ++i) {
      if (allMetrics[i].error === null)
         valid.push(allMetrics[i]);
   }

   if (valid.length < 3) {
      // Not enough data for a statistical detection
      for (var i = 0; i < allMetrics.length; ++i) {
         allMetrics[i].flags = [];
         allMetrics[i].severity = (allMetrics[i].error === null) ? "ok" : "critical";
      }
      return { metrics: allMetrics, refs: null };
   }

   // Series references
   var medians = [], mads = [], hotpx = [];
   for (var i = 0; i < valid.length; ++i) {
      medians.push(valid[i].medianClip);
      mads.push(valid[i].mad);
      hotpx.push(valid[i].nHot5k);
   }

   var refMedian = arrayMedian(medians);
   var refMedianMad = arrayMAD(medians);
   var refMad = arrayMedian(mads);
   var refMadMad = arrayMAD(mads);
   var refHotpx = arrayMedian(hotpx);
   var refHotpxMad = arrayMAD(hotpx);

   // Anti-quantization floors (fallback when dispersion is ~0)
   var effectiveMedianDisp = Math.max(refMedianMad, 1.0);
   var effectiveMadDisp = Math.max(refMadMad, 0.5);
   var effectiveHotpxDisp = Math.max(refHotpxMad, refHotpx * 0.003, 1.0);

   // Flag each dark
   for (var i = 0; i < allMetrics.length; ++i) {
      var m = allMetrics[i];
      var flags = [];
      var severity = "ok";

      if (m.error !== null) {
         flags.push(tr("flag.readError", m.error));
         severity = "critical";
         m.flags = flags;
         m.severity = severity;
         continue;
      }

      // --- Median check (thermal signal) ---
      var medianAbsDev = Math.abs(m.medianClip - refMedian);
      var zMedian = medianAbsDev / effectiveMedianDisp;
      var zMedianMeaningful = refMedianMad > 0.5;

      if (medianAbsDev > params.medianAbsDeviationCrit) {
         flags.push(tr("flag.medianCrit", m.medianClip.toFixed(1),
            refMedian.toFixed(1), medianAbsDev.toFixed(0)));
         severity = "critical";
      }
      else if (medianAbsDev > params.medianAbsDeviationWarn) {
         var sigmaSuffix = zMedianMeaningful ?
            tr("flag.sigmaSuffix", zMedian.toFixed(1)) : "";
         flags.push(tr("flag.medianWarn", m.medianClip.toFixed(1),
            refMedian.toFixed(1), medianAbsDev.toFixed(0), sigmaSuffix));
         if (severity !== "critical") severity = "warning";
      }
      else if (zMedian > params.outlierSigmaMedian && zMedianMeaningful) {
         flags.push(tr("flag.medianStat", m.medianClip.toFixed(1),
            refMedian.toFixed(1), zMedian.toFixed(1)));
         if (severity !== "critical") severity = "warning";
      }

      // --- MAD check (abnormal noise) ---
      var madAbsDev = Math.abs(m.mad - refMad);
      var zMad = madAbsDev / effectiveMadDisp;
      var zMadMeaningful = refMadMad > 0.5;

      if (madAbsDev > params.madAbsDeviationWarn) {
         var sigmaSuffix2 = zMadMeaningful ?
            tr("flag.sigmaSuffix", zMad.toFixed(1)) : "";
         flags.push(tr("flag.noiseWarn", m.mad.toFixed(1),
            refMad.toFixed(1), madAbsDev.toFixed(1), sigmaSuffix2));
         if (severity !== "critical") severity = "warning";
      }
      else if (zMad > params.outlierSigmaMad && zMadMeaningful) {
         flags.push(tr("flag.noiseStat", m.mad.toFixed(1),
            refMad.toFixed(1), zMad.toFixed(1)));
         if (severity !== "critical") severity = "warning";
      }

      // --- Hot pixel check ---
      var zHotpx = Math.abs(m.nHot5k - refHotpx) / effectiveHotpxDisp;
      if (zHotpx > params.outlierSigmaHotpx) {
         flags.push(tr("flag.hotpx", m.nHot5k, Math.round(refHotpx),
            zHotpx.toFixed(1)));
         if (severity !== "critical") severity = "warning";
      }

      // --- Temperature check ---
      if (m.tempDeviation !== null && m.tempDeviation > params.tempDeviationMax) {
         flags.push(tr("flag.tempDrift", m.tempDeviation.toFixed(2)));
         severity = "critical";
      }

      // --- Massive saturation check ---
      if (m.nSaturated > params.saturatedPixelsMax) {
         flags.push(tr("flag.saturation", m.nSaturated));
         severity = "critical";
      }

      m.flags = flags;
      m.severity = severity;
   }

   var refs = {
      refMedian: refMedian,
      refMedianMad: refMedianMad,
      refMad: refMad,
      refMadMad: refMadMad,
      refHotpx: refHotpx,
      refHotpxMad: refHotpxMad
   };

   return { metrics: allMetrics, refs: refs };
}


// ============================================================================
// CONSOLE REPORT
// ============================================================================

function generateConsoleReport(allMetrics, refs, params)
{
   var valid = [];
   for (var i = 0; i < allMetrics.length; ++i) {
      if (allMetrics[i].error === null) valid.push(allMetrics[i]);
   }

   var sep = "====================================================================================================";
   var sep2 = "----------------------------------------------------------------------------------------------------";

   // --- Header ---
   console.writeln("");
   console.writeln(sep);
   console.writeln(tr("rep.title"));
   console.writeln(sep);
   console.writeln(tr("rep.files", allMetrics.length, valid.length));

   if (valid.length > 0) {
      // Series consistency
      var gains = [], offsets = [], exptimes = [], temps = [];
      for (var i = 0; i < valid.length; ++i) {
         if (valid[i].gain !== null) gains.push(valid[i].gain);
         if (valid[i].offset !== null) offsets.push(valid[i].offset);
         if (valid[i].exptime !== null) exptimes.push(valid[i].exptime);
         if (valid[i].setTemp !== null) temps.push(valid[i].setTemp);
      }

      console.writeln("");
      console.writeln(tr("rep.params"));
      console.writeln(tr("rep.gain", uniqueValues(gains).join(", ")));
      console.writeln(tr("rep.offset", uniqueValues(offsets).join(", ")));
      console.writeln(tr("rep.expt", uniqueValues(exptimes).join(", ")));
      console.writeln(tr("rep.settemp", uniqueValues(temps).join(", ")));

      if (uniqueValues(gains).length > 1)
         console.warningln(tr("rep.multiGain"));
      if (uniqueValues(offsets).length > 1)
         console.warningln(tr("rep.multiOffset"));
      if (uniqueValues(exptimes).length > 1)
         console.warningln(tr("rep.multiExpt"));
   }

   // --- Main table ---
   console.writeln("");
   console.writeln(sep);
   console.writeln(tr("rep.tableTitle"));
   console.writeln(sep);

   console.writeln(
      padRight("#", 4) +
      padRight(tr("rep.colFile"), 35) +
      padRight(tr("rep.colTccd"), 7) +
      padRight(tr("rep.colMedian"), 9) +
      padRight(tr("rep.colMeanClip"), 10) +
      padRight(tr("rep.colMad"), 7) +
      padRight(tr("rep.colHot"), 8) +
      padRight(tr("rep.colSat"), 6) +
      padRight(tr("rep.colState"), 10)
   );
   console.writeln(sep2);

   // Sort by observation date
   var sorted = allMetrics.slice().sort(function(a, b) {
      var da = a.dateObs || "";
      var db = b.dateObs || "";
      return da < db ? -1 : da > db ? 1 : 0;
   });

   for (var i = 0; i < sorted.length; ++i) {
      var m = sorted[i];
      var num = padRight(String(i + 1), 4);
      var fname = padRight(truncateFilename(m.filename, 34), 35);

      if (m.error !== null) {
         console.writeln(num + fname + tr("rep.error", m.error));
         continue;
      }

      var ccdT = (m.ccdTemp !== null) ? m.ccdTemp.toFixed(2) : "N/A";
      var sevSymbol = m.severity === "ok" ? "OK" :
                      m.severity === "warning" ? "WARN" : "CRIT";

      console.writeln(
         num +
         fname +
         padRight(ccdT, 7) +
         padRight(m.median.toFixed(1), 9) +
         padRight(m.meanClip.toFixed(2), 10) +
         padRight(m.mad.toFixed(1), 7) +
         padRight(String(m.nHot5k), 8) +
         padRight(String(m.nSaturated), 6) +
         sevSymbol
      );
   }

   // --- Reference statistics ---
   if (refs !== null) {
      console.writeln("");
      console.writeln(sep);
      console.writeln(tr("rep.refsTitle"));
      console.writeln(sep);

      console.writeln("");
      console.writeln(
         padRight(tr("rep.statMetric"), 25) +
         padLeft(tr("rep.statMedian"), 12) +
         padLeft(tr("rep.statSigma"), 10) +
         padLeft(tr("rep.statMin"), 10) +
         padLeft(tr("rep.statMax"), 10) +
         padLeft(tr("rep.statRange"), 10)
      );
      console.writeln(sep2.substring(0, 77));

      var statRows = [
         { name: tr("rep.statClipMed"), vals: [] },
         { name: tr("rep.statMad"), vals: [] },
         { name: tr("rep.statHot"), vals: [] },
         { name: tr("rep.statSat"), vals: [] }
      ];

      for (var i = 0; i < valid.length; ++i) {
         statRows[0].vals.push(valid[i].medianClip);
         statRows[1].vals.push(valid[i].mad);
         statRows[2].vals.push(valid[i].nHot5k);
         statRows[3].vals.push(valid[i].nSaturated);
      }

      for (var r = 0; r < statRows.length; ++r) {
         var v = statRows[r].vals;
         console.writeln(
            padRight(statRows[r].name, 25) +
            padLeft(arrayMedian(v).toFixed(2), 12) +
            padLeft(arrayMAD(v).toFixed(2), 10) +
            padLeft(arrayMin(v).toFixed(2), 10) +
            padLeft(arrayMax(v).toFixed(2), 10) +
            padLeft((arrayMax(v) - arrayMin(v)).toFixed(2), 10)
         );
      }

      // Temperature
      var tempsCcd = [];
      for (var i = 0; i < valid.length; ++i) {
         if (valid[i].ccdTemp !== null) tempsCcd.push(valid[i].ccdTemp);
      }
      if (tempsCcd.length > 0) {
         console.writeln(
            padRight(tr("rep.statTemp"), 25) +
            padLeft(arrayMedian(tempsCcd).toFixed(2), 12) +
            padLeft(arrayMAD(tempsCcd).toFixed(3), 10) +
            padLeft(arrayMin(tempsCcd).toFixed(2), 10) +
            padLeft(arrayMax(tempsCcd).toFixed(2), 10) +
            padLeft((arrayMax(tempsCcd) - arrayMin(tempsCcd)).toFixed(2), 10)
         );
      }
   }

   // --- Alerts ---
   var flagged = [];
   for (var i = 0; i < allMetrics.length; ++i) {
      if (allMetrics[i].flags && allMetrics[i].flags.length > 0 && allMetrics[i].severity !== "ok")
         flagged.push(allMetrics[i]);
   }

   console.writeln("");
   console.writeln(sep);
   console.writeln(tr("rep.alertsTitle", flagged.length, allMetrics.length));
   console.writeln(sep);

   if (flagged.length === 0) {
      console.writeln("");
      console.writeln(tr("rep.noAnomaly"));
   }
   else {
      // Sort by severity (critical first)
      flagged.sort(function(a, b) {
         var sa = a.severity === "critical" ? 0 : 1;
         var sb = b.severity === "critical" ? 0 : 1;
         if (sa !== sb) return sa - sb;
         var da = a.dateObs || "";
         var db = b.dateObs || "";
         return da < db ? -1 : da > db ? 1 : 0;
      });

      for (var i = 0; i < flagged.length; ++i) {
         var m = flagged[i];
         var symbol = m.severity === "critical" ? "X" : "!";
         console.writeln("");
         if (m.severity === "critical")
            console.warningln(symbol + " " + m.filename);
         else
            console.writeln(symbol + " " + m.filename);
         for (var j = 0; j < m.flags.length; ++j) {
            console.writeln("    -> " + m.flags[j]);
         }
      }
   }

   // --- Recommendations ---
   console.writeln("");
   console.writeln(sep);
   console.writeln(tr("rep.recoTitle"));
   console.writeln(sep);

   var warnings = [];
   var criticals = [];
   for (var i = 0; i < valid.length; ++i) {
      if (valid[i].severity === "warning") warnings.push(valid[i]);
      if (valid[i].severity === "critical") criticals.push(valid[i]);
   }

   if (criticals.length > 0) {
      console.warningln("");
      console.warningln(tr("rep.critList", criticals.length));
      for (var i = 0; i < criticals.length; ++i)
         console.warningln("   - " + criticals[i].filename);
   }

   if (warnings.length > 0) {
      console.writeln("");
      console.writeln(tr("rep.warnList", warnings.length));
      for (var i = 0; i < warnings.length; ++i)
         console.writeln("   - " + warnings[i].filename);
      console.writeln("");
      console.writeln(tr("rep.warnAdvice"));
   }

   if (warnings.length === 0 && criticals.length === 0) {
      console.writeln("");
      console.writeln(tr("rep.clean"));
   }

   var cleanCount = 0;
   for (var i = 0; i < valid.length; ++i) {
      if (valid[i].severity === "ok") cleanCount++;
   }

   console.writeln("");
   console.writeln(tr("rep.stackTitle"));
   console.writeln(tr("rep.stackTotal", valid.length));
   console.writeln(tr("rep.stackClean", cleanCount));
   console.writeln(tr("rep.stackReco"));
   console.writeln(tr("rep.stackNorm"));
   console.writeln(tr("rep.stackOut"));

   console.writeln("");
   console.writeln(sep);
   console.writeln(tr("rep.done", allMetrics.length));
   console.writeln(sep);
}


// ============================================================================
// EXPORT CSV
// ============================================================================

var CSV_SEP = ";";

function csvField(val)
{
   // Text field: empty when absent, quoted when the content contains
   // the separator, quotes or a line break
   if (val === null || val === undefined) return "";
   var s = String(val);
   if (s.indexOf(CSV_SEP) >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0)
      s = '"' + s.replace(/"/g, '""') + '"';
   return s;
}

function csvNum(val, decimals)
{
   // Numeric field: empty when absent, decimal point notation
   if (val === null || val === undefined) return "";
   if (decimals === 0) return String(Math.round(val));
   return val.toFixed(decimals);
}

function buildCsv(allMetrics)
{
   // Header names are fixed English regardless of the UI language:
   // machine-readable output stays stable for downstream tooling
   var header = [
      "file", "path", "date_obs", "image_type",
      "gain", "offset", "exptime_s",
      "set_temp_c", "ccd_temp_c", "temp_drift_c",
      "readout_mode", "bayer",
      "width", "height",
      "min_adu", "max_adu", "mean_adu", "median_adu", "stddev_adu",
      "mad_adu", "mean_clip_adu", "median_clip_adu", "stddev_clip_adu",
      "hot_1k", "hot_5k", "hot_10k", "saturated", "zeros",
      "center_median_adu", "corner_delta_adu",
      "status", "flags", "error"
   ];

   var lines = [header.join(CSV_SEP)];

   // Same order as the console report: sorted by observation date
   var sorted = allMetrics.slice().sort(function(a, b) {
      var da = a.dateObs || "";
      var db = b.dateObs || "";
      return da < db ? -1 : da > db ? 1 : 0;
   });

   for (var i = 0; i < sorted.length; ++i) {
      var m = sorted[i];
      var row = [
         csvField(m.filename),
         csvField(m.filepath),
         csvField(m.dateObs),
         csvField(m.imageType),
         csvNum(m.gain, 2),
         csvNum(m.offset, 2),
         csvNum(m.exptime, 2),
         csvNum(m.setTemp, 2),
         csvNum(m.ccdTemp, 2),
         csvNum(m.tempDeviation, 2),
         csvField(m.readoutMode),
         csvField(m.bayerPat),
         csvNum(m.width, 0),
         csvNum(m.height, 0),
         csvNum(m.min, 1),
         csvNum(m.max, 1),
         csvNum(m.mean, 2),
         csvNum(m.median, 1),
         csvNum(m.stdDev, 2),
         csvNum(m.mad, 2),
         csvNum(m.meanClip, 2),
         csvNum(m.medianClip, 1),
         csvNum(m.stdClip, 2),
         csvNum(m.nHot1k, 0),
         csvNum(m.nHot5k, 0),
         csvNum(m.nHot10k, 0),
         csvNum(m.nSaturated, 0),
         csvNum(m.nZero, 0),
         csvNum(m.centreMedian, 1),
         csvNum(m.maxCornerDelta, 2),
         csvField(m.severity),
         csvField(m.flags && m.flags.length > 0 ? m.flags.join(" | ") : ""),
         csvField(m.error)
      ];
      lines.push(row.join(CSV_SEP));
   }

   return lines.join("\n") + "\n";
}

function writeTextFileCompat(path, text)
{
   // File.writeTextFile does not exist in old PI versions
   if (typeof File.writeTextFile === "function") {
      File.writeTextFile(path, text);
      return;
   }
   var f = new File;
   f.createForWriting(path);
   f.outText(text);
   f.close();
}


// ============================================================================
// WBPP EXCLUSION LIST DIALOG
// ============================================================================

function ExclusionDialog(parentDialog, allMetrics)
{
   this.__base__ = Dialog;
   this.__base__();

   var self = this;

   this.parentDialog = parentDialog;
   this.allMetrics = allMetrics;
   this.movedPaths = [];        // files already moved to rejected/
   this.includeWarnings = false;

   this.helpLabel = new Label(this);
   this.helpLabel.text = tr("excl.help");
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = false;

   this.includeWarningsCheck = new CheckBox(this);
   this.includeWarningsCheck.text = tr("excl.inclWarn");
   this.includeWarningsCheck.checked = false;
   this.includeWarningsCheck.toolTip = tr("excl.inclWarn.tt");
   this.includeWarningsCheck.onCheck = function(checked)
   {
      self.includeWarnings = checked;
      self.refreshList();
   };

   this.listTextBox = new TextBox(this);
   this.listTextBox.readOnly = true;
   this.listTextBox.setMinSize(700, 250);

   this.countLabel = new Label(this);
   this.countLabel.text = "";

   this.exportTxtButton = new PushButton(this);
   this.exportTxtButton.text = tr("excl.exportTxt");
   this.exportTxtButton.icon = this.scaledResource(":/icons/document-text-export.png");
   this.exportTxtButton.toolTip = tr("excl.exportTxt.tt");
   this.exportTxtButton.onClick = function() { self.exportTxt(); };

   this.moveButton = new PushButton(this);
   this.moveButton.text = tr("excl.move");
   this.moveButton.icon = this.scaledResource(":/icons/folder.png");
   this.moveButton.toolTip = tr("excl.move.tt");
   this.moveButton.onClick = function() { self.moveToRejected(); };

   this.closeButton = new PushButton(this);
   this.closeButton.text = tr("btn.close");
   this.closeButton.icon = this.scaledResource(":/icons/close.png");
   this.closeButton.onClick = function() { self.ok(); };

   this.buttonsSizer = new HorizontalSizer();
   this.buttonsSizer.spacing = 8;
   this.buttonsSizer.add(this.exportTxtButton);
   this.buttonsSizer.add(this.moveButton);
   this.buttonsSizer.addStretch();
   this.buttonsSizer.add(this.closeButton);

   this.sizer = new VerticalSizer();
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add(this.helpLabel);
   this.sizer.add(this.includeWarningsCheck);
   this.sizer.add(this.listTextBox, 100);
   this.sizer.add(this.countLabel);
   this.sizer.add(this.buttonsSizer);

   this.windowTitle = TITLE + " — " + tr("excl.title");
   this.adjustToContents();

   this.refreshList();
}

ExclusionDialog.prototype = new Dialog();

ExclusionDialog.prototype.excludedMetrics = function()
{
   // Rejected darks (criticals + read errors) always, warnings on option.
   // Files already moved are no longer listed.
   var list = [];
   for (var i = 0; i < this.allMetrics.length; ++i) {
      var m = this.allMetrics[i];
      if (this.movedPaths.indexOf(m.filepath) >= 0) continue;
      if (m.severity === "critical")
         list.push(m);
      else if (this.includeWarnings && m.severity === "warning")
         list.push(m);
   }
   return list;
};

ExclusionDialog.prototype.refreshList = function()
{
   var list = this.excludedMetrics();
   var paths = [];
   for (var i = 0; i < list.length; ++i)
      paths.push(list[i].filepath);

   this.listTextBox.text = paths.join("\n");
   this.countLabel.text = tr("excl.count", list.length) +
      (this.movedPaths.length > 0 ?
         tr("excl.movedCount", this.movedPaths.length) : "");

   this.exportTxtButton.enabled = list.length > 0;
   this.moveButton.enabled = list.length > 0;
};

ExclusionDialog.prototype.exportTxt = function()
{
   var list = this.excludedMetrics();
   if (list.length === 0) return;

   var sfd = new SaveFileDialog();
   sfd.caption = tr("excl.exportCaption");
   sfd.filters = [[tr("txt.filter"), "*.txt"], [tr("filter.all"), "*"]];
   sfd.overwritePrompt = true;

   var first = list[0].filepath;
   sfd.initialPath = File.extractDrive(first) + File.extractDirectory(first) +
      "/darks_exclusions.txt";

   if (!sfd.execute()) return;

   var path = sfd.fileName;
   if (File.extractExtension(path).length === 0)
      path += ".txt";

   var paths = [];
   for (var i = 0; i < list.length; ++i)
      paths.push(list[i].filepath);

   try {
      writeTextFileCompat(path, paths.join("\n") + "\n");
      console.noteln(tr("excl.exportDoneLog", path));
      (new MessageBox(tr("excl.exportDone", path),
         TITLE, StdIcon_Information, StdButton_Ok)).execute();
   }
   catch (e) {
      (new MessageBox(tr("excl.exportFail", e.message),
         TITLE, StdIcon_Error, StdButton_Ok)).execute();
   }
};

ExclusionDialog.prototype.moveToRejected = function()
{
   var list = this.excludedMetrics();
   if (list.length === 0) return;

   var answer = (new MessageBox(tr("excl.confirmMove", list.length),
      TITLE, StdIcon_Question, StdButton_Yes, StdButton_No)).execute();
   if (answer !== StdButton_Yes)
      return;

   var moved = 0;
   var failed = [];

   for (var i = 0; i < list.length; ++i) {
      var m = list[i];
      try {
         var dir = File.extractDrive(m.filepath) + File.extractDirectory(m.filepath);
         var rejDir = dir + "/rejected";
         if (!File.directoryExists(rejDir))
            File.createDirectory(rejDir);

         var target = rejDir + "/" + m.filename;
         if (File.exists(target))
            throw new Error(tr("excl.exists"));

         File.move(m.filepath, target);
         this.movedPaths.push(m.filepath);
         moved++;
         console.noteln(tr("excl.movedLog", m.filename, target));

         // Remove the file from the main dialog's list
         this.parentDialog.removeFileByPath(m.filepath);
      }
      catch (e) {
         failed.push(m.filename + " : " + e.message);
      }
   }

   this.refreshList();

   var report = tr("excl.moveReport", moved);
   if (failed.length > 0)
      report += tr("excl.moveFailures", failed.length, failed.join("\n"));
   (new MessageBox(report, TITLE,
      failed.length > 0 ? StdIcon_Warning : StdIcon_Information,
      StdButton_Ok)).execute();
};


// ============================================================================
// MAIN DIALOG
// ============================================================================

function DarkAnalyzerDialog()
{
   this.__base__ = Dialog;
   this.__base__();

   var self = this;

   // Working copy of the current parameters
   this.params = {};
   for (var key in DEFAULT_PARAMS)
      this.params[key] = DEFAULT_PARAMS[key];

   // Data
   this.filePaths = [];
   this.allMetrics = [];
   this.refs = null;
   this.busy = false;  // analysis in progress (locks the GUI)

   // -----------------------------------------------------------------------
   // Title + top row (help text + language selector)
   // -----------------------------------------------------------------------
   this.title = TITLE + " v" + VERSION;

   this.helpLabel = new Label(this);
   this.helpLabel.useRichText = false;

   this.langLabel = new Label(this);
   this.langLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

   this.langCombo = new ComboBox(this);
   for (var li = 0; li < LANG_NAMES.length; ++li)
      this.langCombo.addItem(LANG_NAMES[li]);
   this.langCombo.currentItem = Math.max(0, LANG_CODES.indexOf(gLanguage));
   this.langCombo.onItemSelected = function(index)
   {
      gLanguage = LANG_CODES[index];
      saveLanguageSetting();
      // Static texts update immediately; already computed content
      // (table rows, summary) refreshes on the next analysis
      self.applyLanguage();
   };

   this.topSizer = new HorizontalSizer();
   this.topSizer.spacing = 6;
   this.topSizer.add(this.helpLabel);
   this.topSizer.addStretch();
   this.topSizer.add(this.langLabel);
   this.topSizer.add(this.langCombo);

   // -----------------------------------------------------------------------
   // Single TreeBox (files + results)
   // -----------------------------------------------------------------------
   this.fileTreeBox = new TreeBox(this);
   this.fileTreeBox.alternateRowColor = true;
   this.fileTreeBox.headerVisible = true;
   this.fileTreeBox.headerSorting = true;
   this.fileTreeBox.multipleSelection = true;
   this.fileTreeBox.sort(1, false);
   // Hidden column 8 holds the full file path: it is the unique row
   // identifier. Sorts (automatic or via headers) reorder the rows,
   // so rows are never accessed by index.
   this.fileTreeBox.numberOfColumns = 9;
   this.fileTreeBox.setHeaderText(8, "");

   this.fileTreeBox.setColumnWidth(0, 50);
   this.fileTreeBox.setColumnWidth(1, 330);
   this.fileTreeBox.setColumnWidth(2, 60);
   this.fileTreeBox.setColumnWidth(3, 70);
   this.fileTreeBox.setColumnWidth(4, 60);
   this.fileTreeBox.setColumnWidth(5, 60);
   this.fileTreeBox.setColumnWidth(6, 50);
   this.fileTreeBox.setColumnWidth(7, 90);
   this.fileTreeBox.setColumnWidth(8, 0);
   if (typeof this.fileTreeBox.hideColumn === "function")
      this.fileTreeBox.hideColumn(8);
   this.fileTreeBox.setMinSize(800, 300);

   // -----------------------------------------------------------------------
   // File buttons
   // -----------------------------------------------------------------------
   this.addFilesButton = new PushButton(this);
   this.addFilesButton.onClick = function()
   {
      var ofd = new OpenFileDialog();
      ofd.multipleSelections = true;
      ofd.caption = tr("dlg.selectFiles");
      ofd.filters = [[tr("dlg.fitsFilter"), "*.fits", "*.fit", "*.FITS", "*.FIT"]];
      if (ofd.execute()) {
         for (var i = 0; i < ofd.fileNames.length; ++i)
            self.addFile(ofd.fileNames[i]);
      }
   };

   this.addDirButton = new PushButton(this);
   this.addDirButton.onClick = function()
   {
      var gdd = new GetDirectoryDialog();
      gdd.caption = tr("dlg.selectDir");
      if (gdd.execute()) {
         var dir = gdd.directory;
         var search = new FileFind();
         var extensions = [".fits", ".fit", ".FITS", ".FIT"];
         for (var e = 0; e < extensions.length; ++e) {
            if (search.begin(dir + "/*" + extensions[e])) {
               do {
                  if (!search.isDirectory)
                     self.addFile(dir + "/" + search.name);
               } while (search.next());
            }
         }
      }
   };

   this.removeButton = new PushButton(this);
   this.removeButton.onClick = function()
   {
      // Remove the selected rows (walking backwards). The file is found
      // by its path (hidden column), not by row index: after a sort the
      // two no longer match.
      for (var i = self.fileTreeBox.numberOfChildren - 1; i >= 0; --i) {
         var node = self.fileTreeBox.child(i);
         if (node.selected) {
            var path = node.text(8);
            for (var j = 0; j < self.filePaths.length; ++j) {
               if (self.filePaths[j] === path) {
                  self.filePaths.splice(j, 1);
                  break;
               }
            }
            self.fileTreeBox.remove(i);
         }
      }
      self.renumberRows();
   };

   this.clearButton = new PushButton(this);
   this.clearButton.onClick = function()
   {
      self.filePaths = [];
      self.fileTreeBox.clear();
      self.allMetrics = [];
      self.refs = null;
      self.summaryLabel.text = "";
      self.exportCsvButton.enabled = false;
      self.exclusionsButton.enabled = false;
   };

   this.fileButtonsSizer = new HorizontalSizer();
   this.fileButtonsSizer.spacing = 6;
   this.fileButtonsSizer.add(this.addFilesButton);
   this.fileButtonsSizer.add(this.addDirButton);
   this.fileButtonsSizer.addStretch();
   this.fileButtonsSizer.add(this.removeButton);
   this.fileButtonsSizer.add(this.clearButton);

   // Files group box
   this.filesGroupBox = new GroupBox(this);
   this.filesGroupBox.sizer = new VerticalSizer();
   this.filesGroupBox.sizer.margin = 6;
   this.filesGroupBox.sizer.spacing = 6;
   this.filesGroupBox.sizer.add(this.fileTreeBox);
   this.filesGroupBox.sizer.add(this.fileButtonsSizer);

   // -----------------------------------------------------------------------
   // Analysis parameters — one group per metric
   // -----------------------------------------------------------------------

   // --- Temperature ---
   this.tempDevControl = this.createNumericControl(
      0.1, 2.0, this.params.tempDeviationMax, 2);
   this.tempHint = new Label(this);
   this.tempHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.tempGroup = new GroupBox(this);
   this.tempGroup.sizer = new VerticalSizer();
   this.tempGroup.sizer.margin = 6;
   this.tempGroup.sizer.spacing = 4;
   this.tempGroup.sizer.add(this.tempHint);
   this.tempGroup.sizer.add(this.tempDevControl);

   // --- Median ---
   this.sigmaMedianControl = this.createNumericControl(
      0.5, 5.0, this.params.outlierSigmaMedian, 1);
   this.medDevWarnControl = this.createNumericControl(
      10, 256, this.params.medianAbsDeviationWarn, 0);
   this.medDevCritControl = this.createNumericControl(
      20, 512, this.params.medianAbsDeviationCrit, 0);
   this.medianHint = new Label(this);
   this.medianHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.medianGroup = new GroupBox(this);
   this.medianGroup.sizer = new VerticalSizer();
   this.medianGroup.sizer.margin = 6;
   this.medianGroup.sizer.spacing = 4;
   this.medianGroup.sizer.add(this.medianHint);
   this.medianGroup.sizer.add(this.sigmaMedianControl);
   this.medianGroup.sizer.add(this.medDevWarnControl);
   this.medianGroup.sizer.add(this.medDevCritControl);

   // --- Noise ---
   this.sigmaMadControl = this.createNumericControl(
      0.5, 5.0, this.params.outlierSigmaMad, 1);
   this.madDevWarnControl = this.createNumericControl(
      5, 100, this.params.madAbsDeviationWarn, 0);
   this.bruitHint = new Label(this);
   this.bruitHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.bruitGroup = new GroupBox(this);
   this.bruitGroup.sizer = new VerticalSizer();
   this.bruitGroup.sizer.margin = 6;
   this.bruitGroup.sizer.spacing = 4;
   this.bruitGroup.sizer.add(this.bruitHint);
   this.bruitGroup.sizer.add(this.sigmaMadControl);
   this.bruitGroup.sizer.add(this.madDevWarnControl);

   // --- Hot pixels ---
   this.sigmaHotpxControl = this.createNumericControl(
      0.5, 5.0, this.params.outlierSigmaHotpx, 1);
   this.hotPxThreshControl = this.createNumericControl(
      500, 10000, this.params.hotPixelThresholdADU, 0);
   this.hotpxHint = new Label(this);
   this.hotpxHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.hotpxGroup = new GroupBox(this);
   this.hotpxGroup.sizer = new VerticalSizer();
   this.hotpxGroup.sizer.margin = 6;
   this.hotpxGroup.sizer.spacing = 4;
   this.hotpxGroup.sizer.add(this.hotpxHint);
   this.hotpxGroup.sizer.add(this.sigmaHotpxControl);
   this.hotpxGroup.sizer.add(this.hotPxThreshControl);

   // --- Saturation ---
   this.satPxMaxControl = this.createNumericControl(
      10, 5000, this.params.saturatedPixelsMax, 0);
   this.satHint = new Label(this);
   this.satHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.satGroup = new GroupBox(this);
   this.satGroup.sizer = new VerticalSizer();
   this.satGroup.sizer.margin = 6;
   this.satGroup.sizer.spacing = 4;
   this.satGroup.sizer.add(this.satHint);
   this.satGroup.sizer.add(this.satPxMaxControl);

   // --- Two-column layout ---
   this.paramsCol1 = new VerticalSizer();
   this.paramsCol1.spacing = 6;
   this.paramsCol1.add(this.tempGroup);
   this.paramsCol1.add(this.medianGroup);

   this.paramsCol2 = new VerticalSizer();
   this.paramsCol2.spacing = 6;
   this.paramsCol2.add(this.bruitGroup);
   this.paramsCol2.add(this.hotpxGroup);
   this.paramsCol2.add(this.satGroup);

   this.paramsGroupBox = new GroupBox(this);
   this.paramsGroupBox.sizer = new HorizontalSizer();
   this.paramsGroupBox.sizer.margin = 6;
   this.paramsGroupBox.sizer.spacing = 8;
   this.paramsGroupBox.sizer.add(this.paramsCol1);
   this.paramsGroupBox.sizer.add(this.paramsCol2);

   // -----------------------------------------------------------------------
   // Summary
   // -----------------------------------------------------------------------
   this.summaryLabel = new Label(this);
   this.summaryLabel.text = "";
   this.summaryLabel.useRichText = true;
   this.summaryLabel.textAlignment = TextAlign_Center;
   this.summaryLabel.styleSheet = "QLabel { font-size: 14pt; }";

   // -----------------------------------------------------------------------
   // Action buttons
   // -----------------------------------------------------------------------
   this.analyzeButton = new PushButton(this);
   this.analyzeButton.icon = this.scaledResource(":/icons/gears.png");
   this.analyzeButton.onClick = function() { self.runAnalysis(); };

   this.exportCsvButton = new PushButton(this);
   this.exportCsvButton.icon = this.scaledResource(":/icons/document-csv.png");
   this.exportCsvButton.enabled = false;  // enabled after an analysis
   this.exportCsvButton.onClick = function() { self.exportCsv(); };

   this.exclusionsButton = new PushButton(this);
   this.exclusionsButton.icon = this.scaledResource(":/icons/window-export.png");
   this.exclusionsButton.enabled = false;  // enabled after an analysis
   this.exclusionsButton.onClick = function() { self.showExclusions(); };

   this.closeButton = new PushButton(this);
   this.closeButton.icon = this.scaledResource(":/icons/close.png");
   this.closeButton.onClick = function() { self.cancel(); };

   this.actionButtonsSizer = new HorizontalSizer();
   this.actionButtonsSizer.spacing = 8;
   this.actionButtonsSizer.addStretch();
   this.actionButtonsSizer.add(this.analyzeButton);
   this.actionButtonsSizer.add(this.exportCsvButton);
   this.actionButtonsSizer.add(this.exclusionsButton);
   this.actionButtonsSizer.add(this.closeButton);
   this.actionButtonsSizer.addStretch();

   // -----------------------------------------------------------------------
   // Main layout
   // -----------------------------------------------------------------------
   this.sizer = new VerticalSizer();
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add(this.topSizer);
   this.sizer.add(this.filesGroupBox, 100);  // stretch
   this.sizer.add(this.paramsGroupBox);
   this.sizer.add(this.summaryLabel);
   this.sizer.add(this.actionButtonsSizer);

   // Apply all translatable texts for the current language
   this.applyLanguage();

   this.windowTitle = TITLE;
   this.setMinSize(850, 650);
   this.adjustToContents();
}

DarkAnalyzerDialog.prototype = new Dialog();


// ============================================================================
// DIALOG METHODS
// ============================================================================

DarkAnalyzerDialog.prototype.createNumericControl = function(minVal, maxVal, defaultVal, precision)
{
   // Labels are assigned by applyLanguage()
   var nc = new NumericControl(this);
   nc.label.minWidth = 200;
   nc.setRange(minVal, maxVal);
   nc.setPrecision(precision);
   nc.setValue(defaultVal);
   return nc;
};

DarkAnalyzerDialog.prototype.applyLanguage = function()
{
   // Assign every static translatable text for the current language.
   // Called once at construction and again on each language switch.
   this.helpLabel.text = tr("help");
   this.langLabel.text = tr("lang.label");

   this.fileTreeBox.setHeaderText(0, tr("col.num"));
   this.fileTreeBox.setHeaderText(1, tr("col.file"));
   this.fileTreeBox.setHeaderText(2, tr("col.temp"));
   this.fileTreeBox.setHeaderText(3, tr("col.median"));
   this.fileTreeBox.setHeaderText(4, tr("col.noise"));
   this.fileTreeBox.setHeaderText(5, tr("col.hotpx"));
   this.fileTreeBox.setHeaderText(6, tr("col.sat"));
   this.fileTreeBox.setHeaderText(7, tr("col.state"));

   this.filesGroupBox.title = tr("files.group");
   this.addFilesButton.text = tr("btn.addFiles");
   this.addFilesButton.toolTip = tr("btn.addFiles.tt");
   this.addDirButton.text = tr("btn.addDir");
   this.addDirButton.toolTip = tr("btn.addDir.tt");
   this.removeButton.text = tr("btn.remove");
   this.removeButton.toolTip = tr("btn.remove.tt");
   this.clearButton.text = tr("btn.clear");
   this.clearButton.toolTip = tr("btn.clear.tt");

   this.paramsGroupBox.title = tr("params.group");
   this.tempGroup.title = tr("temp.group");
   this.tempHint.text = tr("temp.hint");
   this.tempDevControl.label.text = tr("temp.max");
   this.medianGroup.title = tr("median.group");
   this.medianHint.text = tr("median.hint");
   this.sigmaMedianControl.label.text = tr("lbl.sigma");
   this.medDevWarnControl.label.text = tr("lbl.warnAdu");
   this.medDevCritControl.label.text = tr("lbl.critAdu");
   this.bruitGroup.title = tr("noise.group");
   this.bruitHint.text = tr("noise.hint");
   this.sigmaMadControl.label.text = tr("lbl.sigma");
   this.madDevWarnControl.label.text = tr("lbl.warnAdu");
   this.hotpxGroup.title = tr("hotpx.group");
   this.hotpxHint.text = tr("hotpx.hint");
   this.sigmaHotpxControl.label.text = tr("lbl.sigma");
   this.hotPxThreshControl.label.text = tr("hotpx.threshold");
   this.satGroup.title = tr("sat.group");
   this.satHint.text = tr("sat.hint");
   this.satPxMaxControl.label.text = tr("sat.max");

   this.analyzeButton.text = tr("btn.analyze");
   this.analyzeButton.toolTip = tr("btn.analyze.tt");
   this.exportCsvButton.text = tr("btn.exportCsv");
   this.exportCsvButton.toolTip = tr("btn.exportCsv.tt");
   this.exclusionsButton.text = tr("btn.exclusions");
   this.exclusionsButton.toolTip = tr("btn.exclusions.tt");
   this.closeButton.text = tr("btn.close");
};

DarkAnalyzerDialog.prototype.addFile = function(filePath)
{
   // Skip duplicates
   for (var i = 0; i < this.filePaths.length; ++i) {
      if (this.filePaths[i] === filePath) return;
   }

   this.filePaths.push(filePath);

   var node = new TreeBoxNode(this.fileTreeBox);
   var num = this.filePaths.length;
   var fname = File.extractName(filePath) + File.extractExtension(filePath);

   node.setText(0, padLeft(String(num), 4));
   node.setAlignment(0, TextAlign_Left);
   node.setText(1, fname);
   node.setText(8, filePath);  // unique row identifier
   // Columns 2-7 stay empty until the analysis
};

DarkAnalyzerDialog.prototype.removeFileByPath = function(filePath)
{
   for (var j = 0; j < this.filePaths.length; ++j) {
      if (this.filePaths[j] === filePath) {
         this.filePaths.splice(j, 1);
         break;
      }
   }
   for (var i = 0; i < this.fileTreeBox.numberOfChildren; ++i) {
      if (this.fileTreeBox.child(i).text(8) === filePath) {
         this.fileTreeBox.remove(i);
         break;
      }
   }
   this.renumberRows();
};

DarkAnalyzerDialog.prototype.findNodeByPath = function(filePath)
{
   for (var i = 0; i < this.fileTreeBox.numberOfChildren; ++i) {
      var node = this.fileTreeBox.child(i);
      if (node.text(8) === filePath)
         return node;
   }
   return null;
};

DarkAnalyzerDialog.prototype.renumberRows = function()
{
   // Right-aligned numbers so the text sort of the # column matches
   // numeric order ("   2" before "  10")
   for (var i = 0; i < this.fileTreeBox.numberOfChildren; ++i) {
      this.fileTreeBox.child(i).setText(0, padLeft(String(i + 1), 4));
   }
};

DarkAnalyzerDialog.prototype.setBusy = function(busy)
{
   // processEvents() keeps the GUI responsive during the analysis: lock
   // every control to prevent a second run or a change of the file list
   // in the middle of a run.
   this.busy = busy;
   var enabled = !busy;
   this.analyzeButton.enabled = enabled;
   this.exportCsvButton.enabled = enabled && this.allMetrics.length > 0;
   this.exclusionsButton.enabled = enabled && this.allMetrics.length > 0;
   this.closeButton.enabled = enabled;
   this.addFilesButton.enabled = enabled;
   this.addDirButton.enabled = enabled;
   this.removeButton.enabled = enabled;
   this.clearButton.enabled = enabled;
   this.fileTreeBox.enabled = enabled;
   this.paramsGroupBox.enabled = enabled;
};

DarkAnalyzerDialog.prototype.readParamsFromGUI = function()
{
   this.params.outlierSigmaMedian = this.sigmaMedianControl.value;
   this.params.outlierSigmaMad = this.sigmaMadControl.value;
   this.params.outlierSigmaHotpx = this.sigmaHotpxControl.value;
   this.params.tempDeviationMax = this.tempDevControl.value;
   this.params.hotPixelThresholdADU = this.hotPxThreshControl.value;
   this.params.saturatedPixelsMax = this.satPxMaxControl.value;
   this.params.medianAbsDeviationWarn = this.medDevWarnControl.value;
   this.params.medianAbsDeviationCrit = this.medDevCritControl.value;
   this.params.madAbsDeviationWarn = this.madDevWarnControl.value;
};

DarkAnalyzerDialog.prototype.updateRowMetrics = function(m)
{
   var node = this.findNodeByPath(m.filepath);
   if (!node) return;

   if (m.error !== null) {
      node.setText(2, tr("state.err"));
      node.setText(7, tr("state.error"));
      node.setIcon(7, new Bitmap(this.scaledResource(":/bullets/bullet-ball-glass-red.png")));
      node.setToolTip(7, tr("tt.error", m.error));
      for (var c = 0; c < 8; ++c)
         node.setBackgroundColor(c, 0xFFFF6666);
      return;
   }

   node.setText(2, m.ccdTemp !== null ? m.ccdTemp.toFixed(2) : "N/A");
   node.setText(3, m.median.toFixed(1));
   node.setText(4, m.mad.toFixed(1));
   node.setText(5, String(m.nHot5k));
   node.setText(6, String(m.nSaturated));
   node.setText(7, "...");
};

DarkAnalyzerDialog.prototype.updateRowSeverity = function(m)
{
   var node = this.findNodeByPath(m.filepath);
   if (!node) return;

   var color;
   var iconPath;
   var sortKey;
   if (m.severity === "ok") {
      color = 0xFF90EE90;  // light green
      iconPath = ":/bullets/bullet-ball-glass-green.png";
      sortKey = tr("state.valid");
   }
   else if (m.severity === "warning") {
      color = 0xFFFFFF66;  // yellow
      iconPath = ":/bullets/bullet-ball-glass-yellow.png";
      sortKey = tr("state.warning");
   }
   else {
      color = 0xFFFF6666;  // red
      iconPath = ":/bullets/bullet-ball-glass-red.png";
      sortKey = tr("state.rejected");
   }

   for (var c = 0; c < 8; ++c)
      node.setBackgroundColor(c, color);

   // Colored icon + sort key in the status column. In both languages the
   // status words keep the same alphabetical order (Alert/Alerte < Error/
   // Erreur < Rejected/Rejet < Valid/Valide), so the severity sort of
   // column 7 behaves identically.
   node.setText(7, sortKey);
   node.setIcon(7, new Bitmap(this.scaledResource(iconPath)));
   var tooltip = "";
   if (m.flags && m.flags.length > 0) {
      tooltip = m.flags.join("\n");
   }
   else {
      tooltip = tr("tt.noAnomaly");
   }
   node.setToolTip(7, tooltip);
};

DarkAnalyzerDialog.prototype.runAnalysis = function()
{
   if (this.busy) return;

   if (this.filePaths.length === 0) {
      (new MessageBox(tr("msg.noFiles"),
         TITLE, StdIcon_Warning, StdButton_Ok)).execute();
      return;
   }

   this.setBusy(true);
   try {
      this.doAnalysis();
   }
   finally {
      this.setBusy(false);  // always unlock, even if the analysis failed
   }
};

DarkAnalyzerDialog.prototype.doAnalysis = function()
{
   // Read the parameters from the GUI
   this.readParamsFromGUI();

   // Reset the results
   this.allMetrics = [];
   this.refs = null;

   // Reset the result columns
   for (var i = 0; i < this.fileTreeBox.numberOfChildren; ++i) {
      var node = this.fileTreeBox.child(i);
      for (var c = 2; c < 8; ++c)
         node.setText(c, "");
      for (var c = 0; c < 8; ++c)
         node.setBackgroundColor(c, 0x00000000);
   }

   console.show();
   console.writeln("");
   console.writeln(tr("run.start", this.filePaths.length));
   console.flush();

   var startTime = Date.now();

   // Phase 1: per-frame analysis (progressive TreeBox update)
   for (var i = 0; i < this.filePaths.length; ++i) {
      console.write("<end>\r" + tr("run.progress", i + 1, this.filePaths.length) +
         File.extractName(this.filePaths[i]) + File.extractExtension(this.filePaths[i]));
      console.flush();

      var metrics = analyzeSingleDark(this.filePaths[i], this.params);
      this.allMetrics.push(metrics);

      // Immediate row update in the TreeBox
      this.updateRowMetrics(metrics);
      processEvents();  // keep the UI responsive
   }

   console.writeln("");  // new line after the progress indicator
   var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
   console.writeln(tr("run.elapsed", elapsed));

   // Phase 2: outlier detection over the whole series
   var result = detectOutliers(this.allMetrics, this.params);
   this.allMetrics = result.metrics;
   this.refs = result.refs;

   // Phase 3: severity color update
   var nOk = 0, nWarn = 0, nCrit = 0;
   for (var i = 0; i < this.allMetrics.length; ++i) {
      this.updateRowSeverity(this.allMetrics[i]);
      if (this.allMetrics[i].severity === "ok") nOk++;
      else if (this.allMetrics[i].severity === "warning") nWarn++;
      else nCrit++;
   }

   // Colored summary
   this.summaryLabel.text =
      "<b><span style='color: #228B22;'>" + nOk + " " + tr("sum.valid") + "</span></b>" +
      " / " +
      "<b><span style='color: #CC8800;'>" + nWarn + " " + tr("sum.warn") + "</span></b>" +
      " / " +
      "<b><span style='color: #CC0000;'>" + nCrit + " " + tr("sum.crit") + "</span></b>";

   // Sort by severity (criticals on top)
   this.fileTreeBox.sort(7, true);
   this.renumberRows();

   // Full console report
   generateConsoleReport(this.allMetrics, this.refs, this.params);

   // Export buttons are re-enabled by setBusy(false) at the end of the run
   processEvents();
};

DarkAnalyzerDialog.prototype.exportCsv = function()
{
   if (this.allMetrics.length === 0) return;

   var sfd = new SaveFileDialog();
   sfd.caption = tr("csv.caption");
   sfd.filters = [[tr("csv.filter"), "*.csv"], [tr("filter.all"), "*"]];
   sfd.overwritePrompt = true;

   // Default to the directory of the first analyzed dark
   var first = this.allMetrics[0].filepath;
   sfd.initialPath = File.extractDrive(first) + File.extractDirectory(first) +
      "/darks_analysis.csv";

   if (!sfd.execute()) return;

   var path = sfd.fileName;
   if (File.extractExtension(path).length === 0)
      path += ".csv";

   try {
      writeTextFileCompat(path, buildCsv(this.allMetrics));
      console.noteln(tr("csv.doneLog", path));
      (new MessageBox(tr("csv.done", path),
         TITLE, StdIcon_Information, StdButton_Ok)).execute();
   }
   catch (e) {
      (new MessageBox(tr("csv.fail", e.message),
         TITLE, StdIcon_Error, StdButton_Ok)).execute();
   }
};

DarkAnalyzerDialog.prototype.showExclusions = function()
{
   if (this.allMetrics.length === 0) return;

   var flagged = 0;
   for (var i = 0; i < this.allMetrics.length; ++i) {
      if (this.allMetrics[i].severity !== "ok") flagged++;
   }
   if (flagged === 0) {
      (new MessageBox(tr("excl.none"),
         TITLE, StdIcon_Information, StdButton_Ok)).execute();
      return;
   }

   var dialog = new ExclusionDialog(this, this.allMetrics);
   dialog.execute();
};


// ============================================================================
// ENTRY POINT
// ============================================================================

function main()
{
   loadLanguageSetting();
   var dialog = new DarkAnalyzerDialog();
   dialog.execute();
}

main();
