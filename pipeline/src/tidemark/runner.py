"""Monthly Sentinel-2 water-extent runner (resumable).

    tidemark-water run --lakes varthur ulsoor --start 2016-01 --end 2026-10
    tidemark-water series          # compile cached rows into data/timeseries/*.parquet

Each (lake, month) result is cached as JSON, so reruns only fetch what is missing.
Months with no usable scene are recorded with an explicit status, never dropped.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
import shapely
from rasterio import features, windows
from rasterio.enums import Resampling
from shapely.geometry import shape as to_shape
from shapely.ops import unary_union

from . import s2, water
from .geometry import reproject

ROOT = Path(__file__).resolve().parents[3]
LAKES = ROOT / "data" / "lakes.geojson"
OUT_SERIES = ROOT / "data" / "timeseries"
OUT_EXTENTS = ROOT / "data" / "extents"
CACHE = Path(os.environ.get("TIDEMARK_CACHE", ROOT / "pipeline" / ".cache")) / "s2_rows"

CANDIDATES_PER_MONTH = 4  # scenes whose lake-level cloud fraction is measured per month
GOOD_ENOUGH_BAD_FRACTION = 0.02  # stop looking once a scene is this clean over the lake
MAX_BAD_FRACTION = 0.5  # above this the month is recorded as "too_cloudy" (no optical extent)
SIMPLIFY_M = 10.0


def load_lakes(path: Path = LAKES) -> dict[str, tuple[dict, object]]:
    fc = json.loads(Path(path).read_text(encoding="utf-8"))
    return {f["id"]: (f["properties"], to_shape(f["geometry"])) for f in fc["features"]}


def item_crs(item) -> str:
    p = item.properties
    if "proj:code" in p:
        return p["proj:code"]
    return f"EPSG:{p['proj:epsg']}"


def bad_fraction(item, lake_ll) -> float:
    """Cloud/shadow/no-data fraction of the lake region from the SCL band alone (cheap)."""
    crs = item_crs(item)
    lake, region, bounds = s2.lake_masks(lake_ll, crs)
    with rasterio.open(item.assets["SCL"].href) as src:
        win = windows.from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        scl = src.read(1, window=win, boundless=True, resampling=Resampling.nearest)
        tr = windows.transform(win, src.transform)
    region_r = s2.rasterize(region, scl.shape, tr)
    return water.cloud_fraction(scl.astype("uint8"), region_r)


def mask_to_geojson(mask: np.ndarray, transform, crs: str) -> dict | None:
    """Vectorise a water mask to a simplified lon/lat MultiPolygon (precision ~1 m)."""
    polys = [
        to_shape(g)
        for g, v in features.shapes(mask.astype("uint8"), mask=mask, transform=transform)
        if v == 1
    ]
    if not polys:
        return None
    geom = unary_union(polys).simplify(SIMPLIFY_M, preserve_topology=True)
    geom_ll = shapely.set_precision(reproject(geom, crs, "EPSG:4326"), 1e-5)  # ~1 m grid
    return json.loads(shapely.to_geojson(geom_ll))


def process_month(client, lake_id: str, props: dict, lake_ll, month: str) -> dict:
    base = {
        "lake_id": lake_id,
        "month": month,
        "mapped_area_ha": props["area_ha"],
        "source": "optical",
    }
    try:
        items = s2.search_month(client, lake_ll, month)
        if not items:
            return {**base, "status": "no_scene"}
        best, best_bad = None, 2.0
        for item in items[:CANDIDATES_PER_MONTH]:
            bad = bad_fraction(item, lake_ll)
            if bad < best_bad:
                best, best_bad = item, bad
            if bad <= GOOD_ENOUGH_BAD_FRACTION:
                break
        meta = {
            "scene_id": best.id,
            "date": best.datetime.date().isoformat(),
            "scene_cloud_pct": round(best.properties.get("eo:cloud_cover", float("nan")), 2),
            "processing_baseline": best.properties.get("s2:processing_baseline"),
            "n_candidates": len(items),
        }
        if best_bad > MAX_BAD_FRACTION:
            bad = round(best_bad, 3)
            return {**base, **meta, "status": "too_cloudy", "region_bad_fraction": bad}
        crs = item_crs(best)
        lake_utm, region_utm, bounds = s2.lake_masks(lake_ll, crs)
        hrefs = {k: best.assets[a].href for k, a in s2.ASSETS.items()}
        win = s2.read_window(hrefs, bounds, meta["processing_baseline"])
        ex = s2.extract_extent(win, lake_utm, region_utm)
        gj = mask_to_geojson(ex.mask, ex.transform, ex.crs)
        if gj:
            d = OUT_EXTENTS / lake_id
            d.mkdir(parents=True, exist_ok=True)
            (d / f"{meta['date']}.geojson").write_text(
                json.dumps({"type": "Feature", "properties": {"lake_id": lake_id, **meta},
                            "geometry": gj}),
                encoding="utf-8",
            )
        return {**base, **meta, **ex.row, "status": "ok"}
    except Exception as exc:  # recorded, not hidden; reruns retry errors
        return {**base, "status": "error", "error": f"{type(exc).__name__}: {exc}"[:300]}


def months(start: str, end: str) -> list[str]:
    return [p.strftime("%Y-%m") for p in pd.period_range(start, end, freq="M")]


def run(lake_ids: list[str], start: str, end: str, workers: int = 4) -> None:
    lakes = load_lakes()
    CACHE.mkdir(parents=True, exist_ok=True)
    client = s2.open_catalog()
    jobs = []
    for lid in lake_ids:
        props, geom = lakes[lid]
        for m in months(start, end):
            f = CACHE / f"{lid}_{m}.json"
            if f.exists() and json.loads(f.read_text(encoding="utf-8")).get("status") != "error":
                continue
            jobs.append((lid, props, geom, m, f))
    print(f"{len(jobs)} lake-months to process", file=sys.stderr)

    def work(job):
        lid, props, geom, m, f = job
        row = process_month(client, lid, props, geom, m)
        f.write_text(json.dumps(row), encoding="utf-8")
        print(f"{lid} {m} {row['status']} {row.get('water_area_ha', '')}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, jobs))


def build_series() -> None:
    rows: dict[str, list[dict]] = {}
    for f in sorted(CACHE.glob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        rows.setdefault(r["lake_id"], []).append(r)
    OUT_SERIES.mkdir(parents=True, exist_ok=True)
    for lid, rs in rows.items():
        df = pd.DataFrame(rs).sort_values("month").reset_index(drop=True)
        df.to_parquet(OUT_SERIES / f"{lid}.parquet", index=False)
        counts = df["status"].value_counts().to_dict()
        print(f"{lid}: {len(df)} months {counts}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-water")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--lakes", nargs="+", default=None)
    r.add_argument("--start", default="2016-01")
    r.add_argument("--end", default=pd.Timestamp.today().strftime("%Y-%m"))
    r.add_argument("--workers", type=int, default=4)
    sub.add_parser("series")
    args = ap.parse_args(argv)
    if args.cmd == "run":
        run(args.lakes or list(load_lakes()), args.start, args.end, args.workers)
    build_series()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
