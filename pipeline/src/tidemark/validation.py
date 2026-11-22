"""Validation of Tidemark outputs against dated, sourced events and against JRC water maps.

    tidemark-validate            # writes validation/results.json

What is and is not measured (details in VALIDATION.md):
  * ground truth = validation/ground_truth.csv (news-reported events, each with a source URL);
  * foam candidates are scored only where the pipeline actually observed the event window;
  * water-level events are scored by percentile rank within each lake's own record;
  * "precision" of pipeline events is a LOWER BOUND, because the ground truth is far from
    complete: an unmatched event may be real but unreported;
  * water-mask agreement with JRC is computed on a shared grid, not against ground truth.
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from . import jsonsafe
from .runner import ROOT

GT_PATH = ROOT / "validation" / "ground_truth.csv"
RESULTS = ROOT / "validation" / "results.json"
REQUIRED = ["event_id", "lake_id", "event_type", "date_start", "date_end", "date_precision",
            "expected_signal", "description", "source_url", "source_publisher",
            "source_published", "also_confirmed_by", "confidence", "notes"]
SIGNALS = {"foam_candidate", "extent_low", "extent_high", "floating_mat", "none"}
PRECISIONS = {"day", "range", "month", "state_on_date"}
CONFIDENCE = {"high", "medium", "low"}
FOAM_PAD_DAYS = 5  # one Sentinel-2 revisit either side of a foam episode
FLOATING_PAD_DAYS = 15  # floating vegetation persists for weeks
SUPPLEMENTARY_MAX_TILE_CLOUD = 50.0  # scenes up to this tile cloud % are also tested for foam
LEVEL_PAD_DAYS = 10  # about two Sentinel-2 revisits around a dated water-level event
LOW_Q, HIGH_Q = 0.25, 0.75  # strict percentile cut-offs for "low" and "high" water
LOW_RATIO, HIGH_RATIO = 0.6, 1.25  # ...and the required size relative to the lake's median
# Pipeline event types that count as compatible with each ground-truth event type.
COMPATIBLE = {
    "foam_candidate": {"foam_spill"},
    "floating_mat_candidate": {"hyacinth_cover"},
    "extent_low": {"dry_low", "drained", "dewatered"},
    "extent_high": {"overflow"},
    "rapid_change": {"dry_low", "drained", "dewatered", "overflow"},
}
EVENT_PAD_DAYS = {"foam_candidate": FOAM_PAD_DAYS, "floating_mat_candidate": FLOATING_PAD_DAYS,
                  "extent_low": 45, "extent_high": 45, "rapid_change": 45}


# ---- ground truth ----------------------------------------------------------------------


def load_ground_truth(path: Path = GT_PATH) -> pd.DataFrame:
    """Load and validate the ground-truth table (raises ValueError on any problem)."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    if df["event_id"].duplicated().any():
        raise ValueError("duplicate event_id")
    for r in df.itertuples():
        if not r.source_url.startswith("https://"):
            raise ValueError(f"{r.event_id}: source_url must be an https URL")
        if r.expected_signal not in SIGNALS:
            raise ValueError(f"{r.event_id}: bad expected_signal {r.expected_signal!r}")
        if r.date_precision not in PRECISIONS:
            raise ValueError(f"{r.event_id}: bad date_precision {r.date_precision!r}")
        if r.confidence not in CONFIDENCE:
            raise ValueError(f"{r.event_id}: bad confidence {r.confidence!r}")
        if not r.description.strip():
            raise ValueError(f"{r.event_id}: empty description")
        try:
            start, end = date.fromisoformat(r.date_start), date.fromisoformat(r.date_end)
        except ValueError as exc:
            raise ValueError(f"{r.event_id}: bad date ({exc})") from exc
        if end < start:
            raise ValueError(f"{r.event_id}: date_end before date_start")
    out = df.copy()
    out["start"] = pd.to_datetime(out["date_start"])
    out["end"] = pd.to_datetime(out["date_end"])
    return out


def overlaps(a_start, a_end, b_start, b_end, pad_days: int = 0) -> bool:
    """True if [a_start, a_end] and [b_start, b_end] overlap after padding b by ``pad_days``."""
    pad = pd.Timedelta(days=pad_days)
    return bool(a_start <= b_end + pad and a_end >= b_start - pad)


def percentile_rank(values: pd.Series, x: float) -> float:
    """Share of ``values`` (a lake's own monthly areas) that are <= x (0..1)."""
    v = values.dropna()
    return float((v <= x).mean()) if len(v) else float("nan")


# ---- foam ----------------------------------------------------------------------------------


def foam_outcome(gt, scenes: pd.DataFrame, pad_days: int = FOAM_PAD_DAYS) -> dict:
    """Outcome of one foam event given the pipeline's per-month candidate table.

    ``scenes`` needs: date (str or NaT), status, qc_contaminated, foam_candidate_ha.
    The pipeline analyses one scene per month, so an event is observable only if that scene's
    date falls inside the (padded) event window and the scene is clean.
    """
    d = pd.to_datetime(scenes["date"], errors="coerce")
    inside = scenes[(scenes["status"] == "ok") & d.notna()
                    & (d >= gt.start - pd.Timedelta(days=pad_days))
                    & (d <= gt.end + pd.Timedelta(days=pad_days))]
    if inside.empty:
        return {"outcome": "not_observed", "scene_dates": []}
    clean = inside[~inside["qc_contaminated"].fillna(False).astype(bool)]
    if clean.empty:
        return {"outcome": "not_observed", "scene_dates": inside["date"].tolist(),
                "note": "scene present but flagged haze-contaminated"}
    flagged = (clean["foam_candidate_ha"].fillna(0) > 0).any()
    return {"outcome": "detected" if flagged else "missed",
            "scene_dates": clean["date"].tolist(),
            "foam_candidate_ha": float(clean["foam_candidate_ha"].fillna(0).max())}


# ---- water level ------------------------------------------------------------------------------


def level_outcome(gt, monthly: pd.DataFrame) -> dict:
    """Score a water-level event against the monthly series, using observation dates.

    ``monthly`` needs: month ("YYYY-MM"), source, water_area_ha, and optionally optical_date.
    A month's observation date is its optical acquisition date, else mid-month (radar-only).
    Only observations inside the event window (padded by LEVEL_PAD_DAYS for short events) count;
    an event with no observation in its window is "not_observed", never a miss.

    Expected low: hit if the area is in the lake's lowest quartile AND at most LOW_RATIO of
    its median (a rank alone is misleading for a lake whose area barely varies); partial if
    below the median. Expected high: the mirror image with HIGH_RATIO. Short events (up to
    a month) use the most extreme observation; long states use the mean.
    """
    have = monthly[monthly["source"].isin(["optical", "fused", "radar"])].copy()
    own = have["water_area_ha"]
    mid = pd.to_datetime(have["month"] + "-15")
    opt = pd.to_datetime(have["optical_date"], errors="coerce") if "optical_date" in have else None
    have["obs_date"] = opt.fillna(mid) if opt is not None else mid
    short = (gt.end - gt.start).days <= 31
    pad = pd.Timedelta(days=LEVEL_PAD_DAYS if short else 0)
    rows = have[(have["obs_date"] >= gt.start - pad) & (have["obs_date"] <= gt.end + pad)]
    if rows.empty:
        near = have.iloc[(have["obs_date"] - gt.start).abs().argsort()[:2]]
        return {"outcome": "not_observed",
                "nearest_observations": [str(d.date()) for d in near["obs_date"]],
                "nearest_area_ha": [round(float(a), 1) for a in near["water_area_ha"]]}
    areas = rows["water_area_ha"].astype(float)
    low = gt.expected_signal == "extent_low"
    area = float((areas.min() if low else areas.max()) if short else areas.mean())
    rank, med = percentile_rank(own, area), float(own.median())
    if low:
        strict = rank <= LOW_Q and area <= LOW_RATIO * med
        lenient = area < med
    else:
        strict = rank >= HIGH_Q and area >= HIGH_RATIO * med
        lenient = area > med
    return {"outcome": "hit" if strict else ("partial" if lenient else "miss"),
            "observations": [str(d.date()) for d in rows["obs_date"]],
            "area_ha": [round(float(a), 1) for a in areas], "scored_area_ha": round(area, 1),
            "percentile": round(rank, 3), "lake_median_ha": round(med, 1),
            "ratio_to_median": round(area / med, 2) if med else None,
            "sources": rows["source"].tolist()}


# ---- pipeline events vs ground truth ------------------------------------------------------------


def match_events(events: pd.DataFrame, gt: pd.DataFrame) -> pd.DataFrame:
    """Flag each pipeline event with the compatible ground-truth ids whose window it falls in."""
    out = []
    for e in events.itertuples():
        compat = COMPATIBLE.get(e.type, set())
        pad = EVENT_PAD_DAYS.get(e.type, 0)
        ids = [g.event_id for g in gt.itertuples()
               if g.lake_id == e.lake_id and g.event_type in compat
               and overlaps(e.obs_date, e.obs_date, g.start, g.end, pad)]
        out.append({"lake_id": e.lake_id, "type": e.type, "month": e.month,
                    "obs_date": str(e.obs_date.date()), "matched": ids})
    return pd.DataFrame(out)


def precision_table(matched: pd.DataFrame) -> dict:
    """Per event type: events, matched, and the matched share (a lower bound on precision)."""
    res = {}
    for t, g in matched.groupby("type"):
        n, m = len(g), int((g["matched"].map(len) > 0).sum())
        res[t] = {"events": n, "matched": m, "matched_share_lower_bound": round(m / n, 3)}
    return res


# ---- JRC water maps --------------------------------------------------------------------------


def iou(a: np.ndarray, b: np.ndarray, where: np.ndarray) -> float:
    a, b = a & where, b & where
    union = int((a | b).sum())
    return float((a & b).sum()) / union if union else float("nan")


def agreement(ours_freq: np.ndarray, jrc: np.ndarray, jrc_scale: float, where: np.ndarray,
              cuts: tuple[float, ...] = (0.25, 0.5, 0.75)) -> dict:
    """IoU of "usually water" masks at several frequency cuts, plus rank correlation.

    ``ours_freq`` is our share of clean observations that are water (0..1, nan = unobserved);
    ``jrc`` holds JRC values in its own units (``jrc_scale`` converts to 0..1, 255 = no data).
    """
    valid = where & np.isfinite(ours_freq) & (jrc != 255)
    jf = np.where(jrc == 255, np.nan, jrc / jrc_scale)
    res = {"pixels": int(valid.sum())}
    for c in cuts:
        res[f"iou_at_{int(c * 100)}"] = round(iou(np.nan_to_num(ours_freq) >= c,
                                                  np.nan_to_num(jf) >= c, valid), 3)
        k = int(c * 100)
        ours_px = (np.nan_to_num(ours_freq) >= c) & valid
        jrc_px = (np.nan_to_num(jf) >= c) & valid
        res[f"ours_ha_at_{k}"] = round(float(ours_px.sum()) * 0.01, 1)
        res[f"jrc_ha_at_{k}"] = round(float(jrc_px.sum()) * 0.01, 1)
    if valid.sum() > 10:
        rho = spearmanr(ours_freq[valid], jf[valid]).statistic
        res["spearman"] = round(float(rho), 3) if np.isfinite(rho) else None
    return res


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-validate")
    ap.add_argument("--no-jrc", action="store_true", help="skip the network-based JRC comparison")
    args = ap.parse_args(argv)
    gt = load_ground_truth()
    results: dict = {"ground_truth": {
        "events": len(gt), "by_type": gt["event_type"].value_counts().to_dict(),
        "testable": int((gt["expected_signal"] != "none").sum()),
        "distinct_sources": int(gt["source_url"].nunique())}}

    foam, level = [], []
    for g in gt.itertuples():
        if g.expected_signal == "none":
            continue
        cand_f = ROOT / "data" / "candidates" / f"{g.lake_id}.parquet"
        mon_f = ROOT / "data" / "monthly" / f"{g.lake_id}.parquet"
        if g.expected_signal in ("foam_candidate", "floating_mat"):
            scenes = pd.read_parquet(cand_f)
            pad = FOAM_PAD_DAYS
            if g.expected_signal == "floating_mat":
                flagged = scenes["floating_mat_candidate"].fillna(False).astype(bool)
                scenes = scenes.assign(foam_candidate_ha=flagged.astype(float))
                pad = FLOATING_PAD_DAYS
            res = foam_outcome(g, scenes, pad)
            foam.append({"event_id": g.event_id, "lake": g.lake_id, "type": g.expected_signal,
                         "window": f"{g.date_start}..{g.date_end}", **res})
        else:
            res = level_outcome(g, pd.read_parquet(mon_f))
            level.append({"event_id": g.event_id, "lake": g.lake_id, "signal": g.expected_signal,
                          "window": f"{g.date_start}..{g.date_end}", **res})
    if not args.no_jrc:
        from . import s2
        from .runner import load_lakes
        from .validation_jrc import foam_on_scene, scene_availability

        client, lakes = s2.open_catalog(), load_lakes()
        by_id = {g.event_id: g for g in gt.itertuples()}
        for e in foam:
            g = by_id[e["event_id"]]
            pad = FOAM_PAD_DAYS if e["type"] == "foam_candidate" else FLOATING_PAD_DAYS
            avail = scene_availability(client, lakes[g.lake_id][1], g.start, g.end, pad)
            ids = avail.pop("scene_ids")
            e["sentinel2_scenes_in_window"] = avail
            if e["type"] != "foam_candidate":
                continue
            # Supplementary test: every scene up to 50% tile cloud in the window, not only
            # the one scene per month that the pipeline analyses.
            extra = []
            for day, (sid, base, cloud) in sorted(ids.items()):
                if cloud <= SUPPLEMENTARY_MAX_TILE_CLOUD:
                    try:
                        r = foam_on_scene(client, g.lake_id, lakes[g.lake_id][1], sid, base)
                    except Exception as exc:  # reported, not hidden
                        r = {"scene_id": sid, "error": f"{type(exc).__name__}: {exc}"[:120]}
                    extra.append({"date": day, "tile_cloud_pct": round(cloud, 1), **r})
            e["supplementary_scenes"] = extra
    results["foam_and_floating"] = foam
    results["water_level"] = level

    ev_parts = []
    for p in sorted((ROOT / "data" / "events").glob("*.parquet")):
        if p.name.endswith("summary.parquet"):
            continue
        ev_parts.append(pd.read_parquet(p))
    if ev_parts:
        events = pd.concat(ev_parts, ignore_index=True)
        matched = match_events(events, gt)
        results["pipeline_events_vs_ground_truth"] = precision_table(matched)
        flat = matched.assign(matched=matched["matched"].map(",".join))
        results["pipeline_events_matched"] = flat.to_dict("records")
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(jsonsafe.dumps(results, indent=1), encoding="utf-8")
    if not args.no_jrc:
        from .validation_jrc import run_jrc

        results["jrc"] = run_jrc()
        RESULTS.write_text(jsonsafe.dumps(results, indent=1), encoding="utf-8")
    print(jsonsafe.dumps({k: v for k, v in results.items()
                          if k in ("ground_truth", "pipeline_events_vs_ground_truth", "jrc")},
                         indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
