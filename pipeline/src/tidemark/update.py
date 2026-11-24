"""Monthly refresh: re-process only the most recent months, then rebuild everything downstream.

    tidemark-update                 # last 3 months through the current month
    tidemark-update --months 6

Why this is not just "run every stage again":
  * The raw per-month caches live in pipeline/.cache (not in git). On a fresh machine only the
    recent months get cached, but the series builders rebuild each table from whatever is cached.
    Without care that would silently delete 2016 onwards. ``merge_missing`` keeps every previously
    published month that was not recomputed, and ``check_not_shrunk`` aborts if any lake still
    lost months.
  * Recent months are re-processed (their cache entries are removed first) because late-arriving
    Sentinel scenes and reprocessing can change them. Older months are left alone.

Not refreshed here, on purpose: encroachment (a 2016-18 vs 2023-26 comparison), ghost lakes and the
validation set. Those change by editing data, not by the calendar.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from .runner import CACHE_ROOT, ROOT

# Tables rebuilt from caches, each keyed by a "month" column (YYYY-MM).
TABLES = ("timeseries", "monthly", "candidates")
CACHE_DIRS = ("s2_rows", "s1_months", "s2_cand")


def window(today: date, n: int) -> tuple[str, str]:
    """(start, end) as YYYY-MM covering the current month and the n-1 before it."""
    if n < 1:
        raise ValueError("months must be at least 1")
    idx = today.year * 12 + (today.month - 1)
    s = idx - (n - 1)
    return f"{s // 12:04d}-{s % 12 + 1:02d}", f"{today.year:04d}-{today.month:02d}"


def month_range(start: str, end: str) -> list[str]:
    s = pd.Period(start, freq="M")
    e = pd.Period(end, freq="M")
    return [str(p) for p in pd.period_range(s, e, freq="M")]


def merge_missing(new: pd.DataFrame, old: pd.DataFrame) -> pd.DataFrame:
    """``new`` plus any ``old`` months that ``new`` does not contain (new always wins)."""
    if old is None or old.empty:
        return new
    keep = old[~old["month"].isin(set(new["month"]))]
    if keep.empty:
        return new
    out = pd.concat([new, keep.reindex(columns=new.columns)], ignore_index=True)
    return out.sort_values("month").reset_index(drop=True)


def check_not_shrunk(before: dict[str, int], after: dict[str, int]) -> list[str]:
    """Human-readable problems if any table lost months (empty list = fine)."""
    return [f"{k}: {before[k]} months before, {after.get(k, 0)} after"
            for k in before if after.get(k, 0) < before[k]]


def _tables() -> dict[str, Path]:
    return {f"{t}/{p.stem}": p for t in TABLES
            for p in sorted((ROOT / "data" / t).glob("*.parquet"))}


def snapshot() -> dict[str, pd.DataFrame]:
    return {k: pd.read_parquet(p) for k, p in _tables().items()}


def clear_recent_cache(months: list[str]) -> int:
    n = 0
    for d in CACHE_DIRS:
        for m in months:
            for f in (CACHE_ROOT / d).glob(f"*_{m}.json"):
                f.unlink()
                n += 1
    return n


def run(months_back: int, today: date | None = None) -> int:
    from . import (
        anomalies,
        candidates,
        health,
        monthly,
        rain_response,
        rainfall,
        runner,
        web_export,
    )

    start, end = window(today or date.today(), months_back)
    print(f"refreshing {start} .. {end}", file=sys.stderr)
    old = snapshot()
    if not old:
        print("no existing data/ tables found; run the full pipeline first", file=sys.stderr)
        return 2
    before = {k: len(v) for k, v in old.items()}
    print(f"cleared {clear_recent_cache(month_range(start, end))} cached entries", file=sys.stderr)

    span = ["--start", start, "--end", end]
    runner.main(["run", *span])
    monthly.main(["radar", *span])
    monthly.main(["fuse"])
    candidates.main(["run", *span])
    rainfall.main([])

    # Put back every older month the (possibly cold) cache could not rebuild.
    for key, path in _tables().items():
        if key in old:
            merge_missing(pd.read_parquet(path), old[key]).to_parquet(path, index=False)
    problems = check_not_shrunk(before, {k: len(pd.read_parquet(p)) for k, p in _tables().items()})
    if problems:
        print("ABORT: tables lost months:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 3

    anomalies.main([])
    rain_response.main([])
    health.main([])
    web_export.main()
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-update")
    ap.add_argument("--months", type=int, default=3, help="how many recent months to re-process")
    return run(ap.parse_args(argv).months)


if __name__ == "__main__":
    raise SystemExit(main())
