"""Build dated, georeferenced city overviews from the optical scene inventory."""

from __future__ import annotations

import io
import json
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests
from PIL import Image

from .runner import ROOT

OUT = ROOT / "web/public/data/scenes"
BBOX = (77.4, 12.7, 77.8, 13.2)
SIZE = (900, 1155)
API = "https://planetarycomputer.microsoft.com/api/data/v1/item"


def select_scenes(rows):
    """Pick one actual overpass per month for a spatially consistent city view."""
    rows = rows.dropna(subset=["scene_id", "date", "scene_cloud_pct"]).copy()
    rows = rows[rows.date.str[:7] == rows.month]
    ranked = rows.sort_values(["month", "scene_cloud_pct", "scene_id"])
    return ranked.drop_duplicates("month").sort_values("month")


def fetch_overview(row):
    filename = f"{row.scene_id}.webp"
    path = OUT / filename
    if not path.exists():
        bbox = ",".join(map(str, BBOX))
        width, height = SIZE
        url = f"{API}/bbox/{bbox}/{width}x{height}.png"
        params = dict(collection="sentinel-2-l2a", item=row.scene_id, assets="visual",
                      dst_crs="EPSG:3857", resampling="bilinear")
        for attempt in range(4):
            try:
                response = requests.get(url, params=params, timeout=90)
                response.raise_for_status()
                with Image.open(io.BytesIO(response.content)) as image:
                    if image.format != "PNG" or image.size != SIZE:
                        raise ValueError(f"Unexpected scene raster for {row.month}")
                    tmp = path.with_suffix(".tmp")
                    image.save(tmp, format="WEBP", quality=83, method=4)
                    tmp.replace(path)
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(2 ** (attempt + 1))
        print(row.month, flush=True)
    thumb = OUT / "thumbs" / filename
    if not thumb.exists():
        thumb.parent.mkdir(exist_ok=True)
        with Image.open(path) as image:
            image.thumbnail((160, 200))
            image.save(thumb, quality=75)
    return row.month, {"date": row.date, "item": row.scene_id,
                       "sceneCloud": row.scene_cloud_pct, "file": filename}


def main():
    tables = sorted((ROOT / "data/timeseries").glob("*.parquet"))
    rows = select_scenes(pd.concat([pd.read_parquet(p) for p in tables]))
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        months = dict(pool.map(fetch_overview, rows.itertuples()))
    index = OUT / "index.json"
    tmp = index.with_suffix(".tmp")
    tmp.write_text(json.dumps({"bbox": BBOX, "months": months}, separators=(",", ":")))
    tmp.replace(index)
    print(f"{len(months)} dated scenes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
