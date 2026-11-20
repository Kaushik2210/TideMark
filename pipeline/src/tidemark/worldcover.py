"""ESA WorldCover land cover (Planetary Computer ``esa-worldcover``, CC BY 4.0).

2020 is product v100 and 2021 is v200, made with different algorithm versions, so the two years
are NOT comparable as a change signal (ESA says so); use each year as a one-off snapshot.
"""

from __future__ import annotations

import numpy as np
import rasterio
from rasterio import windows
from rasterio.warp import Resampling, reproject, transform_bounds

COLLECTION = "esa-worldcover"
CLASSES = {10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up",
           60: "bare / sparse vegetation", 70: "snow and ice", 80: "permanent water bodies",
           90: "herbaceous wetland", 95: "mangroves", 100: "moss and lichen"}
BUILT_UP = 50
VERSIONS = {2020: "v100", 2021: "v200"}


def find_map_href(client, year: int, bbox_ll: tuple[float, float, float, float]) -> str:
    """Signed href of the WorldCover map tile covering ``bbox_ll`` for ``year``."""
    items = list(client.search(collections=[COLLECTION], bbox=bbox_ll,
                               datetime=f"{year}-01-01/{year}-12-31").items())
    if not items:
        raise LookupError(f"no WorldCover {year} tile for {bbox_ll}")
    return items[0].assets["map"].href


def read_to_grid(href: str, dst_transform, dst_shape: tuple[int, int], dst_crs: str) -> np.ndarray:
    """Class map resampled (nearest) onto a destination grid; 0 = no data."""
    h, w = dst_shape
    left, top = dst_transform * (0, 0)
    right, bottom = dst_transform * (w, h)
    west, south, east, north = transform_bounds(dst_crs, "EPSG:4326", left, bottom, right, top)
    pad = 0.001
    with rasterio.open(href) as src:
        win = windows.from_bounds(west - pad, south - pad, east + pad, north + pad,
                                  transform=src.transform)
        win = win.round_offsets().round_lengths()
        data = src.read(1, window=win, boundless=True, fill_value=0)
        src_transform = windows.transform(win, src.transform)
        out = np.zeros(dst_shape, dtype="uint8")
        reproject(data, out, src_transform=src_transform, src_crs=src.crs,
                  dst_transform=dst_transform, dst_crs=dst_crs, resampling=Resampling.nearest)
    return out


def class_fractions(classes: np.ndarray, region: np.ndarray) -> dict[str, float]:
    """Share of valid (non-zero) pixels in ``region`` per class name."""
    vals = classes[region & (classes > 0)]
    if vals.size == 0:
        return {}
    uniq, counts = np.unique(vals, return_counts=True)
    return {CLASSES.get(int(u), str(int(u))): round(float(c) / vals.size, 3)
            for u, c in zip(uniq, counts, strict=True)}
