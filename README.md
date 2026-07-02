# Dark Frame Analyzer

Outil d'analyse de séries de darks astrophotographiques : calcule les
statistiques clés de chaque brute (médiane clippée, MAD robuste, hot pixels,
saturation, dérive thermique) et identifie les frames hors norme à exclure
avant empilement dans WBPP.

Calibré pour un capteur type IMX585 (ATR585C), mais les seuils sont
ajustables pour tout capteur.

## Contenu

| Fichier | Description |
|---|---|
| `DarkFrameAnalyzer.js` | Script PixInsight (PJSR) avec interface graphique — version principale |
| `analyze_darks_series.py` | Implémentation de référence en Python (CLI), nécessite `numpy` + `astropy` |

## Script PixInsight

Installation : `Script > Feature Scripts...` et ajouter le répertoire contenant
`DarkFrameAnalyzer.js`, ou exécution directe via `Script > Execute Script File...`.

Le script apparaît ensuite dans `Script > Utilities > DarkFrameAnalyzer`.

Fonctionnement :

1. Ajouter les fichiers FITS (fichiers individuels ou répertoire complet)
2. Ajuster les seuils de détection si besoin
3. Lancer l'analyse — chaque dark est classé **Valide** / **Alerte** / **Rejet**
4. Un rapport détaillé est écrit dans la console de PixInsight

## Métriques et détection d'outliers

Pour chaque dark :

- **Médiane clippée** (signal thermique) — comparée à la référence de la série,
  avec seuils absolus (ADU) et statistique (sigma)
- **MAD robuste** (bruit) — équivalent sigma, normalisé ×1.4826 comme
  `mad_std` d'astropy
- **Hot pixels** — comptage au-dessus d'un seuil ADU configurable
- **Saturation** — nombre de pixels ≥ 65500 ADU
- **Dérive thermique** — écart entre `SET-TEMP` et `CCD-TEMP`
- **Uniformité spatiale** — médiane du centre vs 4 coins

La détection d'outliers utilise des statistiques robustes (médiane + MAD de la
série) avec des planchers anti-quantification pour les capteurs dont la
distribution est piquée par la discrétisation ADC.

## Script Python (référence)

```bash
pip install numpy astropy
python analyze_darks_series.py /chemin/vers/les/darks
```
