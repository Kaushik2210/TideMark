import numpy as np
import pytest
import shapely
from rasterio.transform import from_origin
from shapely.geometry import Point

from tidemark import buildings
from tidemark import encroachment as enc
from tidemark.geometry import reproject


def stack(per_pixel_wet, n, shape):
    """n observations where pixel k is water in per_pixel_wet[k] of them (flat index)."""
    masks = np.zeros((n, *shape), dtype=bool)
    for k, wet in enumerate(per_pixel_wet):
        r, c = divmod(k, shape[1])
        masks[:wet, r, c] = True
    return masks, np.ones_like(masks)


def test_wet_frequency_counts_only_valid_observations():
    masks = np.array([[[True, True]], [[True, False]], [[False, True]]])
    valids = np.array([[[True, True]], [[True, True]], [[False, False]]])
    freq, n = enc.wet_frequency(masks, valids)
    assert n.tolist() == [[2, 2]]
    assert freq.tolist() == [[1.0, 0.5]]
    freq, n = enc.wet_frequency(masks[:1] & False, valids[:1] & False)
    assert n.tolist() == [[0, 0]] and np.isnan(freq).all()  # never observed: nan, not dry


def test_lost_water_requires_early_wet_recent_dry_and_enough_observations():
    shape = (1, 5)
    # pixel: 0 always wet both periods; 1 wet early/dry recent; 2 dry/dry; 3 wet early/dry recent
    # but too few recent observations; 4 dry early/wet recent
    em, ev = stack([6, 6, 0, 6, 0], 6, shape)
    rm, rv = stack([8, 0, 0, 0, 8], 8, shape)
    rv[:, 0, 3] = False
    rv[:3, 0, 3] = True  # only 3 recent observations < MIN_OBS_RECENT
    ef, en = enc.wet_frequency(em, ev)
    rf, rn = enc.wet_frequency(rm, rv)
    lost = enc.lost_water(ef, en, rf, rn, 0.25, 0.05, np.ones(shape, bool))
    assert lost.tolist() == [[False, True, False, False, False]]


def test_refilled_lake_is_not_lost_water():
    """Dry in some recent months but wet in most: a water-level swing, not a loss."""
    shape = (1, 1)
    em, ev = stack([6], 6, shape)
    rm, rv = stack([6], 8, shape)  # wet in 75% of recent observations
    ef, en = enc.wet_frequency(em, ev)
    rf, rn = enc.wet_frequency(rm, rv)
    assert not enc.lost_water(ef, en, rf, rn, 0.25, 0.05, np.ones(shape, bool)).any()


def test_lost_to_built_agreement_logic():
    lost = np.array([[1, 1, 1, 1, 0]], dtype=bool)
    wc = np.array([[1, 1, 0, 0, 1]], dtype=bool)
    bld = np.array([[1, 0, 1, 0, 1]], dtype=bool)
    r = enc.lost_to_built(lost, wc, bld)
    assert r == {"lost_ha": 0.04, "built_worldcover_ha": 0.02, "built_buildings_ha": 0.02,
                 "built_both_ha": 0.01, "built_either_ha": 0.03}


def test_sensitivity_range_brackets_central():
    shape = (1, 6)
    em, ev = stack([6] * 6, 6, shape)
    rm, rv = stack([0, 0, 0, 0, 1, 2], 8, shape)  # recent wet share 0, 0, 0, 0, 12.5%, 25%
    ef, en = enc.wet_frequency(em, ev)
    rf, rn = enc.wet_frequency(rm, rv)
    wc = np.array([[1, 1, 0, 0, 1, 1]], dtype=bool)
    bld = np.array([[1, 0, 1, 0, 0, 0]], dtype=bool)
    s = enc.sensitivity(ef, en, rf, rn, np.ones(shape, bool), wc, bld)
    assert s["central"]["lost_ha"] == 0.04  # recent_max 0.05 keeps the four never-wet pixels
    assert s["low_ha"] <= s["central"]["built_both_ha"] <= s["central"]["built_either_ha"]
    assert s["central"]["built_either_ha"] <= s["high_ha"]
    assert s["high_ha"] >= 0.04  # loosest recent threshold admits 12.5% and 25% wet pixels


def test_ring_masks_distances():
    lake = np.zeros((80, 80), dtype=bool)
    lake[35:45, 35:45] = True
    inside, near, ring = enc.ring_masks(lake, pixel_m=10.0)
    assert inside.sum() == 100
    assert near[34, 40] and near[25, 40] and not near[24, 40]  # 100 m = 10 px
    assert ring[24, 40] and ring[5, 40] and not ring[4, 40]  # 300 m = 30 px
    assert not (near & ring).any() and not (inside & (near | ring)).any()


def test_share_and_pct_helpers():
    m = np.array([[True, False], [True, True]])
    assert enc.share(m, np.ones_like(m)) == 0.75
    assert enc.share(m, np.zeros_like(m)) is None
    assert enc.pct(25.0, 100.0) == 25.0 and enc.pct(1.0, 0.0) is None


def test_building_rasterize_marks_pixels_inside_footprints():
    c = reproject(Point(77.60, 12.95), "EPSG:4326", "EPSG:32643")
    tr = from_origin(c.x - 200, c.y + 200, 10, 10)
    half = 50.0  # a 100 m square building at the centre
    box_utm = shapely.box(c.x - half, c.y - half, c.x + half, c.y + half)
    box_ll = reproject(box_utm, "EPSG:32643", "EPSG:4326")
    mask = buildings.rasterize(np.array([box_ll]), "EPSG:32643", (40, 40), tr)
    assert mask.sum() == pytest.approx(100, abs=14)  # 10 x 10 pixels, edge effects only
    assert mask[20, 20] and not mask[0, 0]
    assert not buildings.rasterize(np.array([]), "EPSG:32643", (40, 40), tr).any()
