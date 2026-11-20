"""Candidate algal-bloom and foam indicators from Sentinel-2 reflectance (pure functions).

Everything here is a *candidate* signal. Thresholds are heuristics that have not been validated
against ground truth (that is Phase 6), and several things other than blooms/foam can trigger
them; see docs/candidates.md. Outputs are named ``*_candidate`` on purpose.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi

# Band centre wavelengths (nm), Sentinel-2A: red B04, NIR B08, SWIR1 B11.
WL_RED, WL_NIR, WL_SWIR = 664.6, 832.8, 1613.7

# NDCI has no absolute bloom threshold here: on all three lakes it is 0.3-0.6 in nearly every
# month (persistently chlorophyll-rich water), so a fixed cut-off would flag everything. NDCI is
# reported as a statistic and flagged only relative to each lake's own record (candidates.py).
FAI_MAT = 0.02  # FAI above this (reflectance units): NIR bump typical of floating mats
FLOATING_MIN_FRACTION = 0.25  # share of water-core pixels over FAI_MAT to flag the month

FOAM_BRIGHTNESS_MIN = 0.20  # mean visible reflectance
FOAM_SATURATION_MAX = 0.15  # (max-min)/max over B02/B03/B04; white is near 0
FOAM_NDVI_MAX = 0.10  # exclude green vegetation
FOAM_MIN_PIXELS = 5  # 0.05 ha
FOAM_WATER_DISTANCE_PX = 3  # must be within 30 m of water
FOAM_ON_WATER_MIN = 0.6  # share of a white region that must lie on/next to water
FOAM_PX_AREA_HA = 0.01
CLOUD_BUFFER_PX = 5  # candidates within 50 m of SCL cloud/shadow/cirrus are dropped
# Real water absorbs SWIR, so its B11 reflectance is ~0.01-0.03 (all clean months seen). Pixels
# labelled water with a higher median B11 are cloud/haze-contaminated (seen: 0.057 and 0.219).
WATER_SWIR_CONTAMINATED = 0.04


def _safe_ratio(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(invalid="ignore", divide="ignore"):
        out = num / den
    out[~np.isfinite(out)] = np.nan
    return out


def ndci(b05: np.ndarray, b04: np.ndarray) -> np.ndarray:
    """Normalised Difference Chlorophyll Index (Mishra & Mishra, 2012): (B05-B04)/(B05+B04)."""
    return _safe_ratio(b05 - b04, b05 + b04)


def fai(b04: np.ndarray, b08: np.ndarray, b11: np.ndarray) -> np.ndarray:
    """Floating Algae Index (Hu, 2009): NIR minus a red-SWIR baseline interpolated to the NIR."""
    baseline = b04 + (b11 - b04) * (WL_NIR - WL_RED) / (WL_SWIR - WL_RED)
    return b08 - baseline


def ndvi(b08: np.ndarray, b04: np.ndarray) -> np.ndarray:
    return _safe_ratio(b08 - b04, b08 + b04)


def brightness_saturation(
    b02: np.ndarray, b03: np.ndarray, b04: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    stack = np.stack([b02, b03, b04])
    mx, mn = np.nanmax(stack, axis=0), np.nanmin(stack, axis=0)
    return stack.mean(axis=0), _safe_ratio(mx - mn, mx)


def water_core(water: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Water pixels one pixel in from the shore (mixed shore pixels bias the indices)."""
    return ndi.binary_erosion(water, structure=ndi.generate_binary_structure(2, 1)) & valid


def bloom_stats(
    ndci_arr: np.ndarray, fai_arr: np.ndarray, core: np.ndarray, *, min_pixels: int = 50
) -> dict:
    """NDCI/FAI statistics over water-core pixels plus the absolute floating-mat candidate flag."""
    n = int(core.sum())
    if n < min_pixels:
        return {"bloom_n_px": n, "floating_mat_candidate": None}
    nd, fa = ndci_arr[core], fai_arr[core]
    fa_frac = float(np.nanmean(fa > FAI_MAT))
    return {
        "bloom_n_px": n,
        "ndci_median": round(float(np.nanmedian(nd)), 4),
        "ndci_p90": round(float(np.nanpercentile(nd, 90)), 4),
        "fai_median": round(float(np.nanmedian(fa)), 4),
        "fai_p90": round(float(np.nanpercentile(fa, 90)), 4),
        "fai_frac": round(fa_frac, 3),
        "floating_mat_candidate": bool(fa_frac >= FLOATING_MIN_FRACTION),
    }


def foam_candidates(
    b02: np.ndarray,
    b03: np.ndarray,
    b04: np.ndarray,
    b08: np.ndarray,
    valid: np.ndarray,
    water: np.ndarray,
    lake_region: np.ndarray,
    exclude: np.ndarray | None = None,
) -> np.ndarray:
    """Bright, low-saturation, non-vegetated patches on or beside the water.

    ``exclude`` removes pixels (e.g. a buffer around masked cloud, where thin-cloud edges that
    the SCL misses look exactly like foam).

    Pixels must be valid (cloud/shadow masked via SCL), lie in ``lake_region``, within a few
    pixels of the water mask, and form patches of at least FOAM_MIN_PIXELS. Confusers: bright
    roofs and sand at the shore, dry lake bed, thin cloud missed by the SCL, sun glint.
    """
    bright, sat = brightness_saturation(b02, b03, b04)
    white = valid & (bright >= FOAM_BRIGHTNESS_MIN) & (sat <= FOAM_SATURATION_MAX)
    white &= ~(ndvi(b08, b04) > FOAM_NDVI_MAX)
    zone = ndi.binary_dilation(water, iterations=FOAM_WATER_DISTANCE_PX)

    # Foam lies on water. A white region that is mostly outside the water zone (a cloud that
    # drifts over the shore, a roof, sand) is not foam even if it touches the water edge.
    lab, n = ndi.label(white)
    if n == 0:
        return white
    total = ndi.sum(white, lab, index=np.arange(1, n + 1))
    on_water = ndi.sum(white & zone, lab, index=np.arange(1, n + 1))
    keep_regions = 1 + np.flatnonzero(on_water / np.maximum(total, 1) >= FOAM_ON_WATER_MIN)
    cand = np.isin(lab, keep_regions) & zone & lake_region
    if exclude is not None:
        cand &= ~exclude
    lab, n = ndi.label(cand)
    if n == 0:
        return cand
    sizes = ndi.sum(cand, lab, index=np.arange(1, n + 1))
    keep = 1 + np.flatnonzero(sizes >= FOAM_MIN_PIXELS)
    return np.isin(lab, keep)


def foam_summary(foam: np.ndarray, near_inlet: np.ndarray | None) -> dict:
    lab, n = ndi.label(foam)
    out = {"foam_candidate_ha": round(float(foam.sum()) * FOAM_PX_AREA_HA, 3), "foam_patches": n}
    if near_inlet is not None and n:
        touching = np.unique(lab[(lab > 0) & near_inlet])
        out["foam_near_inlet_patches"] = int((touching > 0).sum())
        out["foam_near_inlet_ha"] = round(
            float(np.isin(lab, touching[touching > 0]).sum()) * FOAM_PX_AREA_HA, 3
        )
    else:
        out["foam_near_inlet_patches"] = 0
        out["foam_near_inlet_ha"] = 0.0
    return out
