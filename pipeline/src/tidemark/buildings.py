"""Microsoft Building Footprints (Planetary Computer ``ms-buildings``, ODbL 1.0).

A static snapshot derived from Bing imagery acquired 2017-03-30 to 2021-07-25 for this region:
buildings are not dated individually, so this gives where buildings stood around 2017-2021, not
when they appeared. Only per-lake aggregates are published in ``data/`` (the footprints
themselves stay in the local cache).
"""

from __future__ import annotations

import numpy as np
import pyarrow as pa
import pyarrow.dataset as ds
import pyarrow.parquet as pq
import shapely
from rasterio import features

from .geometry import reproject
from .runner import CACHE_ROOT

ACCOUNT, CONTAINER = "bingmlbuildings", "footprints"
RELEASE = "delta/2023-04-25"
# Zoom-9 quadkey cell containing Bengaluru (all three lakes fall inside it).
PATH = f"{CONTAINER}/{RELEASE}/ml-buildings.parquet/RegionName=India/quadkey=123303312"
IMAGERY_DATES = "2017-03-30 to 2021-07-25"
CACHE = CACHE_ROOT / "buildings"
BATCH = 250_000


def fetch_lake_footprints(lake_id: str, bbox_ll: tuple[float, float, float, float]) -> int:
    """Stream the partition and cache the footprints that intersect ``bbox_ll``. Returns count."""
    out = CACHE / f"{lake_id}.parquet"
    if out.exists():
        return pq.read_metadata(out).num_rows
    import adlfs
    import planetary_computer

    token = planetary_computer.sas.get_token(ACCOUNT, CONTAINER).token
    fs = adlfs.AzureBlobFileSystem(account_name=ACCOUNT, credential=token)
    dataset = ds.dataset(PATH, filesystem=fs, format="parquet")
    w, s, e, n = bbox_ll
    kept: list[bytes] = []
    for batch in dataset.to_batches(columns=["geometry"], batch_size=BATCH):
        geoms = shapely.from_wkb(batch.column("geometry").to_numpy(zero_copy_only=False))
        b = shapely.bounds(geoms)
        hit = (b[:, 2] >= w) & (b[:, 0] <= e) & (b[:, 3] >= s) & (b[:, 1] <= n)
        kept.extend(shapely.to_wkb(geoms[hit]).tolist())
    CACHE.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.table({"geometry": pa.array(kept, type=pa.binary())}), out)
    return len(kept)


def load_footprints(lake_id: str) -> np.ndarray:
    t = pq.read_table(CACHE / f"{lake_id}.parquet")
    return shapely.from_wkb(t.column("geometry").to_numpy(zero_copy_only=False))


def rasterize(geoms_ll: np.ndarray, crs: str, shape: tuple[int, int], transform) -> np.ndarray:
    """Boolean raster of pixels whose centre lies inside a building (grid CRS ``crs``)."""
    if len(geoms_ll) == 0:
        return np.zeros(shape, dtype=bool)
    projected = reproject(geoms_ll, "EPSG:4326", crs)
    shapes = [(g, 1) for g in projected if g is not None and not g.is_empty]
    if not shapes:
        return np.zeros(shape, dtype=bool)
    return features.rasterize(shapes, out_shape=shape, transform=transform, fill=0,
                              dtype="uint8").astype(bool)
