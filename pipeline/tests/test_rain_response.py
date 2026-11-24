import numpy as np
import pandas as pd
from scipy import stats

from tidemark import rain_response as rr


def months(n=132, start="2016-01"):
    return [str(p) for p in pd.period_range(start, periods=n, freq="M")]


def test_spearman_matches_scipy():
    rng = np.random.default_rng(1)
    x, y = rng.normal(size=60), rng.normal(size=60)
    assert abs(rr.spearman(x, y) - stats.spearmanr(x, y).statistic) < 1e-9


def test_seasonal_anomaly_removes_a_pure_cycle():
    idx = months(48)
    cycle = pd.Series([10 + (int(m[5:7]) % 12) * 5 for m in idx], index=idx, dtype=float)
    assert np.allclose(rr.seasonal_anomaly(cycle).to_numpy(), 0)


def test_block_bootstrap_stays_in_range_and_keeps_neighbours():
    rng = np.random.default_rng(0)
    idx = rr.block_indices(50, 6, rng)
    assert len(idx) == 50 and idx.min() >= 0 and idx.max() < 50
    assert (np.diff(idx[:6]) == 1).all()  # the first block is consecutive months


def test_a_real_one_month_lag_is_found_and_no_other_lag_is_clear():
    rng = np.random.default_rng(7)
    idx = months()
    rain = pd.Series(rng.normal(size=len(idx)), index=idx)
    area = 0.9 * rain.shift(1) + rng.normal(scale=0.5, size=len(idx))
    area.iloc[0] = 0.0
    table = rr.lag_table(rain, area, n_boot=400)
    by = {t["lag"]: t for t in table}
    assert by[1]["clear"] and by[1]["rho"] > 0.5
    assert not by[0]["clear"] and not by[2]["clear"] and not by[3]["clear"]
    s = rr.summarise(table)
    assert s["best_lag"] == 1 and s["direction"] == "more water"


def test_a_negative_relationship_is_reported_as_less_water():
    rng = np.random.default_rng(11)
    idx = months()
    rain = pd.Series(rng.normal(size=len(idx)), index=idx)
    area = -0.9 * rain + rng.normal(scale=0.5, size=len(idx))
    s = rr.summarise(rr.lag_table(rain, area, lags=(0,), n_boot=400))
    assert s["best_lag"] == 0 and s["direction"] == "less water"


def test_unrelated_series_give_no_clear_lag():
    rng = np.random.default_rng(3)
    idx = months()
    rain = pd.Series(rng.normal(size=len(idx)), index=idx)
    area = pd.Series(rng.normal(size=len(idx)), index=idx)
    table = rr.lag_table(rain, area, n_boot=400)
    assert not any(t["clear"] for t in table)
    assert rr.summarise(table) == {"best_lag": None, "direction": None}


def test_missing_months_are_skipped_not_filled():
    rng = np.random.default_rng(5)
    idx = months()
    rain = pd.Series(rng.normal(size=len(idx)), index=idx)
    area = 0.9 * rain + rng.normal(scale=0.5, size=len(idx))
    area.iloc[::3] = np.nan
    t0 = rr.lag_table(rain, area, lags=(0,), n_boot=300)[0]
    assert t0["n"] == int(area.notna().sum()) and t0["clear"]


def test_results_are_deterministic():
    rng = np.random.default_rng(9)
    idx = months()
    rain = pd.Series(rng.normal(size=len(idx)), index=idx)
    area = pd.Series(rng.normal(size=len(idx)), index=idx)
    assert rr.lag_table(rain, area, n_boot=200) == rr.lag_table(rain, area, n_boot=200)


def test_too_few_pairs_never_counts_as_clear():
    idx = months(20)
    rain = pd.Series(np.arange(20.0), index=idx)
    area = pd.Series(np.arange(20.0), index=idx)
    assert (
        rr.summarise(rr.lag_table(rain, area, lags=(0,), n_boot=200))["best_lag"] is None
    )  # n < MIN_PAIRS
