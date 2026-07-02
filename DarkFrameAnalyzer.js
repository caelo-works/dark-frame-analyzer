// ============================================================================
// DarkFrameAnalyzer.js — Analyse de serie de darks pour PixInsight
// ============================================================================
//
// Analyse une serie de darks FITS, calcule les statistiques cles pour chaque
// brute, identifie les outliers pour exclusion avant empilement dans WBPP.
//
// ATR585C calibration pipeline
// ============================================================================

#feature-id    Utilities > DarkFrameAnalyzer
#feature-info  Analyse de serie de darks astrophotographiques pour detection \
               d'outliers avant empilement WBPP. Calcule median, MAD, hot pixels, \
               uniformite spatiale et detecte les frames hors norme.

#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/UndoFlag.jsh>

#define VERSION "1.2.0"
#define TITLE   "Dark Frame Analyzer"
#define SCALE   65535


// ============================================================================
// CONFIGURATION PAR DEFAUT
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
// HELPERS — STATISTIQUES SUR TABLEAUX JS
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
   // MAD normalise x1.4826 (sigma-equivalent, comme mad_std d'astropy)
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
// LECTURE DES KEYWORDS FITS
// ============================================================================

function readFITSKeywordsFromWindow(window)
{
   // Lit les keywords FITS directement depuis l'ImageWindow ouverte
   // (PI les extrait deja lors de l'ouverture du fichier)
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
         // strippedValue retire les quotes des valeurs FITS string
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
      console.warningln("Erreur lecture keywords: " + e.message);
   }

   return result;
}


// ============================================================================
// ANALYSE D'UN DARK INDIVIDUEL
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

   // Ouvrir l'image
   var windows;
   try {
      windows = ImageWindow.open(filePath);
   }
   catch (e) {
      metrics.error = e.message;
      return metrics;
   }

   if (windows.length === 0) {
      metrics.error = "Impossible d'ouvrir le fichier";
      return metrics;
   }

   var window = windows[0];
   var image = window.mainView.image;

   // Lire les keywords FITS depuis la window ouverte
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

      // Si image multi-canal (CFA debayerisee ?), utiliser channel 0
      if (image.numberOfChannels > 1)
         image.selectedChannel = 0;

      // --- Statistiques de base (via le moteur C++ de PI) ---
      // Toutes les valeurs PI sont en [0,1], on convertit en ADU x65535

      metrics.min = image.minimum() * SCALE;
      metrics.max = image.maximum() * SCALE;
      metrics.mean = image.mean() * SCALE;
      metrics.median = image.median() * SCALE;
      metrics.stdDev = image.stdDev() * SCALE;

      // --- MAD robuste via avgDev ---
      // Pour une distribution gaussienne :
      //   avgDev = sigma * sqrt(2/pi) = sigma * 0.7979
      //   mad_std (sigma-equivalent) = sigma
      // Donc: mad_std = avgDev / 0.7979 = avgDev * 1.2533
      metrics.mad = image.avgDev() * SCALE * 1.2533;

      // --- Stats clippees (2 passes) ---
      // 1) On a deja median et MAD
      // 2) On clippe a median +/- 3*MAD_sigma et on recalcule mean/stdDev
      var clipLow = (metrics.median - 3.0 * metrics.mad) / SCALE;
      var clipHigh = (metrics.median + 3.0 * metrics.mad) / SCALE;
      if (clipLow < 0) clipLow = 0;
      if (clipHigh > 1) clipHigh = 1;

      image.rangeClippingEnabled = true;
      image.rangeClipLow = clipLow;
      image.rangeClipHigh = clipHigh;

      metrics.meanClip = image.mean() * SCALE;
      metrics.medianClip = image.median() * SCALE;
      metrics.stdClip = image.stdDev() * SCALE;

      // Desactiver le clipping pour les stats suivantes
      image.rangeClippingEnabled = false;

      // --- Comptage de hot pixels via histogramme ---
      // On construit un histogramme 16-bit (65536 bins) en une seule passe C++,
      // puis on somme les bins au-dessus de chaque seuil en JS (instantane)
      var histogram = computeHistogramCounts(image);

      metrics.nHot1k = sumBinsAbove(histogram, 1000);
      metrics.nHot5k = sumBinsAbove(histogram, Math.round(params.hotPixelThresholdADU));
      metrics.nHot10k = sumBinsAbove(histogram, 10000);
      metrics.nSaturated = sumBinsAbove(histogram, 65500);
      metrics.nZero = histogram[0];

      // --- Ecart de temperature ---
      if (metrics.setTemp !== null && metrics.ccdTemp !== null) {
         metrics.tempDeviation = Math.abs(metrics.ccdTemp - metrics.setTemp);
      }

      // --- Uniformite spatiale (centre + 4 coins) ---
      var ps = params.patchSize;
      var h = image.height;
      var w = image.width;

      if (h > ps * 2 && w > ps * 2) {
         // Centre
         var cx = Math.floor(w / 2 - ps / 2);
         var cy = Math.floor(h / 2 - ps / 2);
         var centreMedian = patchMedian(image, cx, cy, ps, ps);

         // 4 coins
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

   // Fermer l'image immediatement pour liberer la memoire
   window.forceClose();

   return metrics;
}


// ============================================================================
// HELPERS STATISTIQUES IMAGE
// ============================================================================

function computeHistogramCounts(image)
{
   // Construit un histogramme 16-bit (65536 bins) via la classe Histogram de PJSR
   // Retourne un tableau JS ou index = valeur ADU, valeur = nombre de pixels
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
      // Fallback: utiliser l'histogramme 16-bit de l'image
      // Si la classe Histogram n'est pas disponible sous cette forme,
      // on essaie via image.histogramLevel()
      console.warningln("Histogram API: " + e.message + " - tentative fallback...");
      try {
         // Approche alternative: lire le nombre de bins via ImageStatistics
         // et reconstituer manuellement
         for (var y = 0; y < image.height; ++y) {
            for (var x = 0; x < image.width; ++x) {
               var val = Math.round(image.sample(x, y) * 65535);
               if (val >= 0 && val < resolution)
                  counts[val]++;
            }
            // Afficher la progression tous les 100 lignes
            if (y % 500 === 0)
               processEvents();
         }
      }
      catch (e2) {
         console.warningln("Fallback histogram échoué: " + e2.message);
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

function patchMedian(image, x0, y0, w, h)
{
   image.selectedRect = new Rect(x0, y0, x0 + w, y0 + h);
   var med = image.median();
   image.resetSelections();
   return med;
}


// ============================================================================
// DETECTION D'OUTLIERS
// ============================================================================

function detectOutliers(allMetrics, params)
{
   // Filtrer les metriques valides
   var valid = [];
   for (var i = 0; i < allMetrics.length; ++i) {
      if (allMetrics[i].error === null)
         valid.push(allMetrics[i]);
   }

   if (valid.length < 3) {
      // Pas assez de donnees pour une detection statistique
      for (var i = 0; i < allMetrics.length; ++i) {
         allMetrics[i].flags = [];
         allMetrics[i].severity = (allMetrics[i].error === null) ? "ok" : "critical";
      }
      return { metrics: allMetrics, refs: null };
   }

   // References de la serie
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

   // Planchers anti-quantification (fallback si dispersion ~0)
   var effectiveMedianDisp = Math.max(refMedianMad, 1.0);
   var effectiveMadDisp = Math.max(refMadMad, 0.5);
   var effectiveHotpxDisp = Math.max(refHotpxMad, refHotpx * 0.003, 1.0);

   // Flagger chaque dark
   for (var i = 0; i < allMetrics.length; ++i) {
      var m = allMetrics[i];
      var flags = [];
      var severity = "ok";

      if (m.error !== null) {
         flags.push("erreur lecture: " + m.error);
         severity = "critical";
         m.flags = flags;
         m.severity = severity;
         continue;
      }

      // --- Check mediane (signal thermique) ---
      var medianAbsDev = Math.abs(m.medianClip - refMedian);
      var zMedian = medianAbsDev / effectiveMedianDisp;
      var zMedianMeaningful = refMedianMad > 0.5;

      if (medianAbsDev > params.medianAbsDeviationCrit) {
         flags.push("médiane très décalée (" + m.medianClip.toFixed(1) +
            " vs ref " + refMedian.toFixed(1) +
            ", d=" + medianAbsDev.toFixed(0) + " ADU)");
         severity = "critical";
      }
      else if (medianAbsDev > params.medianAbsDeviationWarn) {
         var detail = m.medianClip.toFixed(1) + " vs ref " + refMedian.toFixed(1) +
            ", d=" + medianAbsDev.toFixed(0) + " ADU";
         if (zMedianMeaningful)
            detail += ", " + zMedian.toFixed(1) + "s";
         flags.push("médiane décalée (" + detail + ")");
         if (severity !== "critical") severity = "warning";
      }
      else if (zMedian > params.outlierSigmaMedian && zMedianMeaningful) {
         flags.push("médiane statistiquement décalée (" + m.medianClip.toFixed(1) +
            " vs ref " + refMedian.toFixed(1) + ", " + zMedian.toFixed(1) + "s)");
         if (severity !== "critical") severity = "warning";
      }

      // --- Check MAD (bruit anormal) ---
      var madAbsDev = Math.abs(m.mad - refMad);
      var zMad = madAbsDev / effectiveMadDisp;
      var zMadMeaningful = refMadMad > 0.5;

      if (madAbsDev > params.madAbsDeviationWarn) {
         var detail = "MAD=" + m.mad.toFixed(1) + " vs ref " + refMad.toFixed(1) +
            ", d=" + madAbsDev.toFixed(1) + " ADU";
         if (zMadMeaningful)
            detail += ", " + zMad.toFixed(1) + "s";
         flags.push("bruit anormal (" + detail + ")");
         if (severity !== "critical") severity = "warning";
      }
      else if (zMad > params.outlierSigmaMad && zMadMeaningful) {
         flags.push("bruit anormal (MAD=" + m.mad.toFixed(1) +
            " vs ref " + refMad.toFixed(1) + ", " + zMad.toFixed(1) + "s)");
         if (severity !== "critical") severity = "warning";
      }

      // --- Check hot pixels ---
      var zHotpx = Math.abs(m.nHot5k - refHotpx) / effectiveHotpxDisp;
      if (zHotpx > params.outlierSigmaHotpx) {
         flags.push("hot pixels inhabituel(s) (" + m.nHot5k +
            " vs ref " + Math.round(refHotpx) + ", " + zHotpx.toFixed(1) + "s)");
         if (severity !== "critical") severity = "warning";
      }

      // --- Check temperature ---
      if (m.tempDeviation !== null && m.tempDeviation > params.tempDeviationMax) {
         flags.push("dérive thermique (" + m.tempDeviation.toFixed(2) + " °C)");
         severity = "critical";
      }

      // --- Check saturation massive ---
      if (m.nSaturated > params.saturatedPixelsMax) {
         flags.push("saturation massive (" + m.nSaturated + " pixels)");
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
// RAPPORT CONSOLE
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
   console.writeln("ANALYSE DE SERIE DE DARKS");
   console.writeln(sep);
   console.writeln("Fichiers    : " + allMetrics.length + " FITS analysés (" + valid.length + " lus avec succès)");

   if (valid.length > 0) {
      // Coherence de la serie
      var gains = [], offsets = [], exptimes = [], temps = [];
      for (var i = 0; i < valid.length; ++i) {
         if (valid[i].gain !== null) gains.push(valid[i].gain);
         if (valid[i].offset !== null) offsets.push(valid[i].offset);
         if (valid[i].exptime !== null) exptimes.push(valid[i].exptime);
         if (valid[i].setTemp !== null) temps.push(valid[i].setTemp);
      }

      console.writeln("");
      console.writeln("Paramètres détectés :");
      console.writeln("  Gain        : [" + uniqueValues(gains).join(", ") + "]");
      console.writeln("  Offset      : [" + uniqueValues(offsets).join(", ") + "]");
      console.writeln("  Durée       : [" + uniqueValues(exptimes).join(", ") + "] s");
      console.writeln("  SET-TEMP    : [" + uniqueValues(temps).join(", ") + "] °C");

      if (uniqueValues(gains).length > 1)
         console.warningln("  ATTENTION: plusieurs gains dans la serie");
      if (uniqueValues(offsets).length > 1)
         console.warningln("  ATTENTION: plusieurs offsets dans la serie");
      if (uniqueValues(exptimes).length > 1)
         console.warningln("  ATTENTION: plusieurs durees dans la serie");
   }

   // --- Tableau principal ---
   console.writeln("");
   console.writeln(sep);
   console.writeln("TABLEAU DES METRIQUES PAR DARK");
   console.writeln(sep);

   console.writeln(
      padRight("#", 4) +
      padRight("Fichier", 35) +
      padRight("T_ccd", 7) +
      padRight("Mediane", 9) +
      padRight("MeanClip", 10) +
      padRight("MAD", 7) +
      padRight("Hot>5k", 8) +
      padRight("Sat.", 6) +
      padRight("Etat", 10)
   );
   console.writeln(sep2);

   // Tri par date
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
         console.writeln(num + fname + " ERREUR: " + m.error);
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

   // --- Statistiques de reference ---
   if (refs !== null) {
      console.writeln("");
      console.writeln(sep);
      console.writeln("REFERENCES STATISTIQUES DE LA SERIE");
      console.writeln(sep);

      console.writeln("");
      console.writeln(
         padRight("Metrique", 25) +
         padLeft("Mediane", 12) +
         padLeft("s (MAD)", 10) +
         padLeft("Min", 10) +
         padLeft("Max", 10) +
         padLeft("Etendue", 10)
      );
      console.writeln(sep2.substring(0, 77));

      var statRows = [
         { name: "Médiane clippée (ADU)", vals: [] },
         { name: "MAD robuste (ADU)", vals: [] },
         { name: "Hot pixels > 5000", vals: [] },
         { name: "Pixels saturés", vals: [] }
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
            padRight("Température CCD (C)", 25) +
            padLeft(arrayMedian(tempsCcd).toFixed(2), 12) +
            padLeft(arrayMAD(tempsCcd).toFixed(3), 10) +
            padLeft(arrayMin(tempsCcd).toFixed(2), 10) +
            padLeft(arrayMax(tempsCcd).toFixed(2), 10) +
            padLeft((arrayMax(tempsCcd) - arrayMin(tempsCcd)).toFixed(2), 10)
         );
      }
   }

   // --- Alertes ---
   var flagged = [];
   for (var i = 0; i < allMetrics.length; ++i) {
      if (allMetrics[i].flags && allMetrics[i].flags.length > 0 && allMetrics[i].severity !== "ok")
         flagged.push(allMetrics[i]);
   }

   console.writeln("");
   console.writeln(sep);
   console.writeln("ALERTES - DARKS HORS NORME (" + flagged.length + "/" + allMetrics.length + ")");
   console.writeln(sep);

   if (flagged.length === 0) {
      console.writeln("");
      console.writeln("Aucune anomalie détectée. Série homogène et de qualité.");
   }
   else {
      // Trier par severite (critical en premier)
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

   // --- Recommandations ---
   console.writeln("");
   console.writeln(sep);
   console.writeln("RECOMMANDATIONS");
   console.writeln(sep);

   var warnings = [];
   var criticals = [];
   for (var i = 0; i < valid.length; ++i) {
      if (valid[i].severity === "warning") warnings.push(valid[i]);
      if (valid[i].severity === "critical") criticals.push(valid[i]);
   }

   if (criticals.length > 0) {
      console.warningln("");
      console.warningln(criticals.length + " dark(s) critique(s) à exclure absolument de l'empilement :");
      for (var i = 0; i < criticals.length; ++i)
         console.warningln("   - " + criticals[i].filename);
   }

   if (warnings.length > 0) {
      console.writeln("");
      console.writeln(warnings.length + " dark(s) à examiner (potentiellement à exclure) :");
      for (var i = 0; i < warnings.length; ++i)
         console.writeln("   - " + warnings[i].filename);
      console.writeln("");
      console.writeln("   -> Ces darks seront probablement bien gérés par une réjection");
      console.writeln("      Winsorized Sigma 3.0/4.0 dans WBPP, mais tu peux les exclure");
      console.writeln("      manuellement pour plus de propreté.");
   }

   if (warnings.length === 0 && criticals.length === 0) {
      console.writeln("");
      console.writeln("Série 100% homogène — prête pour empilement sans exclusion.");
   }

   var cleanCount = 0;
   for (var i = 0; i < valid.length; ++i) {
      if (valid[i].severity === "ok") cleanCount++;
   }

   console.writeln("");
   console.writeln("Pour l'empilement:");
   console.writeln("  - " + valid.length + " darks utilisables au total");
   console.writeln("  - " + cleanCount + " darks totalement propres");
   console.writeln("  - Recommandation: Winsorized Sigma Clipping 3.0/4.0 dans WBPP");
   console.writeln("  - Normalization: No normalization");
   console.writeln("  - Output: float32 FITS ou XISF");

   console.writeln("");
   console.writeln(sep);
   console.writeln("Analyse terminée — " + allMetrics.length + " fichiers traités");
   console.writeln(sep);
}


// ============================================================================
// EXPORT CSV
// ============================================================================

var CSV_SEP = ";";

function csvField(val)
{
   // Champ texte : vide si absent, quote si le contenu contient
   // le separateur, des quotes ou un retour ligne
   if (val === null || val === undefined) return "";
   var s = String(val);
   if (s.indexOf(CSV_SEP) >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0)
      s = '"' + s.replace(/"/g, '""') + '"';
   return s;
}

function csvNum(val, decimals)
{
   // Champ numerique : vide si absent, decimales avec point
   if (val === null || val === undefined) return "";
   if (decimals === 0) return String(Math.round(val));
   return val.toFixed(decimals);
}

function buildCsv(allMetrics)
{
   var header = [
      "fichier", "chemin", "date_obs", "type_image",
      "gain", "offset", "exptime_s",
      "set_temp_c", "ccd_temp_c", "derive_temp_c",
      "readout_mode", "bayer",
      "largeur", "hauteur",
      "min_adu", "max_adu", "moyenne_adu", "mediane_adu", "ecart_type_adu",
      "mad_adu", "moyenne_clip_adu", "mediane_clip_adu", "ecart_type_clip_adu",
      "hot_1k", "hot_5k", "hot_10k", "satures", "zeros",
      "mediane_centre_adu", "delta_coins_adu",
      "etat", "alertes", "erreur"
   ];

   var lines = [header.join(CSV_SEP)];

   // Meme ordre que le rapport console : tri par date d'observation
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
   // File.writeTextFile n'existe pas sur les vieilles versions de PI
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
// DIALOG LISTE D'EXCLUSION WBPP
// ============================================================================

function ExclusionDialog(parentDialog, allMetrics)
{
   this.__base__ = Dialog;
   this.__base__();

   var self = this;

   this.parentDialog = parentDialog;
   this.allMetrics = allMetrics;
   this.movedPaths = [];        // fichiers deja deplaces vers rejected/
   this.includeWarnings = false;

   this.helpLabel = new Label(this);
   this.helpLabel.text = "Liste des darks à écarter de l'empilement. " +
      "Copiez-la, exportez-la en .txt, ou déplacez les fichiers dans un " +
      "sous-répertoire 'rejected' pour que WBPP ne les voie plus.";
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = false;

   this.includeWarningsCheck = new CheckBox(this);
   this.includeWarningsCheck.text = "Inclure les alertes (par défaut : rejets seuls)";
   this.includeWarningsCheck.checked = false;
   this.includeWarningsCheck.toolTip = "Les rejets (critiques) sont toujours listés. " +
      "Cochez pour ajouter les darks en alerte (warning).";
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
   this.exportTxtButton.text = "Exporter .txt...";
   this.exportTxtButton.icon = this.scaledResource(":/icons/document-text-export.png");
   this.exportTxtButton.toolTip = "Écrire la liste (un chemin par ligne) dans un fichier texte";
   this.exportTxtButton.onClick = function() { self.exportTxt(); };

   this.moveButton = new PushButton(this);
   this.moveButton.text = "Déplacer vers rejected/...";
   this.moveButton.icon = this.scaledResource(":/icons/folder.png");
   this.moveButton.toolTip = "Déplacer les fichiers listés dans un sous-répertoire " +
      "'rejected' à côté des darks (avec confirmation)";
   this.moveButton.onClick = function() { self.moveToRejected(); };

   this.closeButton = new PushButton(this);
   this.closeButton.text = "Fermer";
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

   this.windowTitle = TITLE + " — Exclusions WBPP";
   this.adjustToContents();

   this.refreshList();
}

ExclusionDialog.prototype = new Dialog();

ExclusionDialog.prototype.excludedMetrics = function()
{
   // Rejets (critiques + erreurs de lecture) toujours, alertes sur option.
   // Les fichiers deja deplaces ne sont plus listes.
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
   this.countLabel.text = list.length + " fichier(s) à exclure" +
      (this.movedPaths.length > 0 ?
         " — " + this.movedPaths.length + " déjà déplacé(s)" : "");

   this.exportTxtButton.enabled = list.length > 0;
   this.moveButton.enabled = list.length > 0;
};

ExclusionDialog.prototype.exportTxt = function()
{
   var list = this.excludedMetrics();
   if (list.length === 0) return;

   var sfd = new SaveFileDialog();
   sfd.caption = "Exporter la liste d'exclusion";
   sfd.filters = [["Fichiers texte", "*.txt"], ["Tous les fichiers", "*"]];
   sfd.overwritePrompt = true;

   var first = list[0].filepath;
   sfd.initialPath = File.extractDrive(first) + File.extractDirectory(first) +
      "/exclusions_darks.txt";

   if (!sfd.execute()) return;

   var path = sfd.fileName;
   if (File.extractExtension(path).length === 0)
      path += ".txt";

   var paths = [];
   for (var i = 0; i < list.length; ++i)
      paths.push(list[i].filepath);

   try {
      writeTextFileCompat(path, paths.join("\n") + "\n");
      console.noteln("Liste d'exclusion exportée : " + path);
      (new MessageBox("Liste d'exclusion exportée :\n" + path,
         TITLE, StdIcon_Information, StdButton_Ok)).execute();
   }
   catch (e) {
      (new MessageBox("Échec de l'export :\n" + e.message,
         TITLE, StdIcon_Error, StdButton_Ok)).execute();
   }
};

ExclusionDialog.prototype.moveToRejected = function()
{
   var list = this.excludedMetrics();
   if (list.length === 0) return;

   var msg = "Déplacer " + list.length + " fichier(s) vers un sous-répertoire " +
      "'rejected' (créé à côté des darks) ?\n\n" +
      "Les fichiers déplacés seront retirés de la liste d'analyse.";
   var answer = (new MessageBox(msg, TITLE, StdIcon_Question,
      StdButton_Yes, StdButton_No)).execute();
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
            throw new Error("un fichier du même nom existe déjà dans rejected/");

         File.move(m.filepath, target);
         this.movedPaths.push(m.filepath);
         moved++;
         console.noteln("Déplacé : " + m.filename + " -> " + target);

         // Retirer le fichier de la liste du dialogue principal
         this.parentDialog.removeFileByPath(m.filepath);
      }
      catch (e) {
         failed.push(m.filename + " : " + e.message);
      }
   }

   this.refreshList();

   var report = moved + " fichier(s) déplacé(s) vers rejected/";
   if (failed.length > 0)
      report += "\n\nÉchecs (" + failed.length + ") :\n" + failed.join("\n");
   (new MessageBox(report, TITLE,
      failed.length > 0 ? StdIcon_Warning : StdIcon_Information,
      StdButton_Ok)).execute();
};


// ============================================================================
// DIALOG GUI
// ============================================================================

function DarkAnalyzerDialog()
{
   this.__base__ = Dialog;
   this.__base__();

   var self = this;

   // Copie des parametres courants
   this.params = {};
   for (var key in DEFAULT_PARAMS)
      this.params[key] = DEFAULT_PARAMS[key];

   // Donnees
   this.filePaths = [];
   this.allMetrics = [];
   this.refs = null;
   this.busy = false;  // analyse en cours (verrouille la GUI)

   // -----------------------------------------------------------------------
   // Titre
   // -----------------------------------------------------------------------
   this.title = TITLE + " v" + VERSION;

   this.helpLabel = new Label(this);
   this.helpLabel.text = "Ajoutez des fichiers FITS de darks, configurez les seuils, puis lancez l'analyse.";
   this.helpLabel.useRichText = false;

   // -----------------------------------------------------------------------
   // TreeBox unique (fichiers + resultats)
   // -----------------------------------------------------------------------
   this.fileTreeBox = new TreeBox(this);
   this.fileTreeBox.alternateRowColor = true;
   this.fileTreeBox.headerVisible = true;
   this.fileTreeBox.headerSorting = true;
   this.fileTreeBox.multipleSelection = true;
   this.fileTreeBox.sort(1, false);
   // La colonne 8 (cachée) contient le chemin complet du fichier :
   // c'est l'identifiant unique de chaque ligne. Les tris (auto ou via
   // en-têtes) réordonnent les lignes, donc jamais d'accès par index.
   this.fileTreeBox.numberOfColumns = 9;
   this.fileTreeBox.setHeaderText(0, "#");
   this.fileTreeBox.setHeaderText(1, "Fichier");
   this.fileTreeBox.setHeaderText(2, "Temp.");
   this.fileTreeBox.setHeaderText(3, "Médiane");
   this.fileTreeBox.setHeaderText(4, "Bruit");
   this.fileTreeBox.setHeaderText(5, "Hot px");
   this.fileTreeBox.setHeaderText(6, "Sat.");
   this.fileTreeBox.setHeaderText(7, "Etat");
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
   // Boutons fichiers
   // -----------------------------------------------------------------------
   this.addFilesButton = new PushButton(this);
   this.addFilesButton.text = "+ Darks";
   this.addFilesButton.toolTip = "Ajouter des fichiers FITS";
   this.addFilesButton.onClick = function()
   {
      var ofd = new OpenFileDialog();
      ofd.multipleSelections = true;
      ofd.caption = "Sélectionner des darks FITS";
      ofd.filters = [["FITS files", "*.fits", "*.fit", "*.FITS", "*.FIT"]];
      if (ofd.execute()) {
         for (var i = 0; i < ofd.fileNames.length; ++i)
            self.addFile(ofd.fileNames[i]);
      }
   };

   this.addDirButton = new PushButton(this);
   this.addDirButton.text = "+ Répertoire";
   this.addDirButton.toolTip = "Ajouter tous les FITS d'un répertoire";
   this.addDirButton.onClick = function()
   {
      var gdd = new GetDirectoryDialog();
      gdd.caption = "Sélectionner un répertoire de darks";
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
   this.removeButton.text = "- Supprimer";
   this.removeButton.toolTip = "Supprimer les fichiers sélectionnés";
   this.removeButton.onClick = function()
   {
      // Supprimer les lignes selectionnees (en partant de la fin).
      // On retrouve le fichier par son chemin (colonne cachee), pas par
      // l'index de ligne : apres un tri les deux ne correspondent plus.
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
   this.clearButton.text = "Tout vider";
   this.clearButton.toolTip = "Supprimer tous les fichiers";
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

   // GroupBox fichiers
   this.filesGroupBox = new GroupBox(this);
   this.filesGroupBox.title = "Darks";
   this.filesGroupBox.sizer = new VerticalSizer();
   this.filesGroupBox.sizer.margin = 6;
   this.filesGroupBox.sizer.spacing = 6;
   this.filesGroupBox.sizer.add(this.fileTreeBox);
   this.filesGroupBox.sizer.add(this.fileButtonsSizer);

   // -----------------------------------------------------------------------
   // Parametres d'analyse — par groupe de metrique
   // -----------------------------------------------------------------------

   // --- Temperature ---
   this.tempDevControl = this.createNumericControl(
      "Écart max (°C) :", 0.1, 2.0, this.params.tempDeviationMax, 2);
   this.tempHint = new Label(this);
   this.tempHint.text = "Écart toléré entre température de consigne et température capteur.";
   this.tempHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.tempGroup = new GroupBox(this);
   this.tempGroup.title = "Température";
   this.tempGroup.sizer = new VerticalSizer();
   this.tempGroup.sizer.margin = 6;
   this.tempGroup.sizer.spacing = 4;
   this.tempGroup.sizer.add(this.tempHint);
   this.tempGroup.sizer.add(this.tempDevControl);

   // --- Mediane ---
   this.sigmaMedianControl = this.createNumericControl(
      "Sensibilité (sigma) :", 0.5, 5.0, this.params.outlierSigmaMedian, 1);
   this.medDevWarnControl = this.createNumericControl(
      "Alerte (ADU) :", 10, 256, this.params.medianAbsDeviationWarn, 0);
   this.medDevCritControl = this.createNumericControl(
      "Rejet (ADU) :", 20, 512, this.params.medianAbsDeviationCrit, 0);
   this.medianHint = new Label(this);
   this.medianHint.text = "Détecte les darks dont le signal thermique diffère de la série.";
   this.medianHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.medianGroup = new GroupBox(this);
   this.medianGroup.title = "Médiane";
   this.medianGroup.sizer = new VerticalSizer();
   this.medianGroup.sizer.margin = 6;
   this.medianGroup.sizer.spacing = 4;
   this.medianGroup.sizer.add(this.medianHint);
   this.medianGroup.sizer.add(this.sigmaMedianControl);
   this.medianGroup.sizer.add(this.medDevWarnControl);
   this.medianGroup.sizer.add(this.medDevCritControl);

   // --- Bruit ---
   this.sigmaMadControl = this.createNumericControl(
      "Sensibilité (sigma) :", 0.5, 5.0, this.params.outlierSigmaMad, 1);
   this.madDevWarnControl = this.createNumericControl(
      "Alerte (ADU) :", 5, 100, this.params.madAbsDeviationWarn, 0);
   this.bruitHint = new Label(this);
   this.bruitHint.text = "Détecte un bruit de lecture anormal (MAD de l'image).";
   this.bruitHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.bruitGroup = new GroupBox(this);
   this.bruitGroup.title = "Bruit";
   this.bruitGroup.sizer = new VerticalSizer();
   this.bruitGroup.sizer.margin = 6;
   this.bruitGroup.sizer.spacing = 4;
   this.bruitGroup.sizer.add(this.bruitHint);
   this.bruitGroup.sizer.add(this.sigmaMadControl);
   this.bruitGroup.sizer.add(this.madDevWarnControl);

   // --- Hot pixels ---
   this.sigmaHotpxControl = this.createNumericControl(
      "Sensibilité (sigma) :", 0.5, 5.0, this.params.outlierSigmaHotpx, 1);
   this.hotPxThreshControl = this.createNumericControl(
      "Seuil (ADU) :", 500, 10000, this.params.hotPixelThresholdADU, 0);
   this.hotpxHint = new Label(this);
   this.hotpxHint.text = "Compte les pixels au-dessus du seuil et détecte les écarts.";
   this.hotpxHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.hotpxGroup = new GroupBox(this);
   this.hotpxGroup.title = "Hot pixels";
   this.hotpxGroup.sizer = new VerticalSizer();
   this.hotpxGroup.sizer.margin = 6;
   this.hotpxGroup.sizer.spacing = 4;
   this.hotpxGroup.sizer.add(this.hotpxHint);
   this.hotpxGroup.sizer.add(this.sigmaHotpxControl);
   this.hotpxGroup.sizer.add(this.hotPxThreshControl);

   // --- Saturation ---
   this.satPxMaxControl = this.createNumericControl(
      "Pixels saturés max :", 10, 5000, this.params.saturatedPixelsMax, 0);
   this.satHint = new Label(this);
   this.satHint.text = "Nombre max de pixels saturés accepté par dark.";
   this.satHint.styleSheet = "QLabel { color: gray; font-style: italic; }";

   this.satGroup = new GroupBox(this);
   this.satGroup.title = "Saturation";
   this.satGroup.sizer = new VerticalSizer();
   this.satGroup.sizer.margin = 6;
   this.satGroup.sizer.spacing = 4;
   this.satGroup.sizer.add(this.satHint);
   this.satGroup.sizer.add(this.satPxMaxControl);

   // --- Layout 2 colonnes ---
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
   this.paramsGroupBox.title = "Seuils de détection";
   this.paramsGroupBox.sizer = new HorizontalSizer();
   this.paramsGroupBox.sizer.margin = 6;
   this.paramsGroupBox.sizer.spacing = 8;
   this.paramsGroupBox.sizer.add(this.paramsCol1);
   this.paramsGroupBox.sizer.add(this.paramsCol2);

   // -----------------------------------------------------------------------
   // Resume
   // -----------------------------------------------------------------------
   this.summaryLabel = new Label(this);
   this.summaryLabel.text = "";
   this.summaryLabel.useRichText = true;
   this.summaryLabel.textAlignment = TextAlign_Center;
   this.summaryLabel.styleSheet = "QLabel { font-size: 14pt; }";

   // -----------------------------------------------------------------------
   // Boutons d'action
   // -----------------------------------------------------------------------
   this.analyzeButton = new PushButton(this);
   this.analyzeButton.text = "Analyser";
   this.analyzeButton.icon = this.scaledResource(":/icons/gears.png");
   this.analyzeButton.toolTip = "Lancer l'analyse de tous les darks";
   this.analyzeButton.onClick = function() { self.runAnalysis(); };

   this.exportCsvButton = new PushButton(this);
   this.exportCsvButton.text = "Exporter CSV...";
   this.exportCsvButton.icon = this.scaledResource(":/icons/document-csv.png");
   this.exportCsvButton.toolTip = "Exporter les métriques de la dernière analyse dans un fichier CSV";
   this.exportCsvButton.enabled = false;  // actif apres une analyse
   this.exportCsvButton.onClick = function() { self.exportCsv(); };

   this.exclusionsButton = new PushButton(this);
   this.exclusionsButton.text = "Exclusions WBPP...";
   this.exclusionsButton.icon = this.scaledResource(":/icons/window-export.png");
   this.exclusionsButton.toolTip = "Liste des darks à écarter de l'empilement : " +
      "export .txt ou déplacement vers un sous-répertoire rejected/";
   this.exclusionsButton.enabled = false;  // actif apres une analyse
   this.exclusionsButton.onClick = function() { self.showExclusions(); };

   this.closeButton = new PushButton(this);
   this.closeButton.text = "Fermer";
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
   // Layout principal
   // -----------------------------------------------------------------------
   this.sizer = new VerticalSizer();
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add(this.helpLabel);
   this.sizer.add(this.filesGroupBox, 100);  // stretch
   this.sizer.add(this.paramsGroupBox);
   this.sizer.add(this.summaryLabel);
   this.sizer.add(this.actionButtonsSizer);

   this.windowTitle = TITLE;
   this.setMinSize(850, 650);
   this.adjustToContents();
}

DarkAnalyzerDialog.prototype = new Dialog();


// ============================================================================
// METHODES DU DIALOG
// ============================================================================

DarkAnalyzerDialog.prototype.createNumericControl = function(label, minVal, maxVal, defaultVal, precision)
{
   var nc = new NumericControl(this);
   nc.label.text = label;
   nc.label.minWidth = 200;
   nc.setRange(minVal, maxVal);
   nc.setPrecision(precision);
   nc.setValue(defaultVal);
   return nc;
};

DarkAnalyzerDialog.prototype.addFile = function(filePath)
{
   // Eviter les doublons
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
   node.setText(8, filePath);  // identifiant unique de la ligne
   // Colonnes 2-7 restent vides jusqu'a l'analyse
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
   // Numeros cales a droite pour que le tri texte de la colonne #
   // respecte l'ordre numerique ("   2" avant "  10")
   for (var i = 0; i < this.fileTreeBox.numberOfChildren; ++i) {
      this.fileTreeBox.child(i).setText(0, padLeft(String(i + 1), 4));
   }
};

DarkAnalyzerDialog.prototype.setBusy = function(busy)
{
   // processEvents() rend la GUI reactive pendant l'analyse : on verrouille
   // tous les controles pour empecher un second run ou une modification de
   // la liste des fichiers en plein traitement.
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
      node.setText(2, "ERR");
      node.setText(7, "Erreur");
      node.setIcon(7, new Bitmap(this.scaledResource(":/bullets/bullet-ball-glass-red.png")));
      node.setToolTip(7, "Erreur: " + m.error);
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
      color = 0xFF90EE90;  // vert clair
      iconPath = ":/bullets/bullet-ball-glass-green.png";
      sortKey = "Valide";
   }
   else if (m.severity === "warning") {
      color = 0xFFFFFF66;  // jaune
      iconPath = ":/bullets/bullet-ball-glass-yellow.png";
      sortKey = "Alerte";
   }
   else {
      color = 0xFFFF6666;  // rouge
      iconPath = ":/bullets/bullet-ball-glass-red.png";
      sortKey = "Rejet";
   }

   for (var c = 0; c < 8; ++c)
      node.setBackgroundColor(c, color);

   // Icone couleur + cle de tri dans la colonne
   node.setText(7, sortKey);
   node.setIcon(7, new Bitmap(this.scaledResource(iconPath)));
   var tooltip = "";
   if (m.flags && m.flags.length > 0) {
      tooltip = m.flags.join("\n");
   }
   else {
      tooltip = "Aucune anomalie";
   }
   node.setToolTip(7, tooltip);
};

DarkAnalyzerDialog.prototype.runAnalysis = function()
{
   if (this.busy) return;

   if (this.filePaths.length === 0) {
      (new MessageBox("Aucun fichier à analyser.\nAjoutez des fichiers FITS d'abord.",
         TITLE, StdIcon_Warning, StdButton_Ok)).execute();
      return;
   }

   this.setBusy(true);
   try {
      this.doAnalysis();
   }
   finally {
      this.setBusy(false);  // toujours deverrouiller, meme en cas d'erreur
   }
};

DarkAnalyzerDialog.prototype.doAnalysis = function()
{
   // Lire les parametres de la GUI
   this.readParamsFromGUI();

   // Reinitialiser les resultats
   this.allMetrics = [];
   this.refs = null;


   // Reinitialiser l'affichage des colonnes
   for (var i = 0; i < this.fileTreeBox.numberOfChildren; ++i) {
      var node = this.fileTreeBox.child(i);
      for (var c = 2; c < 8; ++c)
         node.setText(c, "");
      for (var c = 0; c < 8; ++c)
         node.setBackgroundColor(c, 0x00000000);
   }

   console.show();
   console.writeln("");
   console.writeln("Début de l'analyse de " + this.filePaths.length + " darks...");
   console.flush();

   var startTime = Date.now();

   // Phase 1 : Analyse individuelle (mise a jour progressive du TreeBox)
   for (var i = 0; i < this.filePaths.length; ++i) {
      console.write("<end>\rAnalyse [" + (i + 1) + "/" + this.filePaths.length + "] " +
         File.extractName(this.filePaths[i]) + File.extractExtension(this.filePaths[i]));
      console.flush();

      var metrics = analyzeSingleDark(this.filePaths[i], this.params);
      this.allMetrics.push(metrics);

      // Mise a jour immediate de la ligne dans le TreeBox
      this.updateRowMetrics(metrics);
      processEvents();  // Rafraichir l'interface
   }

   console.writeln("");  // Nouvelle ligne apres la barre de progression
   var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
   console.writeln("Analyse individuelle terminée en " + elapsed + " s");

   // Phase 2 : Detection d'outliers sur l'ensemble
   var result = detectOutliers(this.allMetrics, this.params);
   this.allMetrics = result.metrics;
   this.refs = result.refs;

   // Phase 3 : Mise a jour des couleurs de severite
   var nOk = 0, nWarn = 0, nCrit = 0;
   for (var i = 0; i < this.allMetrics.length; ++i) {
      this.updateRowSeverity(this.allMetrics[i]);
      if (this.allMetrics[i].severity === "ok") nOk++;
      else if (this.allMetrics[i].severity === "warning") nWarn++;
      else nCrit++;
   }

   // Resume colore
   this.summaryLabel.text =
      "<b><span style='color: #228B22;'>" + nOk + " valide" + (nOk > 1 ? "s" : "") + "</span></b>" +
      " / " +
      "<b><span style='color: #CC8800;'>" + nWarn + " alerte" + (nWarn > 1 ? "s" : "") + "</span></b>" +
      " / " +
      "<b><span style='color: #CC0000;'>" + nCrit + " rejet" + (nCrit > 1 ? "s" : "") + "</span></b>";

   // Trier par severite (critiques en haut)
   this.fileTreeBox.sort(7, true);
   this.renumberRows();

   // Rapport console complet
   generateConsoleReport(this.allMetrics, this.refs, this.params);

   // L'export est reactive par setBusy(false) a la fin du run
   processEvents();
};

DarkAnalyzerDialog.prototype.exportCsv = function()
{
   if (this.allMetrics.length === 0) return;

   var sfd = new SaveFileDialog();
   sfd.caption = "Exporter les métriques en CSV";
   sfd.filters = [["Fichiers CSV", "*.csv"], ["Tous les fichiers", "*"]];
   sfd.overwritePrompt = true;

   // Proposer le repertoire du premier dark analyse
   var first = this.allMetrics[0].filepath;
   sfd.initialPath = File.extractDrive(first) + File.extractDirectory(first) +
      "/analyse_darks.csv";

   if (!sfd.execute()) return;

   var path = sfd.fileName;
   if (File.extractExtension(path).length === 0)
      path += ".csv";

   try {
      writeTextFileCompat(path, buildCsv(this.allMetrics));
      console.noteln("Métriques exportées : " + path);
      (new MessageBox("Métriques exportées :\n" + path,
         TITLE, StdIcon_Information, StdButton_Ok)).execute();
   }
   catch (e) {
      (new MessageBox("Échec de l'export CSV :\n" + e.message,
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
      (new MessageBox("Aucun dark à exclure — série 100% propre.",
         TITLE, StdIcon_Information, StdButton_Ok)).execute();
      return;
   }

   var dialog = new ExclusionDialog(this, this.allMetrics);
   dialog.execute();
};


// ============================================================================
// POINT D'ENTREE
// ============================================================================

function main()
{
   var dialog = new DarkAnalyzerDialog();
   dialog.execute();
}

main();
