"""Sentinel-1 water mapping from VV backscatter (pure numpy functions).

Open water is smooth, so it reflects the radar beam away and appears dark in VV
(typically below about -18 dB). Wind-roughened water, floating vegetation (double-bounce)
and some smooth urban surfaces break that assumption; see docs/fusion.md.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi

NODATA = -32768.0
DB_RANGE = (-35.0, 5.0)  # histogram range used by the calibration script
# Fixed VV threshold chosen by calibration against clean optical masks (41 lake-months, 3 lakes,
# docs/radar_calibration.csv): mean IoU 0.71 at -14 dB (leave-one-out 0.71), versus 0.38 at the
# textbook -18 dB and 0.53 for per-scene Otsu. Single parameter, but chosen on the same
# lakes it is applied to, and optical is itself an unvalidated reference.
THRESHOLD_DB = -14.0


def lee_filter(power: np.ndarray, size: int = 5, enl: float = 4.4) -> np.ndarray:
    """Lee speckle filter on linear-power data (nan = no data, preserved)."""
    x = power.astype("float64")
    nan = ~np.isfinite(x)
    fill = np.nanmedian(x) if (~nan).any() else 0.0
    x = np.where(nan, fill, x)
    mean = ndi.uniform_filter(x, size)
    sq_mean = ndi.uniform_filter(x * x, size)
    var = np.maximum(sq_mean - mean * mean, 0.0)
    cu2 = 1.0 / enl
    with np.errstate(invalid="ignore", divide="ignore"):
        ci2 = var / (mean * mean)
        w = np.clip(1.0 - cu2 / ci2, 0.0, 1.0)
    w = np.where(np.isfinite(w), w, 0.0)
    out = mean + w * (x - mean)
    out[nan] = np.nan
    return out.astype("float32")


def to_db(power: np.ndarray) -> np.ndarray:
    """Linear power to dB; NODATA and non-positive values become nan."""
    p = power.astype("float64")
    p[(p == NODATA) | (p <= 0)] = np.nan
    return (10.0 * np.log10(p)).astype("float32")


@dataclass(frozen=True)
class SarResult:
    mask: np.ndarray
    valid: np.ndarray
    threshold_db: float


def classify_sar(db: np.ndarray, threshold_db: float = THRESHOLD_DB) -> SarResult:
    """Water = filtered VV (dB) below ``threshold_db``; nan pixels are invalid."""
    valid = np.isfinite(db)
    return SarResult(valid & (db < threshold_db), valid, float(threshold_db))


def majority_vote(
    masks: list[np.ndarray], valids: list[np.ndarray]
) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel majority over scenes (ties count as water). Returns (mask, any_valid)."""
    m = np.stack(masks).astype("int16")
    v = np.stack(valids).astype("int16")
    n_valid = v.sum(axis=0)
    n_water = (m * v).sum(axis=0)
    any_valid = n_valid > 0
    return any_valid & (2 * n_water >= n_valid), any_valid
