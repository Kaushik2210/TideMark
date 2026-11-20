"""Sentinel-2 L2A access via Planetary Computer: scene search, windowed reads, extraction."""

from __future__ import annotations

import calendar
import os
from dataclasses import dataclass

import numpy as np
import rasterio
from rasterio import features, windows
from rasterio.enums import Resampling
from shapely.geometry.base import BaseGeometry

from . import water
from .geometry import reproject

CATALOG_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"
ASSETS = {"green": "B03", "swir": "B11", "scl": "SCL"}
BUFFER_M = 100.0  # region around the OSM outline in which water is attributed to the lake
WINDOW_PAD_M = 300.0  # extra margin read around the outline (for the Otsu sample)

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.tiff")


@dataclass
class Window:
    green: np.ndarray  # reflectance
    swir: np.ndarray
    scl: np.ndarray
    transform: rasterio.Affine
    crs: str


def open_catalog():
    import planetary_computer
    from pystac_client import Client

    return Client.open(CATALOG_URL, modifier=planetary_computer.sign_inplace)


def month_range(month: str) -> str:
    y, m = (int(p) for p in month.split("-"))
    return f"{y:04d}-{m:02d}-01/{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


def search_month(client, lake_geom_ll: BaseGeometry, month: str):
    """Items intersecting the lake in a month, least scene-level cloud first.

    No scene-level cloud filter: a month whose scenes are all overcast must be reported as
    "too_cloudy", not "no_scene".
    """
    search = client.search(
        collections=[COLLECTION],
        intersects=lake_geom_ll.__geo_interface__,
        datetime=month_range(month),
    )
    return sorted(search.items(), key=lambda it: it.properties.get("eo:cloud_cover", 100))


def read_window(hrefs: dict[str, str], bounds_utm: tuple, baseline: str) -> Window:
    """Read green (10 m), SWIR and SCL (20 m, resampled to 10 m) over ``bounds_utm``."""
    with rasterio.open(hrefs["green"]) as g:
        win = windows.from_bounds(*bounds_utm, transform=g.transform)
        win = win.round_offsets().round_lengths()
        win = win.intersection(windows.Window(0, 0, g.width, g.height))
        shape = (int(win.height), int(win.width))
        green_dn = g.read(1, window=win)
        transform = windows.transform(win, g.transform)
        crs = g.crs.to_string()
        win_bounds = windows.bounds(win, g.transform)

    def read_other(href: str, resampling: Resampling) -> np.ndarray:
        with rasterio.open(href) as src:
            w = windows.from_bounds(*win_bounds, transform=src.transform)
            return src.read(1, window=w, out_shape=shape, resampling=resampling, boundless=True)

    swir_dn = read_other(hrefs["swir"], Resampling.bilinear)
    scl = read_other(hrefs["scl"], Resampling.nearest).astype("uint8")
    return Window(
        green=water.dn_to_reflectance(green_dn, baseline),
        swir=water.dn_to_reflectance(swir_dn, baseline),
        scl=scl,
        transform=transform,
        crs=crs,
    )


def rasterize(geom_utm: BaseGeometry, shape, transform) -> np.ndarray:
    return features.rasterize(
        [(geom_utm, 1)], out_shape=shape, transform=transform, fill=0, dtype="uint8"
    ).astype(bool)


def lake_masks(lake_ll: BaseGeometry, crs: str):
    """(lake polygon, buffered region, read bounds) in the raster CRS."""
    lake = reproject(lake_ll, "EPSG:4326", crs)
    region = lake.buffer(BUFFER_M)
    bounds = lake.buffer(WINDOW_PAD_M).bounds
    return lake, region, bounds


@dataclass
class Extraction:
    mask: np.ndarray
    valid: np.ndarray  # pixels with a usable optical observation (not cloud/shadow/no-data)
    transform: rasterio.Affine
    crs: str
    row: dict


def extract_extent(win: Window, lake_utm: BaseGeometry, region_utm: BaseGeometry) -> Extraction:
    """Water extent for one lake from an already-read window (pure given the inputs)."""
    shape = win.scl.shape
    lake_r = rasterize(lake_utm, shape, win.transform)
    region_r = rasterize(region_utm, shape, win.transform)
    index = water.mndwi(win.green, win.swir)
    res = water.classify_water(index, water.valid_mask(win.scl))
    cleaned = water.clean_mask(res.mask)
    mask = water.lake_component(cleaned, lake_r, region_r)
    area = water.area_ha(mask)
    unc = water.area_uncertainty_ha(mask)
    bad = water.cloud_fraction(win.scl, region_r)
    scl_water = float(((win.scl == 6) & region_r).sum()) * water.PIXEL_AREA_M2 / 10_000.0
    conf = (1.0 - bad) * (1.0 if res.method == "otsu" else 0.5)
    conf *= min(1.0, res.separability / 0.8)
    row = {
        "water_area_ha": round(area, 3),
        "water_area_unc_ha": round(unc, 3),
        "threshold": round(res.threshold, 4),
        "threshold_method": res.method,
        "separability": round(res.separability, 3),
        "region_bad_fraction": round(bad, 3),
        "scl_water_ha": round(scl_water, 3),  # Sen2Cor water class, a diagnostic cross-check
        "confidence": round(float(conf), 3),
        "source": "optical",
    }
    return Extraction(mask, water.valid_mask(win.scl), win.transform, win.crs, row)


def read_bands(
    hrefs: dict[str, str], bounds_utm: tuple, baseline: str, ref: str = "B03"
) -> tuple[dict[str, np.ndarray], np.ndarray, rasterio.Affine, str]:
    """Read several reflectance bands plus SCL on the 10 m grid of ``ref``.

    Uses the same window logic as ``read_window`` so the grid matches masks saved by the
    water-extent run. ``hrefs`` maps band names (e.g. "B02") and "SCL" to asset URLs.
    Returns (reflectance by band, scl, transform, crs).
    """
    with rasterio.open(hrefs[ref]) as g:
        win = windows.from_bounds(*bounds_utm, transform=g.transform)
        win = win.round_offsets().round_lengths()
        win = win.intersection(windows.Window(0, 0, g.width, g.height))
        shape = (int(win.height), int(win.width))
        transform = windows.transform(win, g.transform)
        crs = g.crs.to_string()
        win_bounds = windows.bounds(win, g.transform)
        ref_dn = g.read(1, window=win)

    def read_other(href: str, resampling: Resampling) -> np.ndarray:
        with rasterio.open(href) as src:
            w = windows.from_bounds(*win_bounds, transform=src.transform)
            return src.read(1, window=w, out_shape=shape, resampling=resampling, boundless=True)

    refl = {ref: water.dn_to_reflectance(ref_dn, baseline)}
    for name, href in hrefs.items():
        if name in (ref, "SCL"):
            continue
        refl[name] = water.dn_to_reflectance(read_other(href, Resampling.bilinear), baseline)
    scl = read_other(hrefs["SCL"], Resampling.nearest).astype("uint8")
    return refl, scl, transform, crs
