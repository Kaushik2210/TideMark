"""Anomaly flags per lake, linked to preceding rainfall.

    tidemark-anomalies          # writes data/events/<lake>.parquet and .json

Event types (all heuristics, unvalidated until Phase 6):
  extent_low / extent_high   water area far from this lake's typical value for that calendar
                             month (robust z-score of residuals after removing the month median)
  rapid_change               month-to-month change much larger than this lake's usual change,
                             only when both months come from the same single sensor
  floating_mat_candidate     FAI-based floating-mat signal (candidates.py)
  chlorophyll_high_candidate NDCI in the lake's own top decile (relative, not absolute)
  foam_candidate             bright, low-saturation patches beside the water (candidates.py)

Each event records the rain that fell before it. Whether an event "follows rain" is a
descriptive flag (a qualifying rain event ended within 14 days before the observation), reported
next to the base rate for ordinary months so it is not over-read as causation.
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from . import jsonsafe
from .runner import ROOT, load_lakes

OUT = ROOT / "data" / "events"
Z_THRESHOLD = 3.0
MIN_ABS_HA = 5.0  # ignore statistical anomalies smaller than this in absolute area
RAPID_K = 3.0
FOAM_EVENT_MIN_HA = 0.5
RAIN_LOOKBACK_DAYS = 14
MIN_MONTHS = 24


def _mad_scale(x: pd.Series) -> float:
    x = x.dropna()
    if len(x) < 5:
        return float("nan")
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def seasonal_anomalies(series: pd.DataFrame) -> pd.DataFrame:
    """Months whose area deviates from the lake's calendar-month median.

    ``series`` needs columns month ("YYYY-MM") and area (NaN = unknown). Adds residual, z.
    """
    df = series.copy()
    df["cal_month"] = df["month"].str[5:7].astype(int)
    med = df.groupby("cal_month")["area"].transform("median")
    df["residual"] = df["area"] - med
    scale = _mad_scale(df["residual"])
    df["z"] = df["residual"] / scale if scale and np.isfinite(scale) else np.nan
    df["scale_ha"] = scale
    return df


def rapid_changes(series: pd.DataFrame) -> pd.DataFrame:
    """Adds change_ha vs the previous calendar month (NaN if either month unknown)."""
    df = series.copy().sort_values("month").reset_index(drop=True)
    per = pd.PeriodIndex(df["month"], freq="M")
    consecutive = np.r_[False, (per[1:] - per[:-1]).map(lambda d: d.n == 1)]
    diff = df["area"].diff()
    df["change_ha"] = diff.where(consecutive)
    df["change_scale_ha"] = _mad_scale(df["change_ha"])
    return df


def rain_context(
    obs_date: pd.Timestamp,
    daily: pd.DataFrame,
    events: pd.DataFrame,
    lookback: int = RAIN_LOOKBACK_DAYS,
) -> dict:
    """Rain before ``obs_date`` (strictly earlier days) and any qualifying rain event within
    ``lookback`` days before it."""
    d = daily.set_index("date")["precip_mm"]

    def prior(n: int) -> float:
        w = d[(d.index >= obs_date - pd.Timedelta(days=n)) & (d.index < obs_date)]
        return round(float(w.sum()), 1) if len(w) == n else float("nan")

    ctx = {"rain_prior_7d_mm": prior(7), "rain_prior_14d_mm": prior(14),
           "rain_prior_30d_mm": prior(30), "follows_rain": False,
           "rain_event_end": None, "rain_event_total_mm": None, "rain_event_lag_days": None}
    if len(events):
        ended = events[(events["end"] < obs_date)
                       & (events["end"] >= obs_date - pd.Timedelta(days=lookback))]
        if len(ended):
            e = ended.sort_values("end").iloc[-1]
            ctx.update(follows_rain=True, rain_event_end=e["end"].date().isoformat(),
                       rain_event_total_mm=round(float(e["total_mm"]), 1),
                       rain_event_lag_days=int((obs_date - e["end"]).days))
    return ctx


def observation_date(month: str, optical_date) -> tuple[pd.Timestamp, bool]:
    """Exact optical acquisition date if known, else mid-month (approximate)."""
    if optical_date is not None and not pd.isna(optical_date):
        return pd.Timestamp(optical_date), False
    return pd.Timestamp(f"{month}-15"), True


def build_events(lake_id: str) -> tuple[pd.DataFrame, dict]:
    monthly = pd.read_parquet(ROOT / "data" / "monthly" / f"{lake_id}.parquet")
    cand_f = ROOT / "data" / "candidates" / f"{lake_id}.parquet"
    cand = pd.read_parquet(cand_f).set_index("month") if cand_f.exists() else pd.DataFrame()
    daily = pd.read_parquet(ROOT / "data" / "rainfall" / f"{lake_id}.parquet")
    rain_events = pd.read_parquet(ROOT / "data" / "rainfall" / f"{lake_id}_events.parquet")

    # Optical months whose "water" pixels look cloud/haze-contaminated (high SWIR) are excluded
    # from every optical-derived flag, including the extent statistics.
    contaminated: set[str] = set()
    if "qc_contaminated" in cand.columns:
        contaminated = set(cand.index[cand["qc_contaminated"].fillna(False).astype(bool)])
    bad_optical = monthly["source"].isin(["optical", "fused"]) & monthly["month"].isin(contaminated)
    have = monthly["source"].isin(["optical", "fused", "radar"]) & ~bad_optical
    series = pd.DataFrame({
        "month": monthly["month"],
        "area": monthly["water_area_ha"].where(have),
        "source": monthly["source"],
        "confidence": monthly["confidence"],
        "optical_date": monthly["optical_date"],
    })
    rows: list[dict] = []
    if series["area"].notna().sum() >= MIN_MONTHS:
        sa = seasonal_anomalies(series)
        rc = rapid_changes(series)
        for i, r in sa.iterrows():
            if pd.notna(r.z) and abs(r.z) >= Z_THRESHOLD and abs(r.residual) >= MIN_ABS_HA:
                kind = "extent_low" if r.z < 0 else "extent_high"
                detail = f"residual {r.residual:+.1f} ha, z {r.z:+.1f}"
                rows.append(_event(r["month"], r["optical_date"], kind, float(r.area), detail,
                                   r["confidence"], r["source"]))
            c = rc.loc[i]
            scale = c.change_scale_ha
            big = max(RAPID_K * scale, MIN_ABS_HA) if np.isfinite(scale) else None
            if pd.notna(c.change_ha) and big is not None and abs(c.change_ha) >= big:
                # Radar and optical define "water" differently, so a jump across a sensor switch
                # is not trusted; both months must come from the same single sensor.
                prev, cur = rc.loc[i - 1, "source"], c["source"]
                if prev == cur and cur in ("optical", "radar"):
                    detail = f"change {c.change_ha:+.1f} ha vs previous month"
                    rows.append(_event(c["month"], c["optical_date"], "rapid_change",
                                       float(c.area), detail, c["confidence"], cur))
    conf_by_month = series.set_index("month")["confidence"]
    for month, c in cand.iterrows():
        if c.get("status") != "ok" or month in contaminated:
            continue
        conf = conf_by_month.get(month)
        if c.get("floating_mat_candidate") is True:
            detail = f"{c['fai_frac']:.0%} of water pixels with FAI>0.02"
            rows.append(_event(month, c["date"], "floating_mat_candidate", float(c["fai_frac"]),
                               detail, conf, "optical"))
        if c.get("chlorophyll_high_candidate") is True:
            detail = (f"median NDCI {c['ndci_median']:.2f} >= "
                      f"lake top-decile {c['ndci_top_decile_cut']:.2f}")
            rows.append(_event(month, c["date"], "chlorophyll_high_candidate",
                               float(c["ndci_median"]), detail, conf, "optical"))
        if c.get("foam_candidate_ha", 0) >= FOAM_EVENT_MIN_HA:
            near = int(c.get("foam_near_inlet_patches", 0))
            detail = (f"{c['foam_candidate_ha']:.2f} ha bright low-saturation patches; "
                      f"{near} near OSM inflow/outflow")
            rows.append(_event(month, c["date"], "foam_candidate", float(c["foam_candidate_ha"]),
                               detail, conf, "optical", near_inlet=near > 0))
    events = pd.DataFrame(rows)
    if len(events):
        ctx = pd.DataFrame([rain_context(e, daily, rain_events) for e in events["obs_date"]])
        events = pd.concat([events, ctx], axis=1)
        events = events.sort_values(["obs_date", "type"]).reset_index(drop=True)

    # base rate: share of ordinary observation dates that follow a rain event
    dates = [observation_date(m, od)[0] for m, od in zip(series["month"], series["optical_date"],
                                                          strict=True)]
    base = float(np.mean([rain_context(d, daily, rain_events)["follows_rain"] for d in dates]))
    summary = {"lake_id": lake_id, "months": len(series), "base_rate_follows_rain": round(base, 3),
               "by_type": {}}
    if len(events):
        for t, g in events.groupby("type"):
            summary["by_type"][t] = {"n": int(len(g)),
                                     "follows_rain": round(float(g["follows_rain"].mean()), 3)}
    return events, summary


def _event(month, optical_date, kind, value, detail, confidence, source, **extra) -> dict:
    d, approx = observation_date(month, optical_date)
    conf = None if confidence is None or pd.isna(confidence) else round(float(confidence), 3)
    return {"lake_id": None, "month": month, "obs_date": d, "date_is_approx": approx,
            "type": kind, "value": round(value, 3), "detail": detail, "confidence": conf,
            "source": source, **extra}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-anomalies")
    ap.add_argument("--lakes", nargs="+", default=None)
    args = ap.parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    for lid in args.lakes or list(load_lakes()):
        events, summary = build_events(lid)
        if len(events):
            events["lake_id"] = lid
            events.to_parquet(OUT / f"{lid}.parquet", index=False)
            out = events.copy()
            out["obs_date"] = out["obs_date"].dt.strftime("%Y-%m-%d")
            (OUT / f"{lid}.json").write_text(
                jsonsafe.dumps(out.to_dict("records"), indent=1),
                encoding="utf-8")
        (OUT / f"{lid}.summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
        print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
