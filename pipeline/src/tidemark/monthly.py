"""Monthly radar extraction and optical/radar fusion.

    tidemark-monthly radar --start 2016-01 --end 2026-11    # Sentinel-1 per lake-month (cached)
    tidemark-monthly fuse                                   # combine with cached optical masks

Outputs: data/monthly/<lake>.parquet and data/monthly/<lake>/<YYYY-MM>.geojson.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio import windows
from rasterio.transform import Affine

from . import fusion, s2, sar, water
from .runner import CACHE_ROOT, MASKS, ROOT, item_crs, load_lakes, mask_to_geojson, months

RADAR_CACHE = CACHE_ROOT / "s1_months"
OUT_MONTHLY = ROOT / "data" / "monthly"
MAX_SCENES = 8  # per lake-month
MIN_REGION_COVERAGE = 0.9  # a radar scene must cover this fraction of the lake region
MIN_IOU_COVERAGE = 0.98  # optical coverage needed to compare optical vs radar
RADAR_BASE_CONFIDENCE = 0.7  # ~ mean IoU of radar vs clean optical (docs/radar_calibration.csv)


def retry(fn, *args, attempts: int = 5, base_delay: float = 3.0):
    """Call ``fn`` with linear backoff on transient network errors."""
    for i in range(attempts):
        try:
            return fn(*args)
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(base_delay * (i + 1))


def read_vv(href: str, bounds: tuple) -> tuple[np.ndarray, Affine]:
    """Read the VV window as float32 linear power with nan for no data."""
    with rasterio.open(href) as src:
        win = windows.from_bounds(*bounds, transform=src.transform)
        win = win.round_offsets().round_lengths()
        a = src.read(1, window=win, boundless=True, fill_value=sar.NODATA)
        tr = windows.transform(win, src.transform)
    a = a.astype("float32")
    a[a == sar.NODATA] = np.nan
    return a, tr


def search_radar(client, lake_ll, month: str):
    items = client.search(
        collections=["sentinel-1-rtc"],
        intersects=lake_ll.__geo_interface__,
        datetime=s2.month_range(month),
    ).items()
    return [i for i in items if "vv" in i.assets][:MAX_SCENES]


def process_radar_month(client, lake_id: str, lake_ll, month: str) -> dict:
    base = {"lake_id": lake_id, "month": month}
    try:
        items = retry(search_radar, client, lake_ll, month)
        if not items:
            return {**base, "status": "no_scene"}
        masks, valids, areas, dates = [], [], [], []
        grid = None
        for it in items:
            crs = item_crs(it)
            lake, region, bounds = s2.lake_masks(lake_ll, crs)
            power, tr = retry(read_vv, it.assets["vv"].href, bounds)
            if grid is None:
                grid = (tr, power.shape, crs, lake, region)
            elif tr != grid[0] or power.shape != grid[1]:
                continue  # different pixel grid; skip rather than resample silently
            region_r = s2.rasterize(region, power.shape, tr)
            res = sar.classify_sar(sar.to_db(sar.lee_filter(power)))
            if (res.valid & region_r).sum() < MIN_REGION_COVERAGE * max(region_r.sum(), 1):
                continue
            mask = water.clean_mask(res.mask)
            masks.append(mask)
            valids.append(res.valid)
            areas.append(water.area_ha(mask & region_r))
            dates.append(it.datetime.date().isoformat())
        if not masks:
            return {**base, "status": "no_valid_scene", "n_items": len(items)}
        tr, shape, crs, _, _ = grid
        mask, any_valid = sar.majority_vote(masks, valids)
        RADAR_CACHE.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            RADAR_CACHE / f"{lake_id}_{month}.npz",
            mask=mask, valid=any_valid, transform=np.array(tr)[:6], crs=crs,
        )
        return {
            **base,
            "status": "ok",
            "n_scenes": len(masks),
            "dates": dates,
            "scene_area_ha": [round(a, 3) for a in areas],
            "threshold_db": sar.THRESHOLD_DB,
        }
    except Exception as exc:
        return {**base, "status": "error", "error": f"{type(exc).__name__}: {exc}"[:300]}


def run_radar(lake_ids: list[str], start: str, end: str, workers: int = 4) -> None:
    lakes = load_lakes()
    RADAR_CACHE.mkdir(parents=True, exist_ok=True)
    client = s2.open_catalog()
    jobs = []
    for lid in lake_ids:
        _, geom = lakes[lid]
        for m in months(start, end):
            f = RADAR_CACHE / f"{lid}_{m}.json"
            if f.exists() and json.loads(f.read_text(encoding="utf-8")).get("status") != "error":
                continue
            jobs.append((lid, geom, m, f))
    print(f"{len(jobs)} radar lake-months to process", file=sys.stderr)

    def work(job):
        lid, geom, m, f = job
        row = process_radar_month(client, lid, geom, m)
        f.write_text(json.dumps(row), encoding="utf-8")
        print(f"{lid} {m} {row['status']}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, jobs))


def _load_npz(path: Path):
    z = np.load(path, allow_pickle=False)
    return z["mask"], z["valid"], Affine(*[float(v) for v in z["transform"]]), str(z["crs"])


def fuse_month(lake_id: str, lake_ll, month: str) -> tuple[dict, dict | None]:
    """Combine cached optical and radar results for one lake-month."""
    opt_row_f = CACHE_ROOT / "s2_rows" / f"{lake_id}_{month}.json"
    rad_row_f = RADAR_CACHE / f"{lake_id}_{month}.json"
    opt_row = json.loads(opt_row_f.read_text(encoding="utf-8")) if opt_row_f.exists() else {}
    rad_row = json.loads(rad_row_f.read_text(encoding="utf-8")) if rad_row_f.exists() else {}
    out = {
        "lake_id": lake_id,
        "month": month,
        "optical_status": opt_row.get("status"),
        "radar_status": rad_row.get("status"),
        "mapped_area_ha": opt_row.get("mapped_area_ha"),
    }
    opt = _load_npz(MASKS / f"{lake_id}_{month}.npz") if opt_row.get("status") == "ok" else None
    rad = (
        _load_npz(RADAR_CACHE / f"{lake_id}_{month}.npz")
        if rad_row.get("status") == "ok"
        else None
    )
    if opt is None and rad is None:
        return {**out, "source": "none"}, None

    ref = opt if opt is not None else rad
    _, _, tr, crs = ref
    shape = ref[0].shape
    lake_utm, region_utm, _ = s2.lake_masks(lake_ll, crs)
    lake_r = s2.rasterize(lake_utm, shape, tr)
    region_r = s2.rasterize(region_utm, shape, tr)

    om = ov = rm = rv = None
    if opt is not None:
        om, ov = opt[0], opt[1]
    if rad is not None:
        rm = fusion.align_mask(rad[0], rad[2], tr, shape, crs)
        rv = fusion.align_mask(rad[1], rad[2], tr, shape, crs)
    f = fusion.fuse(om, ov, rm, rv, region_r)
    mask = water.lake_component(f.mask, lake_r, region_r)

    area, unc = water.area_ha(mask), water.area_uncertainty_ha(mask)
    opt_conf = float(opt_row.get("confidence", 0.0)) if opt is not None else 0.0
    rad_conf = 0.0
    if rad is not None:
        # calibrated mean agreement with optical (IoU ~0.7), lower for a single scene
        rad_conf = RADAR_BASE_CONFIDENCE * (1.0 if rad_row["n_scenes"] >= 2 else 0.8)
    if f.source == "optical":
        conf = opt_conf
    elif f.source == "radar":
        conf = rad_conf * f.known_fraction
    else:
        conf = f.optical_coverage * opt_conf + (f.known_fraction - f.optical_coverage) * rad_conf
    agree = float("nan")
    if opt is not None and rm is not None and f.optical_coverage >= MIN_IOU_COVERAGE:
        agree = fusion.iou(om & ov & region_r, rm & rv & region_r, ov & rv & region_r)
    rad_area = (
        water.area_ha(rm & rv & region_r) if rm is not None else float("nan")
    )
    out.update(
        source=f.source,
        water_area_ha=round(area, 3),
        water_area_unc_ha=round(unc, 3),
        confidence=round(float(conf), 3),
        optical_coverage=round(f.optical_coverage, 3),
        known_fraction=round(f.known_fraction, 3),
        optical_area_ha=opt_row.get("water_area_ha"),
        radar_area_ha=round(rad_area, 3) if rad_area == rad_area else None,
        radar_n_scenes=rad_row.get("n_scenes"),
        optical_radar_iou=round(agree, 3) if agree == agree else None,
        optical_date=opt_row.get("date"),
    )
    gj = mask_to_geojson(mask, tr, crs)
    feat = None
    if gj:
        feat = {
            "type": "Feature",
            "properties": {k: out[k] for k in ("lake_id", "month", "source", "water_area_ha")},
            "geometry": gj,
        }
    return out, feat


def fuse_all(lake_ids: list[str] | None = None) -> None:
    lakes = load_lakes()
    OUT_MONTHLY.mkdir(parents=True, exist_ok=True)
    for lid in lake_ids or list(lakes):
        _, geom = lakes[lid]
        months_found = sorted(
            {p.stem.split("_", 1)[1] for p in (CACHE_ROOT / "s2_rows").glob(f"{lid}_*.json")}
            | {p.stem.split("_", 1)[1] for p in RADAR_CACHE.glob(f"{lid}_*.json")}
        )
        rows = []
        d = OUT_MONTHLY / lid
        d.mkdir(parents=True, exist_ok=True)
        for m in months_found:
            row, feat = fuse_month(lid, geom, m)
            rows.append(row)
            if feat:
                (d / f"{m}.geojson").write_text(json.dumps(feat), encoding="utf-8")
        df = pd.DataFrame(rows)
        df.to_parquet(OUT_MONTHLY / f"{lid}.parquet", index=False)
        print(lid, len(df), df["source"].value_counts().to_dict())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-monthly")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("radar")
    r.add_argument("--lakes", nargs="+", default=None)
    r.add_argument("--start", default="2016-01")
    r.add_argument("--end", default=pd.Timestamp.today().strftime("%Y-%m"))
    r.add_argument("--workers", type=int, default=4)
    f = sub.add_parser("fuse")
    f.add_argument("--lakes", nargs="+", default=None)
    args = ap.parse_args(argv)
    if args.cmd == "radar":
        run_radar(args.lakes or list(load_lakes()), args.start, args.end, args.workers)
    else:
        fuse_all(args.lakes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
