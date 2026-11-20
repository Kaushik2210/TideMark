"""Daily rainfall per lake from the Open-Meteo Historical Weather API (ERA5 reanalysis).

    tidemark-rainfall                 # fetch and write data/rainfall/<lake>.parquet + .meta.json

Notes that matter when reading results:
  * Model is pinned to ``era5`` (ECMWF reanalysis, ~0.25 degree / ~28 km grid), so all three
    lakes can share a grid cell: this is regional rainfall, not what fell on the lake.
  * Data lags real time by several days; the end date stops 7 days before today.
  * Free API terms: non-commercial use only, CC BY 4.0, < 10,000 calls per day.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date, timedelta

import pandas as pd
import requests
from shapely.geometry import Point

from .runner import CACHE_ROOT, ROOT, load_lakes

URL = "https://archive-api.open-meteo.com/v1/archive"
MODEL = "era5"
USER_AGENT = "tidemark-research/0.1"
OUT = ROOT / "data" / "rainfall"
CACHE = CACHE_ROOT / "rainfall"
START = "2015-12-01"  # one month before the record starts, so rolling sums are defined
ROLL_DAYS = (3, 7, 14, 30)
# A "rain event" is a spell whose 3-day total reaches this many mm (heuristic; see docs).
EVENT_3DAY_MM = 40.0


def fetch_daily(lat: float, lon: float, start: str, end: str, attempts: int = 5) -> dict:
    """Raw Open-Meteo response for daily precipitation (cached on disk by request)."""
    key = f"{lat:.4f}_{lon:.4f}_{start}_{end}_{MODEL}"
    f = CACHE / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    params = {
        "latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
        "daily": "precipitation_sum", "timezone": "Asia/Kolkata", "models": MODEL,
    }
    last: Exception | None = None
    for i in range(attempts):
        try:
            r = requests.get(URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=90)
            r.raise_for_status()
            data = r.json()
            if "daily" not in data:
                raise ValueError(f"unexpected response: {str(data)[:200]}")
            CACHE.mkdir(parents=True, exist_ok=True)
            f.write_text(json.dumps(data), encoding="utf-8")
            return data
        except (requests.RequestException, ValueError) as exc:
            last = exc
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"Open-Meteo failed after {attempts} attempts: {last}")


def to_frame(data: dict) -> pd.DataFrame:
    """Daily series with rolling totals. Missing values stay NaN (never filled with zero)."""
    d = data["daily"]
    df = pd.DataFrame({"date": pd.to_datetime(d["time"]), "precip_mm": d["precipitation_sum"]})
    df["precip_mm"] = pd.to_numeric(df["precip_mm"], errors="coerce")
    for n in ROLL_DAYS:
        df[f"roll{n}_mm"] = df["precip_mm"].rolling(n, min_periods=n).sum()
    return df


def find_events(df: pd.DataFrame, threshold_mm: float = EVENT_3DAY_MM) -> pd.DataFrame:
    """Rain events: runs of days whose trailing 3-day total is >= threshold.

    Each event reports its start/end, peak 3-day total and total rain over the event window
    (the 3 days before the first qualifying day through the last qualifying day).
    """
    hit = (df["roll3_mm"] >= threshold_mm).to_numpy()
    events, i, n = [], 0, len(df)
    while i < n:
        if not hit[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and hit[j + 1]:
            j += 1
        s, e = max(i - 2, 0), j
        events.append({
            "start": df["date"].iloc[s],
            "end": df["date"].iloc[e],
            "peak_3day_mm": float(df["roll3_mm"].iloc[i : j + 1].max()),
            "total_mm": float(df["precip_mm"].iloc[s : e + 1].sum()),
        })
        i = j + 1
    return pd.DataFrame(events, columns=["start", "end", "peak_3day_mm", "total_mm"])


def build(lake_ids: list[str] | None = None) -> None:
    lakes = load_lakes()
    end = (date.today() - timedelta(days=7)).isoformat()
    OUT.mkdir(parents=True, exist_ok=True)
    for lid in lake_ids or list(lakes):
        centroid: Point = lakes[lid][1].centroid
        data = fetch_daily(round(centroid.y, 4), round(centroid.x, 4), START, end)
        df = to_frame(data)
        df.to_parquet(OUT / f"{lid}.parquet", index=False)
        ev = find_events(df)
        ev.to_parquet(OUT / f"{lid}_events.parquet", index=False)
        meta = {
            "lake_id": lid,
            "requested_lat_lon": [round(centroid.y, 4), round(centroid.x, 4)],
            "grid_lat_lon": [data.get("latitude"), data.get("longitude")],
            "model": MODEL,
            "source": URL,
            "licence": "CC BY 4.0 (Open-Meteo; free tier is non-commercial use only)",
            "start": START,
            "end": end,
            "event_rule": f"trailing 3-day total >= {EVENT_3DAY_MM} mm",
            "retrieved": date.today().isoformat(),
            "days": len(df),
            "missing_days": int(df["precip_mm"].isna().sum()),
        }
        (OUT / f"{lid}.meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
        print(lid, meta["grid_lat_lon"], f"{len(df)} days, {len(ev)} events,",
              f"{meta['missing_days']} missing")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-rainfall")
    ap.add_argument("--lakes", nargs="+", default=None)
    build(ap.parse_args(argv).lakes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
