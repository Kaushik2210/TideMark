"""Compare our water frequency maps with JRC Global Surface Water (Planetary Computer `jrc-gsw`).

JRC products used (v1.3, covering 1984-2020, 30 m):
  occurrence   % of valid Landsat observations 1984-2020 that were water
  seasonality  months with water in 2020 (the last year of the release)
Ours: share of clean Sentinel-2 months that are water, 2016-2020 (for occurrence) or 2020
(for seasonality). The two are different sensors, resolutions and periods, so agreement is a
sanity check, not an accuracy figure. JRC values are resampled to our 10 m grid (nearest).
"""

from __future__ import annotations

import numpy as np
from rasterio.transform import array_bounds
from rasterio.warp import transform_bounds

from . import s2, worldcover
from .encroachment import clean_months, load_stack, wet_frequency
from .runner import load_lakes
from .validation import agreement

COLLECTION = "jrc-gsw"
OVERLAP_YEARS = (2016, 2017, 2018, 2019, 2020)


def scene_availability(client, lake_ll, start, end, pad_days: int) -> dict:
    """Sentinel-2 L2A scenes over the lake in an event window: how many, and how cloudy.

    Context for "not observed" foam events: were there scenes at all that the monthly
    best-scene design skipped, and were they usable?
    """
    import pandas as pd

    lo = (pd.Timestamp(start) - pd.Timedelta(days=pad_days)).date().isoformat()
    hi = (pd.Timestamp(end) + pd.Timedelta(days=pad_days)).date().isoformat()
    items = list(client.search(collections=["sentinel-2-l2a"],
                               intersects=lake_ll.__geo_interface__,
                               datetime=f"{lo}/{hi}").items())
    def cloud(item) -> float:
        return float(item.properties.get("eo:cloud_cover", 100))

    scenes = sorted((i.datetime.date().isoformat(), round(cloud(i), 1)) for i in items)
    ids = {i.datetime.date().isoformat():
           (i.id, i.properties.get("s2:processing_baseline"), cloud(i)) for i in items}
    return {"window": f"{lo}..{hi}", "scenes": len(scenes), "dates_and_tile_cloud_pct": scenes,
            "scene_ids": ids}


def foam_on_scene(client, lake_id: str, lake_ll, scene_id: str, baseline: str) -> dict:
    """Run the water mask, haze QC and foam-candidate rule on one arbitrary Sentinel-2 scene.

    Same functions and thresholds as the monthly pipeline, applied to a scene the monthly
    best-scene selection did not pick. Returns foam hectares and the haze flag.
    """
    import planetary_computer
    from scipy import ndimage as ndi

    from . import candidates, indices

    item = planetary_computer.sign(client.get_collection(s2.COLLECTION).get_item(scene_id))
    crs = item.properties.get("proj:code") or f"EPSG:{item.properties['proj:epsg']}"
    lake, region, bounds = s2.lake_masks(lake_ll, crs)
    refl, scl, tr, crs = s2.read_bands({b: item.assets[b].href for b in candidates.BANDS}, bounds,
                                       baseline)
    win = s2.Window(green=refl["B03"], swir=refl["B11"], scl=scl, transform=tr, crs=crs)
    ex = s2.extract_extent(win, lake, region)
    lake_r = s2.rasterize(lake, scl.shape, tr)
    region_r = s2.rasterize(region, scl.shape, tr)
    core = indices.water_core(ex.mask, ex.valid) & lake_r
    b11 = float(np.nanmedian(refl["B11"][core])) if core.sum() >= 50 else None
    cloud = np.isin(scl, (3, 8, 9, 10))
    near_cloud = ndi.binary_dilation(cloud, iterations=indices.CLOUD_BUFFER_PX)
    foam = indices.foam_candidates(refl["B02"], refl["B03"], refl["B04"], refl["B08"], ex.valid,
                                   ex.mask, region_r, exclude=near_cloud)
    return {"scene_id": scene_id, "water_ha": ex.row["water_area_ha"],
            "water_b11_median": None if b11 is None else round(b11, 4),
            "haze_contaminated": bool(b11 is not None and b11 > indices.WATER_SWIR_CONTAMINATED),
            "foam_candidate_ha": round(float(foam.sum()) * indices.FOAM_PX_AREA_HA, 3)}


def jrc_href(client, bbox_ll, asset: str) -> str:
    items = list(client.search(collections=[COLLECTION], bbox=bbox_ll).items())
    if not items:
        raise LookupError(f"no JRC tile for {bbox_ll}")
    return items[0].assets[asset].href


def run_jrc() -> dict:
    client = s2.open_catalog()
    out = {}
    for lid, (_, geom) in load_lakes().items():
        months = clean_months(lid, OVERLAP_YEARS)
        masks, valids, tr, crs = load_stack(lid, months)
        shape = masks.shape[1:]
        freq, n = wet_frequency(masks, valids)
        freq = np.where(n >= 3, freq, np.nan)
        lake_utm, _, _ = s2.lake_masks(geom, crs)
        region = s2.rasterize(lake_utm.buffer(100.0), shape, tr)

        bb = transform_bounds(crs, "EPSG:4326", *array_bounds(shape[0], shape[1], tr))
        occ = worldcover.read_to_grid(jrc_href(client, bb, "occurrence"), tr, shape, crs)
        seas = worldcover.read_to_grid(jrc_href(client, bb, "seasonality"), tr, shape, crs)

        res = {"clean_months_2016_2020": len(months),
               "occurrence_1984_2020": agreement(freq, occ, 100.0, region)}
        m20 = [m for m in months if m.startswith("2020")]
        if len(m20) >= 3:
            mk, vl, _, _ = load_stack(lid, m20)
            f20, n20 = wet_frequency(mk, vl)
            f20 = np.where(n20 >= 3, f20, np.nan)
            res["seasonality_2020"] = {"clean_months_2020": len(m20),
                                       **agreement(f20, seas, 12.0, region, cuts=(0.25, 0.5, 0.75))}
        out[lid] = res
    return out
