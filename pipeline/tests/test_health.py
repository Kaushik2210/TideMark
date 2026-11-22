import numpy as np
import pandas as pd
import pytest

from tidemark import health as h


def test_weights_sum_to_one_for_every_weighting():
    assert sum(h.WEIGHTS.values()) == pytest.approx(1.0)
    for w in h.ALTERNATIVE_WEIGHTS.values():
        assert sum(w.values()) == pytest.approx(1.0)
        assert set(w) == set(h.WEIGHTS)


def test_extent_stability_constant_vs_swinging_series():
    steady, cv = h.extent_stability(pd.Series([30.0] * 12))
    assert steady == 100.0 and cv == 0.0
    swinging, cv2 = h.extent_stability(pd.Series([0, 60] * 6, dtype=float))
    assert swinging == 0.0 and cv2 == pytest.approx(1.0)  # CV of 1 or more scores zero
    moderate, cv3 = h.extent_stability(pd.Series([15, 45] * 6, dtype=float))
    assert moderate == pytest.approx(50.0) and cv3 == pytest.approx(0.5)
    assert h.extent_stability(pd.Series([1.0, 2.0]))[0] == 0.0  # too short: no score
    assert h.extent_stability(pd.Series([0.0] * 12))[0] == 0.0  # no water at all


def test_bloom_score_endpoints_and_monotonic():
    assert h.bloom_score(0.0, 0.1) == 100.0
    assert h.bloom_score(0.5, 0.5) == 0.0
    assert h.bloom_score(0.1, 0.3) > h.bloom_score(0.3, 0.3) > h.bloom_score(0.3, 0.45)


def test_encroachment_and_anomaly_scores():
    assert h.encroachment_score(0.0) == 100.0
    assert h.encroachment_score(5.0) == 50.0 and h.encroachment_score(50.0) == 0.0
    assert h.anomaly_score(0, 36) == 100.0
    assert h.anomaly_score(12, 36) == pytest.approx(0.0)  # 4 per year
    assert h.anomaly_score(6, 36) == pytest.approx(50.0)


def synthetic(months=40, mat=0.0, ndci=0.2, built=0.0, alarms=0):
    idx = pd.period_range("2023-08", periods=months, freq="M").astype(str)
    monthly = pd.DataFrame({"month": idx, "source": "optical", "water_area_ha": 30.0})
    cand = pd.DataFrame({"month": idx, "status": "ok", "qc_contaminated": False,
                         "floating_mat_candidate": [i < mat * months for i in range(months)],
                         "ndci_median": ndci})
    ev = pd.DataFrame({"type": ["extent_low"] * alarms, "month": list(idx[-alarms:]) if alarms else []})
    enc = {"lost_water_now_built_pct_of_early_footprint": {"high": built}}
    return monthly, cand, ev, enc


def test_perfect_lake_scores_high_and_poor_lake_scores_low():
    good = h.health_for_lake(*synthetic(mat=0.0, ndci=0.1, built=0.0, alarms=0))
    assert good["score"] == 100.0 and good["low_coverage"] is False
    bad = h.health_for_lake(*synthetic(mat=0.6, ndci=0.5, built=20.0, alarms=20))
    # the synthetic water area is perfectly steady, so only extent stability (30%) scores
    assert bad["score"] == 30.0
    assert {k: v for k, v in bad["components"].items() if k != "extent_stability"} == {
        "bloom": 0.0, "encroachment": 0.0, "anomalies": 0.0}
    assert bad["sensitivity_range"][0] <= bad["score"] <= bad["sensitivity_range"][1]


def test_window_is_latest_36_months_and_ignores_months_without_extent():
    monthly, cand, ev, enc = synthetic(months=50)
    monthly.loc[monthly.index[-3:], "source"] = "none"
    r = h.health_for_lake(monthly, cand, ev, enc)
    assert r["inputs"]["months_with_extent"] == 36
    assert r["inputs"]["window"][1] == monthly["month"].iloc[-4]


def test_contaminated_months_are_excluded_from_bloom_inputs():
    monthly, cand, ev, enc = synthetic(mat=0.0, ndci=0.2)
    cand.loc[cand.index[-10:], "qc_contaminated"] = True
    cand.loc[cand.index[-10:], "floating_mat_candidate"] = True
    r = h.health_for_lake(monthly, cand, ev, enc)
    assert r["inputs"]["floating_mat_share"] == 0.0


def test_low_coverage_flag_when_few_months_have_extents():
    monthly, cand, ev, enc = synthetic(months=40)
    monthly.loc[monthly.index[5:35], "source"] = "none"
    r = h.health_for_lake(monthly, cand, ev, enc)
    assert r["low_coverage"] is True
    assert not np.isnan(r["score"])
