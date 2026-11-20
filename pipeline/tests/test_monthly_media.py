import json

import numpy as np
import pandas as pd
import pytest
from rasterio.transform import from_origin
from shapely.geometry import Point

from tidemark import media, monthly, water
from tidemark.geometry import reproject

CRS = "EPSG:32643"
LAKE_LL = Point(77.60, 12.95).buffer(0.004)  # ~440 m radius


@pytest.fixture
def caches(tmp_path, monkeypatch):
    root = tmp_path / "cache"
    monkeypatch.setattr(monthly, "CACHE_ROOT", root)
    monkeypatch.setattr(monthly, "MASKS", root / "s2_masks")
    monkeypatch.setattr(monthly, "RADAR_CACHE", root / "s1_months")
    for d in ("s2_rows", "s2_masks", "s1_months"):
        (root / d).mkdir(parents=True)
    return root


def grid_and_disc():
    c = reproject(Point(77.60, 12.95), "EPSG:4326", CRS)
    tr = from_origin(c.x - 1000, c.y + 1000, 10, 10)
    yy, xx = np.mgrid[:200, :200]
    # pixel centres relative to the lake centre (metres)
    dx, dy = (xx + 0.5) * 10 - 1000, 1000 - (yy + 0.5) * 10
    lake = reproject(LAKE_LL, "EPSG:4326", CRS)
    radius = np.sqrt(lake.area / np.pi)
    return tr, (dx**2 + dy**2) <= radius**2


def save(root, kind, lake, month, mask, valid, tr):
    folder = root / ("s2_masks" if kind == "opt" else "s1_months")
    np.savez_compressed(folder / f"{lake}_{month}.npz", mask=mask, valid=valid,
                        transform=np.array(tr)[:6], crs=CRS)


def row(root, kind, lake, month, **kw):
    folder = root / ("s2_rows" if kind == "opt" else "s1_months")
    (folder / f"{lake}_{month}.json").write_text(json.dumps(
        {"lake_id": lake, "month": month, "mapped_area_ha": 60.0, **kw}), encoding="utf-8")


OPT = {"status": "ok", "confidence": 0.9, "water_area_ha": 40.0, "date": "2024-02-07"}
RAD = {"status": "ok", "n_scenes": 3, "threshold_db": -14.0}


def test_cloud_gap_month_is_fused_and_recovers_area(caches):
    tr, disc = grid_and_disc()
    valid = np.ones_like(disc)
    valid[:, 100:] = False
    save(caches, "opt", "x", "2024-02", disc & valid, valid, tr)
    save(caches, "rad", "x", "2024-02", disc, np.ones_like(disc), tr)
    row(caches, "opt", "x", "2024-02", **OPT)
    row(caches, "rad", "x", "2024-02", **RAD)
    out, feat = monthly.fuse_month("x", LAKE_LL, "2024-02")
    assert out["source"] == "fused" and out["optical_coverage"] < 0.98
    assert out["water_area_ha"] == pytest.approx(water.area_ha(disc), rel=0.06)
    assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_clean_optical_month_reports_agreement_with_radar(caches):
    tr, disc = grid_and_disc()
    save(caches, "opt", "x", "2024-03", disc, np.ones_like(disc), tr)
    save(caches, "rad", "x", "2024-03", disc, np.ones_like(disc), tr)
    row(caches, "opt", "x", "2024-03", **OPT)
    row(caches, "rad", "x", "2024-03", **RAD)
    out, _ = monthly.fuse_month("x", LAKE_LL, "2024-03")
    assert out["source"] == "optical"
    assert out["optical_radar_iou"] == pytest.approx(1.0)


def test_cloudy_month_uses_radar_and_empty_month_is_none(caches):
    tr, disc = grid_and_disc()
    save(caches, "rad", "x", "2024-04", disc, np.ones_like(disc), tr)
    row(caches, "opt", "x", "2024-04", status="too_cloudy")
    row(caches, "rad", "x", "2024-04", **RAD)
    out, _ = monthly.fuse_month("x", LAKE_LL, "2024-04")
    assert out["source"] == "radar" and out["water_area_ha"] > 0
    row(caches, "opt", "x", "2024-05", status="too_cloudy")
    row(caches, "rad", "x", "2024-05", status="no_scene")
    out, feat = monthly.fuse_month("x", LAKE_LL, "2024-05")
    assert out["source"] == "none" and feat is None


# ---- media helpers ---------------------------------------------------------------------

def test_before_after_picks_extremes_with_geometry():
    g = Point(0, 0).buffer(1)
    df = pd.DataFrame({
        "month": ["a", "b", "c", "d"],
        "area": [10.0, 50.0, 5.0, np.nan],
        "geom": [g, g, g, None],
    })
    assert media.pick_before_after(df) == (1, 2)


def test_polygon_patch_handles_holes():
    poly = Point(0, 0).buffer(2).difference(Point(0, 0).buffer(1))
    patch = media.polygon_patch(poly)
    assert len(patch.get_path().vertices) > 10


def test_label_for_missing_month():
    r = pd.DataFrame([{"month": "2020-08", "source": "none", "area": np.nan, "unc": np.nan,
                       "geom": None}]).itertuples().__next__()
    assert "no usable scene" in media.label(r)
