"""Fuse optical (Sentinel-2) and radar (Sentinel-1) water masks into one monthly extent.

Rule (documented in docs/fusion.md):
  * optical-valid pixels take the optical answer (optical is the better-characterised sensor);
  * pixels hidden by cloud are filled from radar where radar is valid;
  * if optical covers almost the whole lake region the month is labelled "optical";
    if it covers little or none, "radar"; otherwise "fused".
Pixels with neither sensor stay unknown and are excluded from the area.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from rasterio.warp import Resampling, reproject

OPTICAL_ONLY_COVERAGE = 0.98  # region fraction optical must cover to call the month "optical"
RADAR_ONLY_COVERAGE = 0.5  # below this optical coverage the month is "radar"


def align_mask(
    mask: np.ndarray, src_transform, dst_transform, dst_shape: tuple[int, int], crs: str
) -> np.ndarray:
    """Resample a boolean mask onto another grid (nearest). Identity if already aligned."""
    if src_transform == dst_transform and mask.shape == tuple(dst_shape):
        return mask
    out = np.zeros(dst_shape, dtype="uint8")
    reproject(
        mask.astype("uint8"),
        out,
        src_transform=src_transform,
        src_crs=crs,
        dst_transform=dst_transform,
        dst_crs=crs,
        resampling=Resampling.nearest,
    )
    return out.astype(bool)


def iou(a: np.ndarray, b: np.ndarray, where: np.ndarray) -> float:
    """Intersection over union of two masks restricted to ``where``; nan if both empty."""
    a, b = a & where, b & where
    union = (a | b).sum()
    return float((a & b).sum() / union) if union else float("nan")


@dataclass(frozen=True)
class Fused:
    mask: np.ndarray
    known: np.ndarray  # pixels with an answer from at least one sensor
    source: str  # "optical" | "fused" | "radar"
    optical_coverage: float  # fraction of region with valid optical pixels
    known_fraction: float  # fraction of region with any answer


def fuse(
    optical_mask: np.ndarray | None,
    optical_valid: np.ndarray | None,
    radar_mask: np.ndarray | None,
    radar_valid: np.ndarray | None,
    region: np.ndarray,
) -> Fused:
    """Fuse masks that are already on the same grid. Either sensor may be None."""
    n = max(int(region.sum()), 1)
    zeros = np.zeros(region.shape, dtype=bool)
    om, ov = (optical_mask, optical_valid) if optical_mask is not None else (zeros, zeros)
    rm, rv = (radar_mask, radar_valid) if radar_mask is not None else (zeros, zeros)
    ov = ov & region
    rv = rv & region
    coverage = float(ov.sum()) / n

    mask = np.where(ov, om, rm & rv)
    known = ov | rv
    if optical_mask is not None and coverage >= OPTICAL_ONLY_COVERAGE:
        source = "optical"
    elif optical_mask is None or coverage < RADAR_ONLY_COVERAGE:
        source = "radar"
        mask, known = rm & rv, rv
    else:
        source = "fused"
    return Fused(mask & known, known, source, coverage, float(known.sum()) / n)
