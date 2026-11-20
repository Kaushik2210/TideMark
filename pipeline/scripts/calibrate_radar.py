"""Calibrate the Sentinel-1 water threshold against clean optical masks.

For lake-months where the optical mask covers >= 98% of the lake region, read the radar scene
closest in date to the optical acquisition, and measure how well different VV thresholds (and
per-scene Otsu) reproduce the optical water mask (IoU). This is a cross-sensor consistency
check, NOT independent ground truth: optical water is itself an estimate.

    python scripts/calibrate_radar.py --per-lake 14 --out ../docs/radar_calibration.csv
"""

from __future__ import annotations

import argparse
import json
from datetime import date

import numpy as np
import pandas as pd
from rasterio.warp import Resampling, reproject

from tidemark import fusion, s2, sar, water
from tidemark.monthly import _load_npz, read_vv, search_radar
from tidemark.runner import CACHE, MASKS, load_lakes

THRESHOLDS = np.arange(-24.0, -3.0, 1.0)


def candidates(lake_id: str, per_lake: int) -> list[dict]:
    rows = []
    for f in sorted(CACHE.glob(f"{lake_id}_*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        if r.get("status") == "ok" and (MASKS / f"{lake_id}_{r['month']}.npz").exists():
            rows.append(r)
    rows = [r for r in rows if r["water_area_ha"] >= 5.0 and r["region_bad_fraction"] <= 0.02]
    if len(rows) > per_lake:
        idx = np.linspace(0, len(rows) - 1, per_lake).round().astype(int)
        rows = [rows[i] for i in sorted(set(idx))]
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-lake", type=int, default=12)
    ap.add_argument("--out", default="radar_calibration.csv")
    args = ap.parse_args()
    lakes = load_lakes()
    client = s2.open_catalog()
    out = []
    for lid, (_, geom) in lakes.items():
        for r in candidates(lid, args.per_lake):
            try:
                om, ov, tr, crs = _load_npz(MASKS / f"{lid}_{r['month']}.npz")
                lake, region, bounds = s2.lake_masks(geom, crs)
                items = search_radar(client, geom, r["month"])
                if not items:
                    continue
                d0 = date.fromisoformat(r["date"])
                it = min(items, key=lambda i: abs((i.datetime.date() - d0).days))
                p, rtr = read_vv(it.assets["vv"].href, bounds)
                db = sar.to_db(sar.lee_filter(p))
                shape = om.shape
                region_r = s2.rasterize(region, shape, tr)
                if rtr == tr and db.shape == shape:
                    dbg = db
                else:  # different pixel grid: nearest-neighbour resample dB onto optical grid
                    dbg = np.full(shape, np.nan, dtype="float32")
                    reproject(db, dbg, src_transform=rtr, src_crs=crs, dst_transform=tr,
                              dst_crs=crs, resampling=Resampling.nearest, src_nodata=np.nan,
                              dst_nodata=np.nan)
                where = ov & np.isfinite(dbg) & region_r
                opt = om & where
                rec = {"lake_id": lid, "month": r["month"], "optical_date": r["date"],
                       "radar_date": it.datetime.date().isoformat(),
                       "days_apart": abs((it.datetime.date() - d0).days),
                       "optical_ha": round(water.area_ha(opt), 2)}
                ot, sep = water.otsu_threshold(dbg[np.isfinite(dbg)], value_range=sar.DB_RANGE)
                rec["otsu_db"], rec["otsu_sep"] = round(ot, 2), round(sep, 3)
                best = (-1.0, None)
                for t in THRESHOLDS:
                    i = fusion.iou(opt, (dbg < t) & where, where)
                    rec[f"iou_{int(t)}"] = round(i, 3)
                    if i > best[0]:
                        best = (i, t)
                rec["best_db"], rec["best_iou"] = best[1], round(best[0], 3)
                rec["iou_at_otsu"] = round(fusion.iou(opt, (dbg < ot) & where, where), 3)
                out.append(rec)
                print(
                    lid, r["month"], "otsu", rec["otsu_db"], "best", rec["best_db"],
                    rec["best_iou"], "iou@-18", rec["iou_-18"], "iou@otsu", rec["iou_at_otsu"],
                    flush=True,
                )
            except Exception as exc:  # keep going; report what failed
                print("skip", lid, r["month"], type(exc).__name__, str(exc)[:100], flush=True)
    pd.DataFrame(out).to_csv(args.out, index=False)
    print("wrote", args.out, len(out), "rows")


if __name__ == "__main__":
    main()
