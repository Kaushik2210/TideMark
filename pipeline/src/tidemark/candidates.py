"""Monthly bloom and foam *candidates* from the Sentinel-2 scene chosen for each lake-month.

    tidemark-candidates run --start 2016-01 --end 2026-11
    tidemark-candidates series      # compile cached rows into data/candidates/<lake>.parquet

Reads extra bands (B02, B04, B05, B08) for the scene already selected by the water-extent
run and reuses its saved water mask, so grids line up. Results are candidates only.
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import planetary_computer
from scipy import ndimage as ndi
from shapely.geometry import Point
from shapely.ops import unary_union

from . import indices, s2, waterways
from .geometry import reproject
from .monthly import _load_npz, retry
from .runner import CACHE, CACHE_ROOT, MASKS, ROOT, load_lakes, mask_to_geojson, months

CAND_CACHE = CACHE_ROOT / "s2_cand"
OUT = ROOT / "data" / "candidates"
BANDS = ("B02", "B03", "B04", "B05", "B08", "B11", "SCL")
INLET_RADIUS_M = 150.0
NDCI_RELATIVE_QUANTILE = 0.9


def process_month(client, lake_id: str, lake_ll, month: str, inlets: list) -> dict | None:
    row_f = CACHE / f"{lake_id}_{month}.json"
    if not row_f.exists():
        return None
    row = json.loads(row_f.read_text(encoding="utf-8"))
    base = {"lake_id": lake_id, "month": month}
    if row.get("status") != "ok":
        return {**base, "status": "no_optical_scene"}
    try:
        water_mask, valid, tr, crs = _load_npz(MASKS / f"{lake_id}_{month}.npz")
        item = client.get_collection(s2.COLLECTION).get_item(row["scene_id"])
        item = planetary_computer.sign(item)
        lake_utm, region_utm, bounds = s2.lake_masks(lake_ll, crs)
        hrefs = {b: item.assets[b].href for b in BANDS}
        refl, scl, tr2, _ = retry(s2.read_bands, hrefs, bounds, row["processing_baseline"])
        if tr2 != tr or scl.shape != water_mask.shape:
            return {**base, "status": "grid_mismatch"}
        lake_r = s2.rasterize(lake_utm, scl.shape, tr)
        region_r = s2.rasterize(region_utm, scl.shape, tr)

        nd = indices.ndci(refl["B05"], refl["B04"])
        fa = indices.fai(refl["B04"], refl["B08"], refl["B11"])
        core = indices.water_core(water_mask, valid) & lake_r
        out = {**base, "status": "ok", "date": row["date"], "scene_id": row["scene_id"]}
        out.update(indices.bloom_stats(nd, fa, core))
        if core.sum() >= 50:
            out["water_b02_median"] = round(float(np.nanmedian(refl["B02"][core])), 4)
            out["water_b11_median"] = round(float(np.nanmedian(refl["B11"][core])), 4)
        cloud = np.isin(scl, (3, 8, 9, 10))
        cloud_near = ndi.binary_dilation(cloud, iterations=indices.CLOUD_BUFFER_PX)

        foam = indices.foam_candidates(
            refl["B02"], refl["B03"], refl["B04"], refl["B08"], valid, water_mask, region_r,
            exclude=cloud_near,
        )
        near = None
        if inlets:
            pts = [reproject(p, "EPSG:4326", crs).buffer(INLET_RADIUS_M) for p in inlets]
            near = s2.rasterize(unary_union(pts), scl.shape, tr)
        out.update(indices.foam_summary(foam, near))
        out["n_inlet_points"] = len(inlets)
        if foam.any():
            gj = mask_to_geojson(foam, tr, crs)
            d = OUT / lake_id
            d.mkdir(parents=True, exist_ok=True)
            feature = {
                "type": "Feature",
                "properties": {"lake_id": lake_id, "date": row["date"], "kind": "foam_candidate"},
                "geometry": gj,
            }
            (d / f"{row['date']}_foam.geojson").write_text(json.dumps(feature), encoding="utf-8")
        return out
    except Exception as exc:
        return {**base, "status": "error", "error": f"{type(exc).__name__}: {exc}"[:300]}


def run(lake_ids: list[str], start: str, end: str, workers: int = 3) -> None:
    lakes = load_lakes()
    CAND_CACHE.mkdir(parents=True, exist_ok=True)
    client = s2.open_catalog()
    inlets = {
        lid: [Point(p["lon"], p["lat"]) for p in waterways.fetch_and_save(lid, lakes[lid][1])]
        for lid in lake_ids
    }
    jobs = []
    for lid in lake_ids:
        for m in months(start, end):
            f = CAND_CACHE / f"{lid}_{m}.json"
            if f.exists() and json.loads(f.read_text(encoding="utf-8")).get("status") != "error":
                continue
            jobs.append((lid, m, f))
    print(f"{len(jobs)} candidate lake-months", file=sys.stderr)

    def work(job):
        lid, m, f = job
        row = process_month(client, lid, lakes[lid][1], m, inlets[lid])
        if row is not None:
            f.write_text(json.dumps(row), encoding="utf-8")
            print(lid, m, row["status"], file=sys.stderr)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, jobs))


def build_series() -> None:
    rows: dict[str, list[dict]] = {}
    for f in sorted(CAND_CACHE.glob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        rows.setdefault(r["lake_id"], []).append(r)
    OUT.mkdir(parents=True, exist_ok=True)
    for lid, rs in rows.items():
        df = pd.DataFrame(rs).sort_values("month").reset_index(drop=True)
        ok_mask = df["status"] == "ok"
        # Contamination QC: "water" with high SWIR reflectance is cloud/haze, not water.
        df["qc_contaminated"] = ok_mask & (df["water_b11_median"] > indices.WATER_SWIR_CONTAMINATED)
        usable = ok_mask & ~df["qc_contaminated"]
        # Relative chlorophyll flag: this month's median NDCI is in the lake's own top decile
        # (computed over clean months only).
        cut = float(df.loc[usable, "ndci_median"].quantile(NDCI_RELATIVE_QUANTILE))
        df["ndci_top_decile_cut"] = cut
        df["chlorophyll_high_candidate"] = usable & (df["ndci_median"] >= cut)
        df.to_parquet(OUT / f"{lid}.parquet", index=False)
        mats = int((usable & (df["floating_mat_candidate"] == True)).sum())  # noqa: E712
        foam = int((usable & (df["foam_candidate_ha"] > 0)).sum())
        print(lid, df["status"].value_counts().to_dict(),
              "contaminated:", int(df["qc_contaminated"].sum()),
              "floating-mat months:", mats, "foam months:", foam,
              "NDCI top-decile cut:", round(cut, 3))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-candidates")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--lakes", nargs="+", default=None)
    r.add_argument("--start", default="2016-01")
    r.add_argument("--end", default=pd.Timestamp.today().strftime("%Y-%m"))
    r.add_argument("--workers", type=int, default=3)
    sub.add_parser("series")
    args = ap.parse_args(argv)
    if args.cmd == "run":
        run(args.lakes or list(load_lakes()), args.start, args.end, args.workers)
    build_series()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
