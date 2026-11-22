import numpy as np
import pandas as pd
import pytest

from tidemark import validation as v


def gt_row(**kw):
    base = {"event_id": "GTX", "lake_id": "x", "event_type": "foam_spill", "date_start": "2020-03-10",
            "date_end": "2020-03-12", "date_precision": "range", "expected_signal": "foam_candidate",
            "description": "something happened", "source_url": "https://example.org/a",
            "source_publisher": "P", "source_published": "2020-03-13", "also_confirmed_by": "",
            "confidence": "high", "notes": ""}
    base.update(kw)
    return base


def write_gt(tmp_path, rows):
    p = tmp_path / "gt.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    return p


def test_real_ground_truth_is_valid_and_sourced():
    gt = v.load_ground_truth()
    assert len(gt) >= 25
    assert gt["source_url"].str.startswith("https://").all()
    assert gt["event_id"].is_unique
    assert (gt["end"] >= gt["start"]).all()
    assert set(gt["lake_id"]) <= {"bellandur", "varthur", "ulsoor"}
    # every testable row says which signal tests it, every untestable row says 'none'
    assert set(gt["expected_signal"]) <= v.SIGNALS


@pytest.mark.parametrize("bad", [
    {"source_url": "http://example.org"}, {"source_url": ""}, {"expected_signal": "magic"},
    {"date_precision": "sometime"}, {"confidence": "sure"}, {"description": " "},
    {"date_end": "2020-03-01"}, {"date_start": "not-a-date"},
])
def test_invalid_rows_are_rejected(tmp_path, bad):
    with pytest.raises(ValueError):
        v.load_ground_truth(write_gt(tmp_path, [gt_row(**bad)]))


def test_duplicate_ids_and_missing_columns_rejected(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        v.load_ground_truth(write_gt(tmp_path, [gt_row(), gt_row()]))
    p = write_gt(tmp_path, [gt_row()])
    df = pd.read_csv(p).drop(columns=["source_url"])
    df.to_csv(p, index=False)
    with pytest.raises(ValueError, match="missing"):
        v.load_ground_truth(p)


def test_overlap_with_padding():
    a, b = pd.Timestamp("2020-03-20"), pd.Timestamp("2020-03-20")
    s, e = pd.Timestamp("2020-03-10"), pd.Timestamp("2020-03-12")
    assert not v.overlaps(a, b, s, e, 0)
    assert not v.overlaps(a, b, s, e, 5)
    assert v.overlaps(a, b, s, e, 8)


def gt_obj(**kw):
    return next(v.load_ground_truth.__globals__["pd"].DataFrame([gt_row(**kw)])
                .assign(start=lambda d: pd.to_datetime(d.date_start),
                        end=lambda d: pd.to_datetime(d.date_end)).itertuples())


def scenes(rows):
    return pd.DataFrame(rows, columns=["date", "status", "qc_contaminated", "foam_candidate_ha"])


def test_foam_outcomes_detected_missed_and_not_observed():
    g = gt_obj()
    ok = scenes([("2020-03-11", "ok", False, 0.8)])
    assert v.foam_outcome(g, ok)["outcome"] == "detected"
    miss = scenes([("2020-03-11", "ok", False, 0.0)])
    assert v.foam_outcome(g, miss)["outcome"] == "missed"
    far = scenes([("2020-03-30", "ok", False, 5.0)])
    assert v.foam_outcome(g, far)["outcome"] == "not_observed"  # right month, wrong week
    hazy = scenes([("2020-03-11", "ok", True, 0.8)])
    r = v.foam_outcome(g, hazy)
    assert r["outcome"] == "not_observed" and "haze" in r["note"]
    cloudy = scenes([("2020-03-11", "too_cloudy", False, 0.0)])
    assert v.foam_outcome(g, cloudy)["outcome"] == "not_observed"


def monthly(areas, source="optical"):
    months = pd.period_range("2020-01", periods=len(areas), freq="M").astype(str)
    return pd.DataFrame({"month": months, "source": source, "water_area_ha": areas})


def test_level_outcome_low_high_and_partial():
    areas = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
    low = gt_obj(event_type="drained", expected_signal="extent_low", date_start="2020-01-05",
                 date_end="2020-01-05")
    assert v.level_outcome(low, monthly(areas))["outcome"] == "hit"  # rank 1/12
    mid = gt_obj(event_type="drained", expected_signal="extent_low", date_start="2020-05-05",
                 date_end="2020-05-05")
    assert v.level_outcome(mid, monthly(areas))["outcome"] == "partial"  # 5/12 <= median
    high_gt = gt_obj(event_type="overflow", expected_signal="extent_high", date_start="2020-12-10",
                     date_end="2020-12-10")
    assert v.level_outcome(high_gt, monthly(areas))["outcome"] == "hit"
    wrong = gt_obj(event_type="overflow", expected_signal="extent_high", date_start="2020-01-10",
                   date_end="2020-01-10")
    assert v.level_outcome(wrong, monthly(areas))["outcome"] == "miss"


def test_level_outcome_not_observed_when_no_extent_for_the_month():
    g = gt_obj(event_type="drained", expected_signal="extent_low", date_start="2020-02-20",
               date_end="2020-02-20")
    m = monthly([10, 20, 30])
    m.loc[1, "source"] = "none"
    r = v.level_outcome(g, m)
    assert r["outcome"] == "not_observed" and len(r["nearest_observations"]) == 2


def test_scene_that_predates_the_event_is_not_a_miss_or_a_hit():
    """Ulsoor, Feb 2026: the month's scene (1 Feb) was taken before the lake was drained."""
    g = gt_obj(event_type="drained", expected_signal="extent_low", date_start="2020-03-20",
               date_end="2020-03-20")
    m = monthly([30, 30, 30, 30, 30, 30])
    m["optical_date"] = ["2020-01-10", "2020-02-01", "2020-03-01", "2020-04-20", "2020-05-02",
                         "2020-06-02"]
    assert v.level_outcome(g, m)["outcome"] == "not_observed"  # nothing within 10 days


def test_narrow_distribution_cannot_produce_a_low_hit():
    """A lake that always has 27-31 ha: 27 ha is the lowest rank but not 'drained'."""
    g = gt_obj(event_type="drained", expected_signal="extent_low", date_start="2020-01-15",
               date_end="2020-01-15")
    m = monthly([27, 28, 29, 30, 31, 29, 30, 28, 29, 30, 31, 30])
    r = v.level_outcome(g, m)
    assert r["percentile"] <= v.LOW_Q and r["ratio_to_median"] > v.LOW_RATIO
    assert r["outcome"] == "partial"  # below the median, but not a real drop


def test_short_events_use_the_extreme_observation_long_states_use_the_mean():
    areas = [50, 50, 130, 50, 50, 50, 50, 50, 50, 50, 50, 50]
    m = monthly(areas)
    m["optical_date"] = ["2020-01-10", "2020-02-02", "2020-03-04", "2020-04-10"] + [None] * 8
    over = gt_obj(event_type="overflow", expected_signal="extent_high", date_start="2020-02-20",
                  date_end="2020-03-05")
    r = v.level_outcome(over, m)
    assert r["scored_area_ha"] == 130.0 and r["outcome"] == "hit"  # Mar 4 is in the window; Feb 2 is not
    state = gt_obj(event_type="dewatered", expected_signal="extent_low", date_start="2020-01-01",
                   date_end="2020-06-30")
    assert v.level_outcome(state, m)["scored_area_ha"] == pytest.approx(np.mean(areas[:6]), abs=0.1)


def test_event_matching_uses_compatible_types_and_lake():
    gt = pd.DataFrame([gt_row(event_id="A", event_type="foam_spill"),
                       gt_row(event_id="B", event_type="overflow", expected_signal="extent_high",
                              lake_id="y")])
    gt["start"], gt["end"] = pd.to_datetime(gt.date_start), pd.to_datetime(gt.date_end)
    ev = pd.DataFrame({"lake_id": ["x", "x", "x", "y"],
                       "type": ["foam_candidate", "foam_candidate", "extent_high", "extent_high"],
                       "month": ["2020-03", "2020-06", "2020-03", "2020-03"],
                       "obs_date": pd.to_datetime(["2020-03-11", "2020-06-01", "2020-03-11",
                                                   "2020-03-11"])})
    m = v.match_events(ev, gt)
    assert m["matched"].tolist() == [["A"], [], [], ["B"]]
    # pipeline extent_high on lake x does not match a foam GT row (incompatible type)
    t = v.precision_table(m)
    assert t["foam_candidate"] == {"events": 2, "matched": 1, "matched_share_lower_bound": 0.5}
    assert t["extent_high"]["matched"] == 1


def test_iou_and_agreement_on_known_masks():
    where = np.ones((10, 10), bool)
    a = np.zeros((10, 10), bool)
    a[:5] = True
    b = np.zeros((10, 10), bool)
    b[2:7] = True
    assert v.iou(a, b, where) == pytest.approx(3 / 7)
    ours = np.where(a, 1.0, 0.0)
    jrc = np.where(a, 100, 0).astype("uint8")
    jrc[9, 9] = 255  # no data pixel is excluded
    r = v.agreement(ours, jrc, 100.0, where)
    assert r["iou_at_50"] == 1.0 and r["pixels"] == 99 and r["spearman"] == pytest.approx(1.0)
    assert np.isnan(v.iou(np.zeros((2, 2), bool), np.zeros((2, 2), bool), np.ones((2, 2), bool)))


def test_percentile_rank():
    s = pd.Series([1.0, 2.0, 3.0, 4.0, np.nan])
    assert v.percentile_rank(s, 2.0) == 0.5
    assert np.isnan(v.percentile_rank(pd.Series([np.nan]), 1.0))
