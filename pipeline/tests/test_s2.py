"""End-to-end test of windowed reading + extraction on synthetic GeoTIFFs (no network)."""

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Point

from tidemark import runner, s2, water

CRS = "EPSG:32643"
X0, Y0 = 780000.0, 1440000.0  # UTM 43N, near Bengaluru
RADIUS_M = 400.0
CENTER = (X0 + 1000.0, Y0 - 1000.0)  # lake centre, 2 km x 2 km tile


def write_tif(path, data, res):
    h, w = data.shape
    with rasterio.open(
        path, "w", driver="GTiff", height=h, width=w, count=1, dtype=data.dtype,
        crs=CRS, transform=from_origin(X0, Y0, res, res),
    ) as dst:
        dst.write(data, 1)


@pytest.fixture
def scene(tmp_path):
    n10, n20 = 200, 100
    def disc(n, res):
        xs = X0 + (np.arange(n) + 0.5) * res
        ys = Y0 - (np.arange(n) + 0.5) * res
        xx, yy = np.meshgrid(xs, ys)
        return (xx - CENTER[0]) ** 2 + (yy - CENTER[1]) ** 2 <= RADIUS_M**2

    # baseline 05.10 style DNs include a +1000 offset
    green = np.where(disc(n10, 10), 600 + 1000, 1000 + 1000).astype("uint16")
    swir = np.where(disc(n20, 20), 100 + 1000, 2500 + 1000).astype("uint16")
    scl = np.where(disc(n20, 20), 6, 4).astype("uint8")
    for name, arr, res in (("g", green, 10), ("s", swir, 20), ("c", scl, 20)):
        write_tif(tmp_path / f"{name}.tif", arr, res)
    names = (("green", "g"), ("swir", "s"), ("scl", "c"))
    return {k: str(tmp_path / f"{f}.tif") for k, f in names}


def test_window_read_and_extraction_recovers_lake_area(scene):
    lake_utm = Point(*CENTER).buffer(RADIUS_M)
    region = lake_utm.buffer(s2.BUFFER_M)
    bounds = lake_utm.buffer(s2.WINDOW_PAD_M).bounds
    win = s2.read_window(scene, bounds, "05.10")
    assert win.green.shape == win.swir.shape == win.scl.shape
    ex = s2.extract_extent(win, lake_utm, region)
    expected_ha = np.pi * RADIUS_M**2 / 10_000
    assert ex.row["threshold_method"] == "otsu"
    assert ex.row["water_area_ha"] == pytest.approx(expected_ha, rel=0.05)
    assert ex.row["water_area_ha"] + ex.row["water_area_unc_ha"] > expected_ha * 0.97
    assert ex.row["confidence"] > 0.9
    assert water.area_ha(ex.mask) == ex.row["water_area_ha"]


def test_wrong_baseline_offset_changes_result(scene):
    """Using the pre-2022 convention on offset data must not silently give the same answer."""
    lake_utm = Point(*CENTER).buffer(RADIUS_M)
    bounds = lake_utm.buffer(s2.WINDOW_PAD_M).bounds
    right = s2.read_window(scene, bounds, "05.10")
    wrong = s2.read_window(scene, bounds, "03.00")
    assert not np.allclose(right.green, wrong.green, equal_nan=True)


def test_mask_to_geojson_roundtrip_is_lonlat(scene):
    lake_utm = Point(*CENTER).buffer(RADIUS_M)
    bounds = lake_utm.buffer(s2.WINDOW_PAD_M).bounds
    win = s2.read_window(scene, bounds, "05.10")
    ex = s2.extract_extent(win, lake_utm, lake_utm.buffer(s2.BUFFER_M))
    gj = runner.mask_to_geojson(ex.mask, ex.transform, ex.crs)
    ring = gj["coordinates"][0][0] if gj["type"] == "Polygon" else gj["coordinates"][0][0][0]
    lon, lat = ring[0][:2] if isinstance(ring[0], list) else ring[:2]
    assert 77.0 < lon < 78.5 and 12.0 < lat < 14.0


def test_month_range_and_months():
    assert s2.month_range("2024-02") == "2024-02-01/2024-02-29"
    assert runner.months("2016-11", "2017-02") == ["2016-11", "2016-12", "2017-01", "2017-02"]
