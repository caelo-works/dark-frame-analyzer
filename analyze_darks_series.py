#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Analyse de série de darks astrophotographiques
===============================================

Scanne un répertoire contenant des FITS de darks, calcule les statistiques
clés pour chaque brute, et identifie les outliers ("hors norme") pour
exclusion éventuelle avant empilement.

Usage:
    python analyze_darks_series.py [répertoire]

Sans argument, utilise le répertoire courant.

Dépendances:
    pip install numpy astropy

Copyright (C) 2026 CaeloWorks — GPL-3.0-or-later
"""

import sys
import os
import glob
from pathlib import Path
from datetime import datetime

try:
    import numpy as np
    from astropy.io import fits
    from astropy.stats import mad_std, sigma_clipped_stats
except ImportError as e:
    print(f"ERREUR: module manquant ({e})")
    print("Installe avec: pip install numpy astropy")
    sys.exit(1)


# ============================================================================
# CONFIGURATION - Seuils d'alerte (ajustables)
# ============================================================================

# Seuils pour détection d'outliers (en nombre de sigmas par rapport à la médiane)
OUTLIER_SIGMA_MEDIAN = 3.0      # Déviation médiane
OUTLIER_SIGMA_MAD = 3.0         # Déviation MAD (bruit)
OUTLIER_SIGMA_HOTPX = 3.0       # Déviation nombre de hot pixels

# Seuils absolus
TEMP_DEVIATION_MAX = 0.5        # Écart max accepté entre SET-TEMP et CCD-TEMP (°C)
SATURATED_PIXELS_MAX = 1000     # Nombre max de pixels saturés "normaux" par dark
HOT_PIXEL_THRESHOLD = 5000      # Seuil ADU pour compter les hot pixels "chauds"

# Seuils absolus anti-quantification (fallback si MAD statistique = 0)
# Utile quand la distribution est très piquée (discrétisation ADC)
# Calibré pour un capteur 12-bit avec pas de quantification de 16 ADU :
#   - 80 ADU = 5 pas de quantification (ignorer dérives naturelles du capteur)
#   - 128 ADU = 8 pas = vraie anomalie ponctuelle
MEDIAN_ABS_DEVIATION_WARN = 80.0    # Écart en ADU pour flagger une dérive de médiane
MEDIAN_ABS_DEVIATION_CRIT = 128.0   # Écart en ADU pour flagger une dérive critique
MAD_ABS_DEVIATION_WARN = 20.0       # Écart en ADU pour flagger un bruit anormal


# ============================================================================
# UTILITAIRES DE FORMATAGE
# ============================================================================

class Colors:
    """Codes ANSI pour la console."""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'
    
    @staticmethod
    def disable_if_no_tty():
        """Désactive les couleurs si sortie non-TTY (fichier, pipe)."""
        if not sys.stdout.isatty():
            for attr in ['GREEN', 'YELLOW', 'RED', 'BLUE', 'BOLD', 'END']:
                setattr(Colors, attr, '')


def format_flag(severity):
    """Retourne un symbole coloré selon la sévérité."""
    if severity == 'ok':
        return f"{Colors.GREEN}✓{Colors.END}"
    elif severity == 'warning':
        return f"{Colors.YELLOW}⚠{Colors.END}"
    elif severity == 'critical':
        return f"{Colors.RED}✗{Colors.END}"
    return ' '


# ============================================================================
# ANALYSE D'UN DARK INDIVIDUEL
# ============================================================================

def analyze_single_dark(filepath):
    """Analyse un fichier FITS de dark et retourne un dict de métriques."""
    try:
        with fits.open(filepath, memmap=False) as hdul:
            hdr = hdul[0].header
            data = hdul[0].data.astype(np.float32)
    except Exception as e:
        return {'filepath': filepath, 'error': str(e)}
    
    # Métadonnées
    filename = os.path.basename(filepath)
    metrics = {
        'filepath': filepath,
        'filename': filename,
        'error': None,
        'gain': hdr.get('GAIN', None),
        'offset': hdr.get('OFFSET', None),
        'exptime': hdr.get('EXPTIME', hdr.get('EXPOSURE', None)),
        'set_temp': hdr.get('SET-TEMP', None),
        'ccd_temp': hdr.get('CCD-TEMP', None),
        'readout_mode': hdr.get('READOUTM', None),
        'imagetype': hdr.get('IMAGETYP', None),
        'date_obs': hdr.get('DATE-OBS', None),
        'bayerpat': hdr.get('BAYERPAT', None),
        'shape': data.shape,
    }
    
    # Détection format (normalisé ou non)
    if np.median(data) < 1:
        data = data * 65535
    
    # Statistiques globales
    metrics['min'] = float(np.min(data))
    metrics['max'] = float(np.max(data))
    metrics['mean'] = float(np.mean(data))
    metrics['median'] = float(np.median(data))
    metrics['std'] = float(np.std(data))
    metrics['mad'] = float(mad_std(data))
    
    # Stats robustes (3σ clip)
    mean_clip, median_clip, std_clip = sigma_clipped_stats(data, sigma=3.0)
    metrics['mean_clip'] = float(mean_clip)
    metrics['median_clip'] = float(median_clip)
    metrics['std_clip'] = float(std_clip)
    
    # Hot pixels
    metrics['n_hot_1k'] = int(np.sum(data > 1000))
    metrics['n_hot_5k'] = int(np.sum(data > HOT_PIXEL_THRESHOLD))
    metrics['n_hot_10k'] = int(np.sum(data > 10000))
    metrics['n_saturated'] = int(np.sum(data >= 65500))
    metrics['n_zero'] = int(np.sum(data <= 0))
    
    # Écart de température
    if metrics['set_temp'] is not None and metrics['ccd_temp'] is not None:
        try:
            metrics['temp_deviation'] = abs(float(metrics['ccd_temp']) - float(metrics['set_temp']))
        except (ValueError, TypeError):
            metrics['temp_deviation'] = None
    else:
        metrics['temp_deviation'] = None
    
    # Uniformité spatiale (rapide - 4 coins + centre, 200x200)
    h, w = data.shape
    s = 200
    try:
        centre = np.median(data[h//2-s//2:h//2+s//2, w//2-s//2:w//2+s//2])
        corners = [
            np.median(data[:s, :s]),
            np.median(data[:s, -s:]),
            np.median(data[-s:, :s]),
            np.median(data[-s:, -s:]),
        ]
        metrics['centre_median'] = float(centre)
        metrics['max_corner_delta'] = float(max(corners) - centre)
    except Exception:
        metrics['centre_median'] = None
        metrics['max_corner_delta'] = None
    
    return metrics


# ============================================================================
# DÉTECTION D'OUTLIERS
# ============================================================================

def detect_outliers(all_metrics):
    """
    Calcule les médianes de référence de la série et flagge les outliers.
    Retourne la liste enrichie d'un champ 'flags' (liste de chaînes).
    """
    # Filtrer les métriques valides
    valid = [m for m in all_metrics if m.get('error') is None]
    if len(valid) < 3:
        # Pas assez de données pour une détection statistique
        for m in all_metrics:
            m['flags'] = []
            m['severity'] = 'ok' if m.get('error') is None else 'critical'
        return all_metrics
    
    # Références de la série (valeurs centrales et dispersion)
    medians = np.array([m['median_clip'] for m in valid])
    mads = np.array([m['mad'] for m in valid])
    hotpx = np.array([m['n_hot_5k'] for m in valid])
    
    ref_median = np.median(medians)
    ref_median_mad = mad_std(medians)
    ref_mad = np.median(mads)
    ref_mad_mad = mad_std(mads)
    ref_hotpx = np.median(hotpx)
    ref_hotpx_mad = mad_std(hotpx)
    
    # Fallback: si MAD statistique est ~0 (distribution piquée par quantification ADC),
    # on utilise un petit plancher pour éviter les divisions par zéro. On n'utilise PAS
    # np.std car le std classique est tiré vers le haut par les outliers eux-mêmes
    # (effet levier), ce qui masquerait les outliers qu'on veut détecter.
    
    # Minimum effectif pour les tests : un plancher anti-zéro, pas un fallback
    effective_median_disp = max(ref_median_mad, 1.0)
    effective_mad_disp = max(ref_mad_mad, 0.5)
    effective_hotpx_disp = max(ref_hotpx_mad, ref_hotpx * 0.003, 1.0)
    
    # Flagger chaque dark
    for m in all_metrics:
        flags = []
        severity = 'ok'
        
        if m.get('error'):
            flags.append(f"erreur lecture: {m['error']}")
            severity = 'critical'
            m['flags'] = flags
            m['severity'] = severity
            continue
        
        # Check médiane (signal thermique) - test statistique ET absolu
        median_abs_dev = abs(m['median_clip'] - ref_median)
        z_median = median_abs_dev / effective_median_disp
        # Le z-score n'est significatif que si la dispersion naturelle existe
        z_median_meaningful = ref_median_mad > 0.5
        
        if median_abs_dev > MEDIAN_ABS_DEVIATION_CRIT:
            flags.append(f"médiane très décalée ({m['median_clip']:.1f} vs ref {ref_median:.1f}, Δ={median_abs_dev:.0f} ADU)")
            severity = 'critical'
        elif median_abs_dev > MEDIAN_ABS_DEVIATION_WARN:
            if z_median_meaningful:
                flags.append(f"médiane décalée ({m['median_clip']:.1f} vs ref {ref_median:.1f}, Δ={median_abs_dev:.0f} ADU, {z_median:.1f}σ)")
            else:
                flags.append(f"médiane décalée ({m['median_clip']:.1f} vs ref {ref_median:.1f}, Δ={median_abs_dev:.0f} ADU)")
            severity = 'warning' if severity != 'critical' else severity
        elif z_median > OUTLIER_SIGMA_MEDIAN and z_median_meaningful:
            # Test statistique uniquement si la série a une dispersion "naturelle"
            flags.append(f"médiane statistiquement décalée ({m['median_clip']:.1f} vs ref {ref_median:.1f}, {z_median:.1f}σ)")
            severity = 'warning' if severity != 'critical' else severity
        
        # Check MAD (bruit anormal)
        mad_abs_dev = abs(m['mad'] - ref_mad)
        z_mad = mad_abs_dev / effective_mad_disp
        z_mad_meaningful = ref_mad_mad > 0.5
        
        if mad_abs_dev > MAD_ABS_DEVIATION_WARN:
            if z_mad_meaningful:
                flags.append(f"bruit anormal (MAD={m['mad']:.1f} vs ref {ref_mad:.1f}, Δ={mad_abs_dev:.1f} ADU, {z_mad:.1f}σ)")
            else:
                flags.append(f"bruit anormal (MAD={m['mad']:.1f} vs ref {ref_mad:.1f}, Δ={mad_abs_dev:.1f} ADU)")
            severity = 'warning' if severity != 'critical' else severity
        elif z_mad > OUTLIER_SIGMA_MAD and z_mad_meaningful:
            flags.append(f"bruit anormal (MAD={m['mad']:.1f} vs ref {ref_mad:.1f}, {z_mad:.1f}σ)")
            severity = 'warning' if severity != 'critical' else severity
        
        # Check hot pixels - test statistique (toujours une dispersion naturelle)
        z_hotpx = abs(m['n_hot_5k'] - ref_hotpx) / effective_hotpx_disp
        if z_hotpx > OUTLIER_SIGMA_HOTPX:
            flags.append(f"hot pixels inhabituel ({m['n_hot_5k']} vs ref {int(ref_hotpx)}, {z_hotpx:.1f}σ)")
            severity = 'warning' if severity != 'critical' else severity
        
        # Check température
        if m['temp_deviation'] is not None and m['temp_deviation'] > TEMP_DEVIATION_MAX:
            flags.append(f"dérive thermique ({m['temp_deviation']:.2f}°C)")
            severity = 'critical'
        
        # Check saturation massive
        if m['n_saturated'] > SATURATED_PIXELS_MAX:
            flags.append(f"saturation massive ({m['n_saturated']} pixels)")
            severity = 'critical'
        
        m['flags'] = flags
        m['severity'] = severity
    
    return all_metrics, {
        'ref_median': ref_median,
        'ref_median_mad': ref_median_mad,
        'ref_mad': ref_mad,
        'ref_mad_mad': ref_mad_mad,
        'ref_hotpx': ref_hotpx,
        'ref_hotpx_mad': ref_hotpx_mad,
    }


# ============================================================================
# AFFICHAGE
# ============================================================================

def print_header_info(all_metrics, directory):
    """Affiche les infos globales de la série."""
    valid = [m for m in all_metrics if m.get('error') is None]
    
    print("=" * 100)
    print(f"ANALYSE DE SÉRIE DE DARKS")
    print("=" * 100)
    print(f"Répertoire  : {directory}")
    print(f"Fichiers    : {len(all_metrics)} FITS trouvés ({len(valid)} lus avec succès)")
    
    if not valid:
        print("Aucun fichier valide à analyser.")
        return
    
    # Cohérence de la série
    gains = set(m.get('gain') for m in valid if m.get('gain') is not None)
    offsets = set(m.get('offset') for m in valid if m.get('offset') is not None)
    exptimes = set(m.get('exptime') for m in valid if m.get('exptime') is not None)
    temps = set(m.get('set_temp') for m in valid if m.get('set_temp') is not None)
    
    print(f"\nParamètres détectés:")
    print(f"  Gain        : {sorted(gains)}")
    print(f"  Offset      : {sorted(offsets)}")
    print(f"  Durée       : {sorted(exptimes)} s")
    print(f"  SET-TEMP    : {sorted(temps)} °C")
    
    if len(gains) > 1:
        print(f"  {Colors.RED}⚠ ATTENTION: plusieurs gains dans la série{Colors.END}")
    if len(offsets) > 1:
        print(f"  {Colors.RED}⚠ ATTENTION: plusieurs offsets dans la série{Colors.END}")
    if len(exptimes) > 1:
        print(f"  {Colors.RED}⚠ ATTENTION: plusieurs durées dans la série (devrait être séparées pour empilement){Colors.END}")


def print_main_table(all_metrics, refs):
    """Affiche le tableau principal avec une ligne par dark."""
    print("\n" + "=" * 100)
    print("TABLEAU DES MÉTRIQUES PAR DARK")
    print("=" * 100)
    
    # Entête
    header = f"{'#':<4s} {'Fichier':<35s} {'T_ccd':<7s} {'Médiane':<9s} {'Mean_clip':<10s} {'MAD':<7s} {'Hot>5k':<8s} {'Sat.':<6s} {'État':<6s}"
    print(header)
    print("-" * 100)
    
    # Tri par date
    all_metrics_sorted = sorted(
        all_metrics,
        key=lambda m: m.get('date_obs') or ''
    )
    
    for i, m in enumerate(all_metrics_sorted, 1):
        if m.get('error'):
            print(f"{i:<4d} {m['filename'][:34]:<35s} ERREUR: {m['error']}")
            continue
        
        ccd_t = f"{m['ccd_temp']:.2f}" if m.get('ccd_temp') is not None else "N/A"
        
        flag_symbol = format_flag(m.get('severity', 'ok'))
        
        # Tronquer nom si trop long
        fname = m['filename']
        if len(fname) > 34:
            fname = fname[:15] + '...' + fname[-16:]
        
        row = (
            f"{i:<4d} "
            f"{fname:<35s} "
            f"{ccd_t:<7s} "
            f"{m['median']:<9.1f} "
            f"{m['mean_clip']:<10.2f} "
            f"{m['mad']:<7.1f} "
            f"{m['n_hot_5k']:<8,} "
            f"{m['n_saturated']:<6,} "
            f"{flag_symbol:<6s}"
        )
        print(row)


def print_statistics_summary(all_metrics, refs):
    """Affiche un résumé statistique de la série."""
    valid = [m for m in all_metrics if m.get('error') is None]
    if not valid or refs is None:
        return
    
    print("\n" + "=" * 100)
    print("RÉFÉRENCES STATISTIQUES DE LA SÉRIE")
    print("=" * 100)
    
    medians = [m['median_clip'] for m in valid]
    mads = [m['mad'] for m in valid]
    hotpx = [m['n_hot_5k'] for m in valid]
    sats = [m['n_saturated'] for m in valid]
    
    print(f"\n{'Métrique':<25s} {'Médiane':>12s} {'σ (MAD)':>10s} {'Min':>10s} {'Max':>10s} {'Étendue':>10s}")
    print("-" * 90)
    
    stats_list = [
        ('Median clippé (ADU)', medians),
        ('MAD robuste (ADU)', mads),
        ('Hot pixels > 5000', hotpx),
        ('Pixels saturés', sats),
    ]
    
    for name, vals in stats_list:
        vals = np.array(vals)
        print(f"{name:<25s} {np.median(vals):>12.2f} {mad_std(vals):>10.2f} {np.min(vals):>10.2f} {np.max(vals):>10.2f} {np.max(vals)-np.min(vals):>10.2f}")
    
    # Température
    temps_ccd = [m['ccd_temp'] for m in valid if m.get('ccd_temp') is not None]
    if temps_ccd:
        temps_arr = np.array([float(t) for t in temps_ccd])
        print(f"{'Température CCD (°C)':<25s} {np.median(temps_arr):>12.2f} {np.std(temps_arr):>10.3f} {np.min(temps_arr):>10.2f} {np.max(temps_arr):>10.2f} {np.max(temps_arr)-np.min(temps_arr):>10.2f}")


def print_alerts_summary(all_metrics):
    """Liste les darks flaggés avec leurs alertes détaillées."""
    flagged = [m for m in all_metrics if m.get('flags') and m.get('severity') != 'ok']
    
    print("\n" + "=" * 100)
    print(f"ALERTES - DARKS HORS NORME ({len(flagged)}/{len(all_metrics)})")
    print("=" * 100)
    
    if not flagged:
        print(f"\n{Colors.GREEN}✓ Aucune anomalie détectée. Série homogène et de qualité.{Colors.END}")
        return
    
    # Trier par sévérité (critical en premier)
    flagged_sorted = sorted(
        flagged,
        key=lambda m: (0 if m.get('severity') == 'critical' else 1, m.get('date_obs') or '')
    )
    
    for m in flagged_sorted:
        color = Colors.RED if m['severity'] == 'critical' else Colors.YELLOW
        symbol = '✗' if m['severity'] == 'critical' else '⚠'
        print(f"\n{color}{symbol} {m['filename']}{Colors.END}")
        for flag in m['flags']:
            print(f"    → {flag}")


def print_recommendations(all_metrics, refs):
    """Recommandations finales pour l'empilement."""
    valid = [m for m in all_metrics if m.get('error') is None]
    if not valid:
        return
    
    print("\n" + "=" * 100)
    print("RECOMMANDATIONS")
    print("=" * 100)
    
    warnings = [m for m in valid if m.get('severity') == 'warning']
    criticals = [m for m in valid if m.get('severity') == 'critical']
    
    if criticals:
        print(f"\n{Colors.RED}⚠ {len(criticals)} dark(s) critique(s) à exclure absolument de l'empilement :{Colors.END}")
        for m in criticals:
            print(f"   - {m['filename']}")
    
    if warnings:
        print(f"\n{Colors.YELLOW}⚠ {len(warnings)} dark(s) à examiner (potentiellement à exclure) :{Colors.END}")
        for m in warnings:
            print(f"   - {m['filename']}")
        print(f"\n   → Ces darks seront probablement bien gérés par une réjection Winsorized Sigma 3.0/3.0")
        print(f"     dans WBPP ou Siril, mais tu peux les exclure manuellement pour plus de propreté.")
    
    if not warnings and not criticals:
        print(f"\n{Colors.GREEN}✓ Série 100% homogène - prête pour empilement sans exclusion.{Colors.END}")
    
    # Suggestion d'empilement
    clean_count = len([m for m in valid if m.get('severity') == 'ok'])
    print(f"\nPour l'empilement:")
    print(f"  - {len(valid)} darks utilisables au total")
    print(f"  - {clean_count} darks totalement propres")
    print(f"  - Recommandation: Winsorized Sigma Clipping 3.0/3.0 dans WBPP ou Siril")
    print(f"  - Normalization: No normalization")
    print(f"  - Output: float32 FITS ou XISF")


# ============================================================================
# MAIN
# ============================================================================

def main():
    Colors.disable_if_no_tty()
    
    # Parse arguments
    if len(sys.argv) > 1:
        directory = sys.argv[1]
    else:
        directory = os.getcwd()
    
    directory = os.path.abspath(directory)
    if not os.path.isdir(directory):
        print(f"ERREUR: répertoire inexistant: {directory}")
        sys.exit(1)
    
    # Chercher les FITS
    patterns = ['*.fits', '*.fit', '*.FITS', '*.FIT']
    files = []
    for p in patterns:
        files.extend(glob.glob(os.path.join(directory, p)))
    files = sorted(set(files))
    
    if not files:
        print(f"Aucun fichier FITS trouvé dans {directory}")
        sys.exit(1)
    
    # Analyse de chaque fichier
    print(f"Analyse de {len(files)} fichiers...")
    all_metrics = []
    for i, f in enumerate(files, 1):
        print(f"  [{i}/{len(files)}] {os.path.basename(f)}", end='\r', flush=True)
        metrics = analyze_single_dark(f)
        all_metrics.append(metrics)
    print(" " * 80, end='\r')  # clear progress line
    
    # Détection d'outliers
    result = detect_outliers(all_metrics)
    if isinstance(result, tuple):
        all_metrics, refs = result
    else:
        all_metrics = result
        refs = None
    
    # Affichage
    print_header_info(all_metrics, directory)
    print_main_table(all_metrics, refs)
    print_statistics_summary(all_metrics, refs)
    print_alerts_summary(all_metrics)
    print_recommendations(all_metrics, refs)
    
    print("\n" + "=" * 100)
    print(f"Analyse terminée - {len(all_metrics)} fichiers traités")
    print("=" * 100)


if __name__ == '__main__':
    main()