import numpy as np
import pytest
from rasterio.transform import from_origin

from tidemark import fusion, sar


def speckled_scene(shape=(120, 120), seed=0, water_db=-22.0, land_db=-8.0, radius=30):
    """Linear-power scene with gamma speckle (L=4.4 looks) over a circular lake."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[: shape[0], : shape[1]]
    lake = (yy - 60) ** 2 + (xx - 60) ** 2 <= radius**2
    mean = 10 ** (np.where(lake, water_db, land_db) / 10)
    power = rng.gamma(4.4, mean / 4.4)
    return power.astype("float32"), lake


def test_to_db_and_nodata():
    out = sar.to_db(np.array([0.01, 1.0, -32768.0, 0.0], dtype="float32"))
    assert out[0] == pytest.approx(-20.0) and out[1] == pytest.approx(0.0)
    assert np.isnan(out[2]) and np.isnan(out[3])


def test_lee_reduces_speckle_variance_and_keeps_nan():
    power, lake = speckled_scene()
    power[0, 0] = np.nan
    filt = sar.lee_filter(power)
    assert np.isnan(filt[0, 0])
    land = ~lake
    land[:10, :10] = False
    assert filt[land].std() < 0.6 * power[land].std()


def test_classify_sar_recovers_lake_after_filtering():
    power, lake = speckled_scene()
    res = sar.classify_sar(sar.to_db(sar.lee_filter(power)))
    assert res.threshold_db == sar.THRESHOLD_DB
    assert res.mask.sum() == pytest.approx(lake.sum(), rel=0.08)


def test_classify_sar_threshold_is_respected_and_nan_invalid():
    db = np.array([[-20.0, -15.0, -10.0, np.nan]], dtype="float32")
    res = sar.classify_sar(db, threshold_db=-14.0)
    assert res.mask.tolist() == [[True, True, False, False]]
    assert res.valid.tolist() == [[True, True, True, False]]
    assert sar.classify_sar(db, threshold_db=-16.0).mask.tolist() == [[True, False, False, False]]


def test_majority_vote_ignores_invalid_and_breaks_ties_to_water():
    m1 = np.array([[1, 1, 0]], dtype=bool)
    m2 = np.array([[1, 0, 0]], dtype=bool)
    m3 = np.array([[0, 1, 1]], dtype=bool)
    v = [np.ones((1, 3), bool), np.ones((1, 3), bool), np.array([[1, 1, 0]], dtype=bool)]
    mask, any_valid = sar.majority_vote([m1, m2, m3], v)
    assert mask.tolist() == [[True, True, False]]
    assert any_valid.tolist() == [[True, True, True]]


# ---- fusion ---------------------------------------------------------------------------

def grid():
    region = np.ones((40, 40), dtype=bool)
    truth = np.zeros_like(region)
    truth[10:30, 10:30] = True
    return region, truth


def test_clear_optical_month_is_optical_and_ignores_radar():
    region, truth = grid()
    wrong_radar = ~truth
    f = fusion.fuse(truth, np.ones_like(region), wrong_radar, np.ones_like(region), region)
    assert f.source == "optical" and (f.mask == truth).all() and f.optical_coverage == 1.0


def test_cloud_gap_is_filled_from_radar():
    region, truth = grid()
    valid = np.ones_like(region)
    valid[:, 20:] = False  # right half clouded
    optical = truth & valid
    f = fusion.fuse(optical, valid, truth, np.ones_like(region), region)
    assert f.source == "fused"
    assert (f.mask == truth).all() and f.known_fraction == 1.0
    assert f.optical_coverage == pytest.approx(0.5)


def test_no_optical_gives_radar_only():
    region, truth = grid()
    f = fusion.fuse(None, None, truth, np.ones_like(region), region)
    assert f.source == "radar" and (f.mask == truth).all()


def test_mostly_clouded_optical_is_radar_not_fused():
    region, truth = grid()
    valid = np.zeros_like(region)
    valid[:5] = True
    f = fusion.fuse(np.zeros_like(region), valid, truth, np.ones_like(region), region)
    assert f.source == "radar" and (f.mask == truth).all()


def test_unknown_pixels_are_excluded():
    region, truth = grid()
    rv = np.ones_like(region)
    rv[:, :20] = False
    f = fusion.fuse(None, None, truth, rv, region)
    assert f.known_fraction == pytest.approx(0.5)
    assert not f.mask[:, :20].any()


def test_iou():
    a = np.array([[1, 1, 0, 0]], dtype=bool)
    b = np.array([[0, 1, 1, 0]], dtype=bool)
    assert fusion.iou(a, b, np.ones_like(a)) == pytest.approx(1 / 3)
    assert np.isnan(fusion.iou(~a & ~a & False, ~a & False, np.ones_like(a)))


def test_align_mask_shifts_by_whole_pixels():
    crs = "EPSG:32643"
    src_t = from_origin(780000, 1440000, 10, 10)
    dst_t = from_origin(780010, 1440000, 10, 10)  # dst starts one pixel to the east
    m = np.zeros((5, 6), dtype=bool)
    m[2, 3] = True
    out = fusion.align_mask(m, src_t, dst_t, (5, 6), crs)
    assert out[2, 2] and out.sum() == 1
    assert fusion.align_mask(m, src_t, src_t, (5, 6), crs) is m
