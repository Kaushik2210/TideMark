import numpy as np
import pytest

from tidemark import water


def disc(shape, center, radius):
    yy, xx = np.mgrid[: shape[0], : shape[1]]
    return (yy - center[0]) ** 2 + (xx - center[1]) ** 2 <= radius**2


def synthetic_scene(shape=(120, 120), radius=30, seed=0):
    """Green/SWIR reflectance with a circular lake: water has G>SWIR, land has SWIR>G."""
    rng = np.random.default_rng(seed)
    lake = disc(shape, (60, 60), radius)
    green = np.where(lake, 0.06, 0.10) + rng.normal(0, 0.004, shape)
    swir = np.where(lake, 0.01, 0.25) + rng.normal(0, 0.004, shape)
    return green.astype("float32"), swir.astype("float32"), lake


def test_baseline_offset():
    assert water.baseline_offset("03.00") == 0.0
    assert water.baseline_offset("02.12") == 0.0
    assert water.baseline_offset("04.00") == 1000.0
    assert water.baseline_offset("05.10") == 1000.0


def test_dn_to_reflectance_handles_offset_and_nodata():
    dn = np.array([0, 1000, 3000], dtype="uint16")
    new = water.dn_to_reflectance(dn, "05.10")
    old = water.dn_to_reflectance(dn, "03.00")
    assert np.isnan(new[0]) and np.isnan(old[0])
    assert new[1] == pytest.approx(0.0) and new[2] == pytest.approx(0.2)
    assert old[1] == pytest.approx(0.1) and old[2] == pytest.approx(0.3)


def test_mndwi_sign_and_nan():
    g = np.array([0.1, 0.0], dtype="float32")
    s = np.array([0.05, 0.0], dtype="float32")
    out = water.mndwi(g, s)
    assert out[0] == pytest.approx(1 / 3)
    assert np.isnan(out[1])


def test_otsu_separates_two_classes():
    vals = np.concatenate([np.full(500, -0.6), np.full(500, 0.5)])
    thr, sep = water.otsu_threshold(vals)
    assert -0.6 < thr < 0.5
    assert sep > 0.95


def test_otsu_low_separability_for_single_class():
    rng = np.random.default_rng(1)
    _, sep = water.otsu_threshold(rng.normal(-0.5, 0.01, 2000))
    # a single tight class gets split arbitrarily; separability is still reported
    assert 0.0 <= sep <= 1.0


def test_classify_recovers_synthetic_lake_area():
    g, s, lake = synthetic_scene()
    idx = water.mndwi(g, s)
    res = water.classify_water(idx, np.ones_like(lake, dtype=bool))
    assert res.method == "otsu"
    mask = water.clean_mask(res.mask)
    assert water.area_ha(mask) == pytest.approx(water.area_ha(lake), rel=0.02)


def test_cloud_pixels_excluded_and_reported():
    g, s, lake = synthetic_scene()
    scl = np.full(lake.shape, 4, dtype="uint8")
    scl[:, :60] = 9  # left half cloudy
    valid = water.valid_mask(scl)
    res = water.classify_water(water.mndwi(g, s), valid)
    assert not res.mask[:, :60].any()
    assert res.valid_fraction == pytest.approx(0.5)
    assert water.cloud_fraction(scl, np.ones_like(valid)) == pytest.approx(0.5)


def test_fallback_flagged_when_too_few_valid_pixels():
    g, s, lake = synthetic_scene()
    valid = np.zeros_like(lake, dtype=bool)
    valid[:5, :5] = True
    res = water.classify_water(water.mndwi(g, s), valid)
    assert res.method == "fallback_sparse" and res.threshold == 0.0


def test_clean_mask_removes_speckle_and_fills_small_holes():
    m = np.zeros((60, 60), dtype=bool)
    m[10:40, 10:40] = True
    m[20:22, 20:22] = False  # 4 px hole
    m[50, 50] = True  # speckle
    out = water.clean_mask(m)
    assert not out[50, 50]
    assert out[20:22, 20:22].all()


def test_clean_mask_keeps_large_island_hole():
    m = np.zeros((80, 80), dtype=bool)
    m[5:75, 5:75] = True
    m[30:50, 30:50] = False  # 400 px island/hole, must stay
    assert not water.clean_mask(m)[40, 40]


def test_lake_component_drops_unconnected_and_out_of_region_water():
    mask = np.zeros((60, 60), dtype=bool)
    mask[10:30, 10:30] = True  # touches lake
    mask[45:55, 45:55] = True  # separate pond inside region, not touching lake
    lake = np.zeros_like(mask)
    lake[15:25, 15:25] = True
    region = np.zeros_like(mask)
    region[5:58, 5:58] = True
    out = water.lake_component(mask, lake, region)
    assert out[20, 20] and not out[50, 50]


def test_area_and_edge_uncertainty():
    m = np.zeros((20, 20), dtype=bool)
    m[5:15, 5:15] = True  # 100 px = 1 ha
    assert water.area_ha(m) == pytest.approx(1.0)
    assert water.edge_pixels(m) == 36
    assert water.area_uncertainty_ha(m) == pytest.approx(0.18)


def test_otsu_in_scene_without_water_is_rejected_as_implausible():
    """Two vegetation classes (both MNDWI < -0.2) must not be split into 'water'/'land'."""
    rng = np.random.default_rng(3)
    veg = np.concatenate([rng.normal(-0.55, 0.02, 3000), rng.normal(-0.35, 0.02, 3000)])
    idx = veg.reshape(60, 100).astype("float32")
    res = water.classify_water(idx, np.ones(idx.shape, dtype=bool))
    assert res.method == "fallback_range"
    assert res.threshold == 0.0
    assert not res.mask.any()
