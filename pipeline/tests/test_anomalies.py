import numpy as np
import pandas as pd
import pytest

from tidemark import anomalies


def seasonal_series(years=10, outlier=None, seed=0):
    rng = np.random.default_rng(seed)
    months = pd.period_range("2016-01", periods=12 * years, freq="M")
    season = 40 + 30 * np.sin((months.month.to_numpy() - 3) / 12 * 2 * np.pi)
    area = season + rng.normal(0, 2, len(months))
    df = pd.DataFrame({"month": months.strftime("%Y-%m"), "area": area})
    if outlier is not None:
        df.loc[df.month == outlier[0], "area"] += outlier[1]
    return df


def test_normal_seasonal_swing_is_not_flagged_but_an_outlier_is():
    df = anomalies.seasonal_anomalies(seasonal_series(outlier=("2020-06", -35)))
    big = (df.z.abs() >= anomalies.Z_THRESHOLD) & (df.residual.abs() >= anomalies.MIN_ABS_HA)
    flagged = df[big]
    assert flagged.month.tolist() == ["2020-06"]
    assert flagged.z.iloc[0] < 0


def test_unknown_months_do_not_break_or_flag():
    s = seasonal_series()
    s.loc[10:20, "area"] = np.nan
    df = anomalies.seasonal_anomalies(s)
    assert df.loc[10:20, "z"].isna().all()


def test_rapid_change_only_between_consecutive_months():
    s = pd.DataFrame({"month": ["2020-01", "2020-02", "2020-04"], "area": [10.0, 60.0, 5.0]})
    rc = anomalies.rapid_changes(s)
    assert rc.change_ha.iloc[1] == 50.0
    assert np.isnan(rc.change_ha.iloc[2])  # Feb -> Apr is not a month-to-month change


def daily_frame():
    dates = pd.date_range("2024-06-01", periods=60)
    p = np.zeros(60)
    p[9:12] = [30, 40, 20]  # 10-12 June
    return pd.DataFrame({"date": dates, "precip_mm": p})


def test_rain_context_sums_prior_rain_and_finds_event():
    daily = daily_frame()
    events = pd.DataFrame({"start": [pd.Timestamp("2024-06-10")],
                           "end": [pd.Timestamp("2024-06-12")],
                           "peak_3day_mm": [90.0], "total_mm": [90.0]})
    ctx = anomalies.rain_context(pd.Timestamp("2024-06-20"), daily, events)
    assert ctx["follows_rain"] and ctx["rain_event_lag_days"] == 8
    assert ctx["rain_prior_14d_mm"] == 90.0 and ctx["rain_prior_7d_mm"] == 0.0
    late = anomalies.rain_context(pd.Timestamp("2024-07-20"), daily, events)
    assert not late["follows_rain"] and late["rain_event_end"] is None


def test_rain_on_the_observation_day_does_not_count_as_prior():
    daily = daily_frame()
    ctx = anomalies.rain_context(pd.Timestamp("2024-06-11"), daily, pd.DataFrame(
        columns=["start", "end", "peak_3day_mm", "total_mm"]))
    assert ctx["rain_prior_7d_mm"] == 30.0  # only 10 June, not 11 June itself


def test_rain_context_nan_when_history_incomplete():
    ctx = anomalies.rain_context(pd.Timestamp("2024-06-03"), daily_frame(), pd.DataFrame(
        columns=["start", "end", "peak_3day_mm", "total_mm"]))
    assert np.isnan(ctx["rain_prior_7d_mm"])


def test_observation_date_prefers_exact_date_and_marks_approx():
    d, approx = anomalies.observation_date("2024-02", "2024-02-07")
    assert d == pd.Timestamp("2024-02-07") and not approx
    d, approx = anomalies.observation_date("2024-02", None)
    assert d == pd.Timestamp("2024-02-15") and approx


def test_build_events_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setattr(anomalies, "ROOT", tmp_path)
    for d in ("monthly", "candidates", "rainfall"):
        (tmp_path / "data" / d).mkdir(parents=True)
    s = seasonal_series(outlier=("2020-06", -35))
    monthly = pd.DataFrame({
        "month": s.month, "source": "optical", "water_area_ha": s.area, "confidence": 0.8,
        "optical_date": s.month + "-10"})
    monthly.to_parquet(tmp_path / "data/monthly/x.parquet")
    cand = pd.DataFrame([
        {"month": "2018-03", "status": "ok", "date": "2018-03-10", "floating_mat_candidate": True,
         "fai_frac": 0.4, "chlorophyll_high_candidate": False, "ndci_median": 0.3,
         "ndci_top_decile_cut": 0.5, "foam_candidate_ha": 0.8, "foam_near_inlet_patches": 1},
        {"month": "2018-04", "status": "ok", "date": "2018-04-10", "floating_mat_candidate": False,
         "fai_frac": 0.0, "chlorophyll_high_candidate": False, "ndci_median": 0.3,
         "ndci_top_decile_cut": 0.5, "foam_candidate_ha": 0.1, "foam_near_inlet_patches": 0}])
    cand.to_parquet(tmp_path / "data/candidates/x.parquet")
    dates = pd.date_range("2015-12-01", "2026-06-30")
    daily = pd.DataFrame({"date": dates, "precip_mm": 0.0})
    daily.to_parquet(tmp_path / "data/rainfall/x.parquet")
    pd.DataFrame({"start": [pd.Timestamp("2018-03-01")], "end": [pd.Timestamp("2018-03-03")],
                  "peak_3day_mm": [60.0], "total_mm": [60.0]}).to_parquet(
        tmp_path / "data/rainfall/x_events.parquet")
    events, summary = anomalies.build_events("x")
    types = set(events["type"])
    assert {"extent_low", "floating_mat_candidate", "foam_candidate"} <= types
    assert "chlorophyll_high_candidate" not in types
    foam = events[events["type"] == "foam_candidate"].iloc[0]
    assert foam.near_inlet and foam.follows_rain  # 10 Mar is 7 days after the event ended
    assert summary["by_type"]["foam_candidate"]["n"] == 1
    assert 0 < summary["base_rate_follows_rain"] < 0.1


def test_series_too_short_yields_no_statistical_events(tmp_path, monkeypatch):
    monkeypatch.setattr(anomalies, "ROOT", tmp_path)
    for d in ("monthly", "rainfall"):
        (tmp_path / "data" / d).mkdir(parents=True)
    pd.DataFrame({"month": ["2020-01", "2020-02"], "source": "optical",
                  "water_area_ha": [1.0, 50.0], "confidence": 0.5,
                  "optical_date": [None, None]}).to_parquet(tmp_path / "data/monthly/y.parquet")
    pd.DataFrame({"date": pd.date_range("2019-12-01", "2020-03-01"),
                  "precip_mm": 0.0}).to_parquet(tmp_path / "data/rainfall/y.parquet")
    pd.DataFrame(columns=["start", "end", "peak_3day_mm", "total_mm"]).to_parquet(
        tmp_path / "data/rainfall/y_events.parquet")
    events, summary = anomalies.build_events("y")
    assert len(events) == 0 and summary["months"] == 2


@pytest.mark.parametrize("n", [4, 5])
def test_mad_scale_needs_enough_points(n):
    s = pd.Series(np.arange(n, dtype=float))
    assert (np.isnan(anomalies._mad_scale(s))) == (n < 5)


def test_contaminated_months_are_excluded_from_all_optical_events(tmp_path, monkeypatch):
    monkeypatch.setattr(anomalies, "ROOT", tmp_path)
    for d in ("monthly", "candidates", "rainfall"):
        (tmp_path / "data" / d).mkdir(parents=True)
    s = seasonal_series(outlier=("2020-06", -35))
    pd.DataFrame({"month": s.month, "source": "optical", "water_area_ha": s.area,
                  "confidence": 0.8, "optical_date": s.month + "-10"}
                 ).to_parquet(tmp_path / "data/monthly/x.parquet")
    pd.DataFrame([
        {"month": "2020-06", "status": "ok", "date": "2020-06-10", "qc_contaminated": True,
         "floating_mat_candidate": True, "fai_frac": 0.9, "chlorophyll_high_candidate": True,
         "ndci_median": 0.5, "ndci_top_decile_cut": 0.4, "foam_candidate_ha": 3.0,
         "foam_near_inlet_patches": 0}]).to_parquet(tmp_path / "data/candidates/x.parquet")
    pd.DataFrame({"date": pd.date_range("2015-12-01", "2026-06-30"), "precip_mm": 0.0}
                 ).to_parquet(tmp_path / "data/rainfall/x.parquet")
    pd.DataFrame(columns=["start", "end", "peak_3day_mm", "total_mm"]).to_parquet(
        tmp_path / "data/rainfall/x_events.parquet")
    events, _ = anomalies.build_events("x")
    assert len(events) == 0  # the outlier month is contaminated, so nothing is flagged


def run_rapid(tmp_path, monkeypatch, sources):
    monkeypatch.setattr(anomalies, "ROOT", tmp_path)
    for d in ("monthly", "rainfall"):
        (tmp_path / "data" / d).mkdir(parents=True, exist_ok=True)
    s = seasonal_series()
    s.loc[s.month == "2020-06", "area"] = s.loc[s.month == "2020-05", "area"].iloc[0] + 60
    src = ["optical"] * len(s)
    for month, kind in sources.items():
        src[int(s.index[s.month == month][0])] = kind
    pd.DataFrame({"month": s.month, "source": src, "water_area_ha": s.area, "confidence": 0.8,
                  "optical_date": s.month + "-10"}).to_parquet(tmp_path / "data/monthly/x.parquet")
    pd.DataFrame({"date": pd.date_range("2015-12-01", "2026-06-30"), "precip_mm": 0.0}
                 ).to_parquet(tmp_path / "data/rainfall/x.parquet")
    pd.DataFrame(columns=["start", "end", "peak_3day_mm", "total_mm"]).to_parquet(
        tmp_path / "data/rainfall/x_events.parquet")
    return anomalies.build_events("x")[0]


def test_jump_across_a_sensor_switch_is_not_a_rapid_change(tmp_path, monkeypatch):
    events = run_rapid(tmp_path, monkeypatch, {"2020-06": "radar"})
    assert "rapid_change" not in set(events.get("type", []))


def test_same_sensor_jump_is_a_rapid_change(tmp_path, monkeypatch):
    events = run_rapid(tmp_path, monkeypatch, {})
    assert "rapid_change" in set(events["type"])
