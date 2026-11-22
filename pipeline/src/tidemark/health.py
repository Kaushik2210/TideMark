"""Transparent lake health score (0-100). A research index, not an official assessment.

    tidemark-health            # writes data/health/<lake>.json

Four components, each scored 0-100 (higher = healthier), combined with fixed weights.
Window: the latest 36 months that have an extent. Formulas (also shown on the site):

  extent_stability  (30%)  100 * (1 - min(CV, 1)),  CV = std/mean of monthly water area
  bloom             (30%)  mean of
                            100 * (1 - min(floating_mat_share / 0.5, 1))   FAI-based flags
                            100 * (1 - clip((median NDCI - 0.1) / 0.4, 0, 1))
  encroachment      (15%)  100 * (1 - min(high_built_pct / 10, 1)), high_built_pct = upper bound
                           of early-water-footprint % now built-up (Phase 5)
  anomalies         (25%)  100 * (1 - min(alarm_events_per_year / 4, 1)); alarm events are
                           extent_low, extent_high, rapid_change and foam_candidate

The weights and caps are judgement calls, not derived from data. Because the underlying
signals are unvalidated (VALIDATION.md), use the score to compare lakes and months, not as a
verdict. A sensitivity range over alternative weightings is reported with it.
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from .runner import ROOT, load_lakes

OUT = ROOT / "data" / "health"
WINDOW_MONTHS = 36
WEIGHTS = {"extent_stability": 0.30, "bloom": 0.30, "encroachment": 0.15, "anomalies": 0.25}
ALTERNATIVE_WEIGHTS = {
    "equal": {"extent_stability": 0.25, "bloom": 0.25, "encroachment": 0.25, "anomalies": 0.25},
    "bloom_heavy": {"extent_stability": 0.20, "bloom": 0.50, "encroachment": 0.10,
                    "anomalies": 0.20},
    "extent_heavy": {"extent_stability": 0.50, "bloom": 0.20, "encroachment": 0.10,
                     "anomalies": 0.20},
}
FLOATING_SHARE_ZERO = 0.5  # floating-mat share at which that sub-score reaches 0
NDCI_BEST, NDCI_WORST = 0.1, 0.5
BUILT_PCT_ZERO = 10.0
ALARM_PER_YEAR_ZERO = 4.0
ALARM_TYPES = {"extent_low", "extent_high", "rapid_change", "foam_candidate"}
MIN_COVERAGE = 0.6  # below this share of window months with an extent, flag low coverage


def clip01(x: float) -> float:
    return float(min(max(x, 0.0), 1.0))


def extent_stability(areas: pd.Series) -> tuple[float, float]:
    """(score, CV). CV = std / mean of monthly water area; undefined mean gives score 0."""
    a = areas.dropna().astype(float)
    if len(a) < 6 or a.mean() <= 0:
        return 0.0, float("nan")
    cv = float(a.std(ddof=0) / a.mean())
    return 100.0 * (1.0 - min(cv, 1.0)), cv


def bloom_score(floating_share: float, ndci_median: float) -> float:
    floating = 100.0 * (1.0 - min(floating_share / FLOATING_SHARE_ZERO, 1.0))
    ndci = 100.0 * (1.0 - clip01((ndci_median - NDCI_BEST) / (NDCI_WORST - NDCI_BEST)))
    return (floating + ndci) / 2.0


def encroachment_score(high_built_pct: float) -> float:
    return 100.0 * (1.0 - min(high_built_pct / BUILT_PCT_ZERO, 1.0))


def anomaly_score(n_alarm_events: int, months: int) -> float:
    per_year = n_alarm_events / (months / 12.0) if months else 0.0
    return 100.0 * (1.0 - min(per_year / ALARM_PER_YEAR_ZERO, 1.0))


def combine(components: dict[str, float], weights: dict[str, float]) -> float:
    assert abs(sum(weights.values()) - 1.0) < 1e-9
    return float(sum(components[k] * w for k, w in weights.items()))


def health_for_lake(monthly: pd.DataFrame, cand: pd.DataFrame, events: pd.DataFrame,
                    encroachment: dict | None) -> dict:
    have = monthly[monthly["source"].isin(["optical", "fused", "radar"])].sort_values("month")
    window = have.tail(WINDOW_MONTHS)
    months = set(window["month"])
    start, end = window["month"].iloc[0], window["month"].iloc[-1]
    n_months_span = len(pd.period_range(start, end, freq="M"))

    stab, cv = extent_stability(window["water_area_ha"])

    usable = cand[(cand["status"] == "ok") & ~cand["qc_contaminated"].fillna(False).astype(bool)
                  & cand["month"].isin(months)]
    n_clean = len(usable)
    floating_share = (float(usable["floating_mat_candidate"].fillna(False).astype(bool).mean())
                      if n_clean else float("nan"))
    ndci_median = float(usable["ndci_median"].median()) if n_clean else float("nan")
    bloom = bloom_score(floating_share, ndci_median) if n_clean else 0.0

    built_high = None
    if encroachment:
        built_high = encroachment["lost_water_now_built_pct_of_early_footprint"]["high"]
    enc = encroachment_score(built_high if built_high is not None else 0.0)

    alarms = events[events["type"].isin(ALARM_TYPES) & events["month"].isin(months)]
    anom = anomaly_score(len(alarms), n_months_span)

    comps = {"extent_stability": stab, "bloom": bloom, "encroachment": enc, "anomalies": anom}
    total = combine(comps, WEIGHTS)
    alt = {name: combine(comps, w) for name, w in ALTERNATIVE_WEIGHTS.items()}
    lo, hi = min([total, *alt.values()]), max([total, *alt.values()])
    return {
        "score": round(total, 1),
        "sensitivity_range": [round(lo, 1), round(hi, 1)],
        "alternative_weightings": {k: round(v, 1) for k, v in alt.items()},
        "components": {k: round(v, 1) for k, v in comps.items()},
        "weights": WEIGHTS,
        "inputs": {
            "window": [start, end], "months_with_extent": int(len(window)),
            "months_in_span": n_months_span,
            "extent_cv": None if np.isnan(cv) else round(cv, 3),
            "clean_optical_months": n_clean,
            "floating_mat_share": None if np.isnan(floating_share) else round(floating_share, 3),
            "ndci_median": None if np.isnan(ndci_median) else round(ndci_median, 3),
            "upper_bound_built_pct_of_early_footprint": built_high,
            "alarm_events": int(len(alarms)),
        },
        "low_coverage": bool(len(window) / n_months_span < MIN_COVERAGE),
        "notes": [
            "Research index from unvalidated satellite signals; not an official assessment.",
            "Encroachment scores 100 when no water-to-built conversion is found; the outline is "
            "OpenStreetMap, not an official boundary, so this is not proof of no encroachment.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(prog="tidemark-health").parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    for lid in load_lakes():
        monthly = pd.read_parquet(ROOT / "data" / "monthly" / f"{lid}.parquet")
        cand = pd.read_parquet(ROOT / "data" / "candidates" / f"{lid}.parquet")
        ev_f = ROOT / "data" / "events" / f"{lid}.parquet"
        events = (pd.read_parquet(ev_f) if ev_f.exists()
                  else pd.DataFrame(columns=["type", "month"]))
        enc_f = ROOT / "data" / "encroachment" / f"{lid}.json"
        enc = json.loads(enc_f.read_text(encoding="utf-8")) if enc_f.exists() else None
        res = health_for_lake(monthly, cand, events, enc)
        (OUT / f"{lid}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
        print(lid, res["score"], res["sensitivity_range"], res["components"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
