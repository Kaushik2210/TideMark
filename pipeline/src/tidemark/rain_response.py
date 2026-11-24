"""Does regional rain move the lakes, and how long does it take? (monthly resolution)

    tidemark-rain-response          # writes data/rain_response/<lake>.json

Method, kept deliberately modest:
  * Both series become *seasonal anomalies* (month minus that lake's median for the calendar
    month), so the shared monsoon cycle does not create a correlation by itself.
  * For each lag 0..3 months, the rank (Spearman) correlation between the rain anomaly in
    month t and the water-area anomaly in month t + lag, over months where both exist.
  * A moving-block bootstrap (6-month blocks, 2000 resamples, fixed seed) gives a 95%
    interval that respects the month-to-month dependence a plain bootstrap would ignore.
  * Nothing is claimed beyond "associated with": the rain is ERA5 reanalysis on a ~28 km
    grid (regional, not what fell on the lake), Bellandur and Varthur are fed largely by
    sewage whatever the rain does, and radar and optical months define water slightly
    differently.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from . import jsonsafe
from .runner import ROOT, load_lakes

OUT = ROOT / "data" / "rain_response"
LAGS = (0, 1, 2, 3)
BLOCK = 6
N_BOOT = 2000
SEED = 20261123
MIN_PAIRS = 30


def seasonal_anomaly(s: pd.Series) -> pd.Series:
    """Series indexed by 'YYYY-MM' minus its median for the same calendar month (NaN stays NaN)."""
    cal = s.index.str[5:7]
    return s - s.groupby(cal).transform("median")


def _rank(a: np.ndarray) -> np.ndarray:
    return pd.Series(a).rank(method="average").to_numpy()


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 3:
        return float("nan")
    rx, ry = _rank(x), _rank(y)
    if rx.std() == 0 or ry.std() == 0:
        return float("nan")
    return float(np.corrcoef(rx, ry)[0, 1])


def _pairs(
    rain: np.ndarray, area: np.ndarray, lag: int, idx: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Rain at i (i in idx) paired with area at i+lag, dropping missing and out-of-range."""
    j = idx + lag
    ok = j < len(area)
    i, j = idx[ok], j[ok]
    good = ~np.isnan(rain[i]) & ~np.isnan(area[j])
    return rain[i][good], area[j][good]


def block_indices(n: int, block: int, rng: np.random.Generator) -> np.ndarray:
    """Moving-block bootstrap sample of positions 0..n-1 (blocks keep neighbouring months)."""
    starts = rng.integers(0, max(1, n - block + 1), size=int(np.ceil(n / block)))
    return np.concatenate([np.arange(s, min(n, s + block)) for s in starts])[:n]


def lag_table(
    rain: pd.Series, area: pd.Series, lags=LAGS, n_boot: int = N_BOOT, seed: int = SEED
) -> list[dict]:
    """Spearman correlation and 95% block-bootstrap interval per lag for aligned anomaly series."""
    r = rain.reindex(area.index).to_numpy(dtype=float)
    a = area.to_numpy(dtype=float)
    n = len(a)
    rng = np.random.default_rng(seed)
    boots = [block_indices(n, BLOCK, rng) for _ in range(n_boot)]
    out = []
    for lag in lags:
        x, y = _pairs(r, a, lag, np.arange(n))
        rho = spearman(x, y)
        vals = []
        for idx in boots:
            bx, by = _pairs(r, a, lag, idx)
            v = spearman(bx, by)
            if not np.isnan(v):
                vals.append(v)
        lo, hi = (
            np.percentile(vals, [2.5, 97.5]) if len(vals) > 100 else (float("nan"), float("nan"))
        )
        out.append(
            {
                "lag": lag,
                "rho": rho,
                "ci": [float(lo), float(hi)],
                "n": int(len(x)),
                "clear": bool(not np.isnan(lo) and (lo > 0 or hi < 0)),
            }
        )
    return out


def summarise(table: list[dict]) -> dict:
    """The strongest lag with a clear interval, if any, in plain data (the website words it)."""
    clear = [t for t in table if t["clear"] and t["n"] >= MIN_PAIRS]
    best = max(clear, key=lambda t: abs(t["rho"])) if clear else None
    return {
        "best_lag": None if best is None else best["lag"],
        "direction": None if best is None else ("more water" if best["rho"] > 0 else "less water"),
    }


def build(lake_id: str) -> dict:
    monthly = pd.read_parquet(ROOT / "data" / "monthly" / f"{lake_id}.parquet")
    cand_f = ROOT / "data" / "candidates" / f"{lake_id}.parquet"
    contaminated: set[str] = set()
    if cand_f.exists():
        c = pd.read_parquet(cand_f)
        if "qc_contaminated" in c.columns:
            contaminated = set(c.loc[c["qc_contaminated"].fillna(False).astype(bool), "month"])
    ok = monthly["source"].isin(["optical", "fused", "radar"])
    bad = monthly["source"].isin(["optical", "fused"]) & monthly["month"].isin(contaminated)
    area = pd.Series(
        monthly["water_area_ha"].where(ok & ~bad).to_numpy(), index=monthly["month"].to_numpy()
    )

    daily = pd.read_parquet(ROOT / "data" / "rainfall" / f"{lake_id}.parquet")
    daily["month"] = daily["date"].dt.strftime("%Y-%m")
    rain = daily.groupby("month")["precip_mm"].sum()
    rain = rain.reindex(area.index)

    table = lag_table(seasonal_anomaly(rain), seasonal_anomaly(area))
    return {
        "lake_id": lake_id,
        "months": int(area.notna().sum()),
        "method": (
            "Spearman rank correlation of seasonal anomalies, "
            "95% moving-block bootstrap interval"
        ),
        "block_months": BLOCK,
        "resamples": N_BOOT,
        "lags": table,
        **summarise(table),
        "caveats": [
            "Regional ERA5 rain on a ~28 km grid, not rain measured at the lake.",
            "Association at monthly resolution, not proof of cause (a month hides the order).",
            "Bellandur and Varthur are fed largely by sewage inflow that does not depend on rain.",
            "Radar and optical months define water slightly differently.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-rain-response")
    ap.add_argument("--lakes", nargs="+", default=None)
    args = ap.parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    for lid in args.lakes or list(load_lakes()):
        res = build(lid)
        (OUT / f"{lid}.json").write_text(jsonsafe.dumps(res, indent=1), encoding="utf-8")
        print(
            lid, res["best_lag"], [(t["lag"], round(t["rho"], 2), t["clear"]) for t in res["lags"]]
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
