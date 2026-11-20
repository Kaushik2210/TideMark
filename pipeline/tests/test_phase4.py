import numpy as np
import pandas as pd
import pytest
from shapely.geometry import Point

from tidemark import indices, rainfall, waterways
from tidemark.geometry import reproject

# ---- rainfall --------------------------------------------------------------------------


def frame(values):
    return rainfall.to_frame({"daily": {"time": pd.date_range("2024-01-01", periods=len(values))
                                        .strftime("%Y-%m-%d").tolist(),
                                        "precipitation_sum": values}})


def test_rolling_sums_and_missing_values_stay_nan():
    df = frame([10, 20, 30, None, 5, 5, 5])
    assert df["roll3_mm"].iloc[2] == 60
    assert np.isnan(df["roll3_mm"].iloc[3]) and np.isnan(df["roll3_mm"].iloc[4])
    assert df["roll3_mm"].iloc[6] == 15
    assert np.isnan(df["precip_mm"].iloc[3])  # not silently zero


def test_events_merge_consecutive_days_and_report_totals():
    vals = [0] * 5 + [30, 30, 5, 0, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0]
    ev = rainfall.find_events(frame(vals), threshold_mm=40)
    assert len(ev) == 2
    first = ev.iloc[0]
    assert first.total_mm >= 65 and first.peak_3day_mm == 65
    assert ev.iloc[1].peak_3day_mm == 50


def test_no_events_in_dry_series():
    assert rainfall.find_events(frame([1.0] * 30)).empty


def test_fetch_daily_is_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(rainfall, "CACHE", tmp_path)
    calls = []

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return {"daily": {"time": ["2024-01-01"], "precipitation_sum": [1.0]}}

    monkeypatch.setattr(rainfall.requests, "get", lambda *a, **k: calls.append(1) or R())
    a = rainfall.fetch_daily(13.0, 77.7, "2024-01-01", "2024-01-01")
    b = rainfall.fetch_daily(13.0, 77.7, "2024-01-01", "2024-01-01")
    assert a == b and len(calls) == 1


# ---- indices ---------------------------------------------------------------------------


def test_ndci_and_fai_formulas():
    b04, b05 = np.array([0.04]), np.array([0.06])
    assert indices.ndci(b05, b04)[0] == pytest.approx(0.2)
    # FAI baseline interpolated between red (b04) and SWIR (b11) at the NIR wavelength
    f = indices.fai(np.array([0.04]), np.array([0.10]), np.array([0.02]))
    k = (indices.WL_NIR - indices.WL_RED) / (indices.WL_SWIR - indices.WL_RED)
    assert f[0] == pytest.approx(0.10 - (0.04 + (0.02 - 0.04) * k))


def test_floating_mat_flag_uses_fai_and_ndci_alone_never_flags():
    core = np.ones((20, 20), dtype=bool)
    mats = indices.bloom_stats(np.full((20, 20), 0.5), np.full((20, 20), 0.05), core)
    clear = indices.bloom_stats(np.full((20, 20), 0.5), np.full((20, 20), 0.0), core)
    assert mats["floating_mat_candidate"] is True
    assert clear["floating_mat_candidate"] is False  # very high NDCI alone is not a flag
    assert clear["ndci_median"] == pytest.approx(0.5)
    tiny = indices.bloom_stats(np.zeros((20, 20)), np.zeros((20, 20)), np.zeros((20, 20), bool))
    assert tiny["floating_mat_candidate"] is None  # too few pixels: no verdict


def scene():
    shape = (60, 60)
    water = np.zeros(shape, bool)
    water[10:50, 10:40] = True
    refl = {k: np.full(shape, v, "float32") for k, v in
            {"b02": 0.05, "b03": 0.06, "b04": 0.04, "b08": 0.02}.items()}
    valid = np.ones(shape, bool)
    region = np.ones(shape, bool)
    return refl, water, valid, region


def white_patch(refl, rows, cols, value=0.45):
    for k in ("b02", "b03", "b04", "b08"):
        refl[k][rows, cols] = value


def run_foam(refl, water, valid, region):
    return indices.foam_candidates(refl["b02"], refl["b03"], refl["b04"], refl["b08"],
                                   valid, water, region)


def test_white_patch_on_water_is_a_foam_candidate():
    refl, water, valid, region = scene()
    white_patch(refl, slice(20, 26), slice(20, 26))
    foam = run_foam(refl, water, valid, region)
    assert foam[20:26, 20:26].all() and foam.sum() == 36


def test_foam_rejects_cloud_far_pixels_vegetation_and_colour():
    refl, water, valid, region = scene()
    white_patch(refl, slice(20, 26), slice(20, 26))
    valid[20:26, 20:26] = False  # cloud: masked
    white_patch(refl, slice(2, 8), slice(50, 58))  # bright but > 30 m from water
    white_patch(refl, slice(40, 46), slice(12, 18))
    refl["b08"][40:46, 12:18] = 0.9  # high NIR: vegetation-like, excluded by NDVI
    for k, v in (("b02", 0.1), ("b03", 0.25), ("b04", 0.5)):  # bright but reddish soil
        refl[k][30:36, 30:36] = v
    assert not run_foam(refl, water, valid, region).any()


def test_foam_needs_minimum_patch_size_and_summary_counts_inlets():
    refl, water, valid, region = scene()
    white_patch(refl, slice(20, 22), slice(20, 22))  # 4 px: too small
    assert not run_foam(refl, water, valid, region).any()
    white_patch(refl, slice(20, 26), slice(20, 26))
    white_patch(refl, slice(40, 46), slice(30, 36))
    foam = run_foam(refl, water, valid, region)
    near = np.zeros_like(foam)
    near[18:28, 18:28] = True
    s = indices.foam_summary(foam, near)
    assert s["foam_patches"] == 2 and s["foam_near_inlet_patches"] == 1
    assert s["foam_candidate_ha"] == pytest.approx(0.72)
    assert indices.foam_summary(foam, None)["foam_near_inlet_patches"] == 0


# ---- waterways -------------------------------------------------------------------------


def osm_payload(lake_ll):
    c = reproject(lake_ll.centroid, "EPSG:4326", "EPSG:32643")
    lake_utm = reproject(lake_ll, "EPSG:4326", "EPSG:32643")
    west = Point(c.x - 3 * (lake_utm.area / 3.14159) ** 0.5, c.y)

    def ll(x, y):
        p = reproject(Point(x, y), "EPSG:32643", "EPSG:4326")
        return p.x, p.y

    far = ll(west.x, west.y)
    near = ll(c.x - (lake_utm.area / 3.14159) ** 0.5 - 10, c.y)  # 10 m outside the shore
    nodes = [
        {"type": "node", "id": 1, "lon": far[0], "lat": far[1]},
        {"type": "node", "id": 2, "lon": near[0], "lat": near[1]},
        {"type": "node", "id": 3, "lon": 77.9, "lat": 13.3},
        {"type": "node", "id": 4, "lon": 77.91, "lat": 13.31},
    ]
    ways = [
        {"type": "way", "id": 10, "nodes": [1, 2], "tags": {"waterway": "drain", "name": "K100"}},
        {"type": "way", "id": 11, "nodes": [3, 4], "tags": {"waterway": "stream"}},
        {"type": "way", "id": 12, "nodes": [1, 2], "tags": {"highway": "path"}},
    ]
    return {"elements": nodes + ways}


def test_inlet_detected_from_waterway_ending_at_lake():
    lake = Point(77.60, 12.95).buffer(0.004)
    lines = waterways.ways_to_lines(osm_payload(lake))
    assert [w["id"] for w in lines] == [10, 11]  # path excluded
    pts = waterways.inlet_points(lake, lines)
    assert len(pts) == 1  # distant stream ignored
    assert pts[0]["kind"] == "inflow" and pts[0]["name"] == "K100"


def test_waterway_flowing_out_is_labelled_outflow():
    lake = Point(77.60, 12.95).buffer(0.004)
    payload = osm_payload(lake)
    payload["elements"] = [
        {**e, "nodes": [2, 1]} if e.get("id") == 10 else e for e in payload["elements"]
    ]
    pts = waterways.inlet_points(lake, waterways.ways_to_lines(payload))
    assert pts[0]["kind"] == "outflow"


def test_foam_exclusion_mask_removes_candidates_near_cloud():
    refl, water, valid, region = scene()
    white_patch(refl, slice(20, 26), slice(20, 26))
    cloud_near = np.zeros_like(water)
    cloud_near[15:30, 15:30] = True
    foam = indices.foam_candidates(refl["b02"], refl["b03"], refl["b04"], refl["b08"],
                                   valid, water, region, exclude=cloud_near)
    assert not foam.any()


def test_swir_contamination_threshold_separates_seen_clean_and_hazy_months():
    clean = [0.007, 0.009, 0.012, 0.018, 0.026]  # B11 over water in clean months
    hazy = [0.057, 0.219]  # seen over haze/cloud-contaminated "water"
    assert all(v <= indices.WATER_SWIR_CONTAMINATED for v in clean)
    assert all(v > indices.WATER_SWIR_CONTAMINATED for v in hazy)


def test_white_region_mostly_on_land_is_not_foam_even_when_it_touches_water():
    refl, water, valid, region = scene()
    # a big white blob (cloud/roof) straddling the shore: 4 columns over water, 30 over land
    white_patch(refl, slice(20, 30), slice(36, 70 - 30 + 34))
    foam = run_foam(refl, water, valid, region)
    assert not foam.any()


def test_white_patch_fully_on_water_is_still_foam_with_land_blob_elsewhere():
    refl, water, valid, region = scene()
    white_patch(refl, slice(20, 26), slice(20, 26))  # on water
    white_patch(refl, slice(2, 10), slice(42, 58))  # separate blob on land, far from water
    foam = run_foam(refl, water, valid, region)
    assert foam[20:26, 20:26].all() and not foam[2:10, 42:58].any()
