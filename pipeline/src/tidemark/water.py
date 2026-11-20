"""Optical water extent from Sentinel-2 L2A: MNDWI + per-scene Otsu + SCL masking.

Everything here is a pure function over small numpy arrays so it can be unit-tested on
synthetic rasters. Thresholds that have not been validated are named parameters, not magic
numbers (see VALIDATION.md for how they performed).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi

# Scene Classification Layer classes treated as unusable:
# 0 no data, 1 saturated/defective, 3 cloud shadow, 8/9 cloud (medium/high prob.),
# 10 thin cirrus, 11 snow/ice. Classes 2 (dark area) and 7 (unclassified) are kept because
# shaded or turbid water often lands there; this is a documented trade-off.
INVALID_SCL = (0, 1, 3, 8, 9, 10, 11)
CLOUD_SCL = (3, 8, 9, 10)
PIXEL_AREA_M2 = 100.0  # 10 m x 10 m


def baseline_offset(processing_baseline: str) -> float:
    """BOA reflectance offset in DN for an ESA processing baseline string like '04.00'.

    From processing baseline 04.00 onward, DN = reflectance * 10000 + 1000.
    """
    major = int(str(processing_baseline).split(".")[0])
    return 1000.0 if major >= 4 else 0.0


def dn_to_reflectance(dn: np.ndarray, processing_baseline: str) -> np.ndarray:
    """Convert L2A digital numbers to surface reflectance (nan where DN == 0 / no data)."""
    dn = dn.astype("float32")
    refl = (dn - baseline_offset(processing_baseline)) / 10000.0
    refl[dn == 0] = np.nan
    return np.clip(refl, 0.0, None)


def mndwi(green: np.ndarray, swir: np.ndarray) -> np.ndarray:
    """Modified NDWI = (G - SWIR1) / (G + SWIR1); nan where undefined."""
    with np.errstate(invalid="ignore", divide="ignore"):
        out = (green - swir) / (green + swir)
    out[~np.isfinite(out)] = np.nan
    return out


def valid_mask(scl: np.ndarray) -> np.ndarray:
    return ~np.isin(scl, INVALID_SCL)


def otsu_threshold(
    values: np.ndarray, nbins: int = 256, value_range: tuple[float, float] = (-1.0, 1.0)
) -> tuple[float, float]:
    """Otsu threshold on values within ``value_range`` (default [-1, 1], for MNDWI).

    Returns (threshold, separability) where separability is the between-class variance
    divided by total variance (0..1; high means clearly bimodal, low means one class
    dominates and the threshold is unreliable).
    """
    v = values[np.isfinite(values)]
    if v.size < 2:
        return float("nan"), 0.0
    hist, edges = np.histogram(v, bins=nbins, range=value_range)
    centers = (edges[:-1] + edges[1:]) / 2
    w = hist.astype("float64")
    total = w.sum()
    w0 = np.cumsum(w)
    w1 = total - w0
    m = np.cumsum(w * centers)
    mt = m[-1]
    with np.errstate(invalid="ignore", divide="ignore"):
        mu0 = m / w0
        mu1 = (mt - m) / w1
        between = w0 * w1 * (mu0 - mu1) ** 2 / total**2
    between[~np.isfinite(between)] = 0.0
    best = between.max()
    # Between two well-separated clusters the criterion is flat across the gap; argmax would
    # pick the gap's first bin (touching one cluster), so take the middle of the plateau.
    plateau = np.flatnonzero(between >= best * (1 - 1e-9))
    thr = float((centers[plateau[0]] + centers[plateau[-1]]) / 2)
    var_total = float(np.sum(w * (centers - mt / total) ** 2) / total)
    sep = float(best / var_total) if var_total > 0 else 0.0
    return thr, sep


@dataclass(frozen=True)
class WaterResult:
    mask: np.ndarray  # bool, water pixels (cleaned)
    threshold: float
    method: str  # "otsu" or "fallback_<reason>"
    separability: float
    valid_fraction: float  # of the evaluated area
    n_valid: int


def classify_water(
    index: np.ndarray,
    valid: np.ndarray,
    *,
    fallback_threshold: float = 0.0,
    min_separability: float = 0.6,
    min_valid_pixels: int = 200,
    plausible_range: tuple[float, float] = (-0.15, 0.35),
) -> WaterResult:
    """Threshold MNDWI over valid pixels with a per-scene Otsu threshold.

    Otsu always finds *a* split, even in a scene with no water (it then splits vegetation
    classes). So the Otsu threshold is only accepted if it is bimodal enough AND falls in
    ``plausible_range`` for a water/land boundary; otherwise ``fallback_threshold`` is used
    and ``method`` says why (``fallback_sparse`` / ``fallback_bimodality`` /
    ``fallback_range``). The range is a heuristic chosen after inspecting real scenes
    (see VALIDATION.md), not a validated constant.
    """
    ok = valid & np.isfinite(index)
    n_valid = int(ok.sum())
    frac = n_valid / index.size if index.size else 0.0
    thr, sep = otsu_threshold(index[ok]) if n_valid >= 2 else (float("nan"), 0.0)
    if n_valid < min_valid_pixels or not np.isfinite(thr):
        method = "fallback_sparse"
    elif sep < min_separability:
        method = "fallback_bimodality"
    elif not plausible_range[0] <= thr <= plausible_range[1]:
        method = "fallback_range"
    else:
        method = "otsu"
    if method != "otsu":
        thr = fallback_threshold
    mask = ok & (index > thr)
    return WaterResult(mask, float(thr), method, float(sep), float(frac), n_valid)


def clean_mask(mask: np.ndarray, *, min_pixels: int = 20, max_hole_pixels: int = 20) -> np.ndarray:
    """Morphological cleanup: open (remove speckle), drop tiny blobs, fill tiny holes."""
    cross = ndi.generate_binary_structure(2, 1)
    out = ndi.binary_opening(mask, structure=cross)
    lab, n = ndi.label(out)
    if n:
        sizes = ndi.sum(out, lab, index=np.arange(1, n + 1))
        small = np.isin(lab, 1 + np.flatnonzero(sizes < min_pixels))
        out = out & ~small
    holes = ndi.binary_fill_holes(out) & ~out
    lab, n = ndi.label(holes)
    if n:
        sizes = ndi.sum(holes, lab, index=np.arange(1, n + 1))
        out = out | np.isin(lab, 1 + np.flatnonzero(sizes <= max_hole_pixels))
    return out


def lake_component(mask: np.ndarray, lake: np.ndarray, region: np.ndarray) -> np.ndarray:
    """Keep water inside ``region`` (buffered lake) in components that touch ``lake``.

    ``lake`` and ``region`` are boolean rasters on the same grid; region should contain lake.
    """
    m = mask & region
    lab, n = ndi.label(m)
    if n == 0:
        return m
    touching = np.unique(lab[(lab > 0) & lake])
    return np.isin(lab, touching[touching > 0])


def area_ha(mask: np.ndarray) -> float:
    return float(mask.sum()) * PIXEL_AREA_M2 / 10_000.0


def edge_pixels(mask: np.ndarray) -> int:
    """Number of water pixels that touch a non-water pixel (4-connectivity)."""
    eroded = ndi.binary_erosion(mask, structure=ndi.generate_binary_structure(2, 1))
    return int((mask & ~eroded).sum())


def area_uncertainty_ha(mask: np.ndarray) -> float:
    """Heuristic +/- area: half a pixel of positional error along the water edge.

    This is a simple geometric bound, not a validated confidence interval.
    """
    return 0.5 * edge_pixels(mask) * PIXEL_AREA_M2 / 10_000.0


def cloud_fraction(scl: np.ndarray, region: np.ndarray) -> float:
    """Fraction of ``region`` pixels that are cloud/shadow/cirrus or no-data."""
    n = int(region.sum())
    if n == 0:
        return 1.0
    bad = np.isin(scl, INVALID_SCL) & region
    return float(bad.sum()) / n
