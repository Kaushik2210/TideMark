"""Encroachment candidates: where open water has been replaced by built-up land.

    tidemark-encroach            # writes data/encroachment/<lake>.json and summary.json

Idea: a dried lakebed is bare mud, which spectral built-up indices confuse with roofs (see
docs/encroachment.md for the failed attempt). Instead the candidate is a pixel that
  (1) was usually water in the early period (2016-2018),
  (2) is almost never water in the recent period (2023-2026), measured on clean optical months,
  (3) and is built-up now according to ESA WorldCover 2021 and/or Microsoft building footprints.
Water-level swings do not qualify (a refilled lake is water again), and dry bare lakebed is not
built-up in either reference. Results are encroachment *candidates* relative to the OSM outline,
not survey or legal findings.
"""

from __future__ import annotations

import argparse
import json
from itertools import product

import numpy as np
import pandas as pd
from rasterio.transform import array_bounds
from rasterio.warp import transform_bounds
from scipy import ndimage as ndi

from . import buildings, s2, worldcover
from .monthly import _load_npz
from .runner import CACHE, MASKS, ROOT, load_lakes

OUT = ROOT / "data" / "encroachment"
PX_HA = 0.01
RING_NEAR_M, RING_FAR_M = 100.0, 300.0
EARLY_YEARS = (2016, 2017, 2018)
RECENT_YEARS = (2023, 2024, 2025, 2026)
MIN_OBS_EARLY = 3  # clean observations a pixel needs in each period
MIN_OBS_RECENT = 4
# Central choice and the grid used for the uncertainty range.
EARLY_WET_MIN = (0.50, 0.25, 0.10)  # share of early observations that must be water
RECENT_WET_MAX = (0.0, 0.05, 0.15)  # share of recent observations allowed to be water
CENTRAL = (0.25, 0.05)


# ---- pure functions --------------------------------------------------------------------


def ring_masks(lake_r: np.ndarray, pixel_m: float = 10.0):
    """(inside outline, 0-100 m ring, 100-300 m ring) around the outline."""
    dist = ndi.distance_transform_edt(~lake_r) * pixel_m
    return lake_r, (~lake_r) & (dist <= RING_NEAR_M), (dist > RING_NEAR_M) & (dist <= RING_FAR_M)


def wet_frequency(masks: np.ndarray, valids: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel share of valid observations that are water, and the observation count.

    ``masks``/``valids`` are (n, rows, cols) booleans. Pixels never observed get nan.
    """
    n = valids.sum(axis=0)
    wet = (masks & valids).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        freq = np.where(n > 0, wet / np.where(n > 0, n, 1), np.nan)
    return freq, n


def lost_water(early_freq, early_n, recent_freq, recent_n, early_min: float, recent_max: float,
               region: np.ndarray) -> np.ndarray:
    """Pixels usually water early, rarely water recently, with enough observations both times."""
    return (region & (early_n >= MIN_OBS_EARLY) & (recent_n >= MIN_OBS_RECENT)
            & (early_freq >= early_min) & (recent_freq <= recent_max))


def lost_to_built(lost: np.ndarray, wc_built: np.ndarray, bld: np.ndarray) -> dict:
    """Area (ha) of ``lost`` pixels that are built-up per WorldCover, buildings, both, either."""
    return {
        "lost_ha": round(float(lost.sum()) * PX_HA, 2),
        "built_worldcover_ha": round(float((lost & wc_built).sum()) * PX_HA, 2),
        "built_buildings_ha": round(float((lost & bld).sum()) * PX_HA, 2),
        "built_both_ha": round(float((lost & wc_built & bld).sum()) * PX_HA, 2),
        "built_either_ha": round(float((lost & (wc_built | bld)).sum()) * PX_HA, 2),
    }


def sensitivity(early_freq, early_n, recent_freq, recent_n, region, wc_built, bld) -> dict:
    """Central estimate plus low/high over the threshold grid and the two built-up definitions.

    low = fewest pixels counted (both references must agree); high = most (either reference).
    """
    rows = []
    for early_min, recent_max in product(EARLY_WET_MIN, RECENT_WET_MAX):
        lost = lost_water(early_freq, early_n, recent_freq, recent_n, early_min, recent_max, region)
        rows.append({"early_min": early_min, "recent_max": recent_max,
                     **lost_to_built(lost, wc_built, bld)})
    table = pd.DataFrame(rows)
    c = table[(table.early_min == CENTRAL[0]) & (table.recent_max == CENTRAL[1])].iloc[0]
    keys = ("lost_ha", "built_both_ha", "built_either_ha", "built_worldcover_ha",
            "built_buildings_ha")
    return {
        "central": {k: float(c[k]) for k in keys},
        "low_ha": float(table["built_both_ha"].min()),
        "high_ha": float(table["built_either_ha"].max()),
        "grid": table.round(2).to_dict("records"),
    }


# ---- I/O ---------------------------------------------------------------------------------


def clean_months(lake_id: str, years: tuple[int, ...]) -> list[str]:
    """Months with an optical extent and no haze contamination, within ``years``."""
    cand_f = ROOT / "data" / "candidates" / f"{lake_id}.parquet"
    hazy = set()
    if cand_f.exists():
        c = pd.read_parquet(cand_f)
        hazy = set(c.loc[c["qc_contaminated"].fillna(False).astype(bool), "month"])
    out = []
    for f in sorted(CACHE.glob(f"{lake_id}_*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        if r.get("status") == "ok" and int(r["month"][:4]) in years and r["month"] not in hazy:
            out.append(r["month"])
    return out


def load_stack(lake_id: str, months: list[str]):
    """(masks, valids, transform, crs) for months that share one pixel grid."""
    masks, valids, ref = [], [], None
    for m in months:
        mask, valid, tr, crs = _load_npz(MASKS / f"{lake_id}_{m}.npz")
        if ref is None:
            ref = (tr, crs, mask.shape)
        if (tr, mask.shape) != (ref[0], ref[2]):
            continue
        masks.append(mask)
        valids.append(valid)
    if not masks:
        raise ValueError(f"{lake_id}: no usable months")
    return np.stack(masks), np.stack(valids), ref[0], ref[1]


def class_summary(wc: np.ndarray, region: np.ndarray) -> dict:
    f = worldcover.class_fractions(wc, region)
    return {"built_up_share": f.get("built-up", 0.0), "classes": f}


def share(mask: np.ndarray, region: np.ndarray) -> float | None:
    return round(float(mask[region].mean()), 4) if region.any() else None


def pct(part: float, whole: float) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def analyse_lake(lake_id: str, props: dict, lake_ll, client, figure=None) -> dict:
    early_m, recent_m = clean_months(lake_id, EARLY_YEARS), clean_months(lake_id, RECENT_YEARS)
    em, ev, tr, crs = load_stack(lake_id, early_m)
    rm, rv, tr2, _ = load_stack(lake_id, recent_m)
    if tr2 != tr or rm.shape[1:] != em.shape[1:]:
        raise ValueError(f"{lake_id}: early and recent grids differ")
    shape = em.shape[1:]
    lake_utm, _, _ = s2.lake_masks(lake_ll, crs)
    lake_r = s2.rasterize(lake_utm, shape, tr)
    inside, near, ring = ring_masks(lake_r)
    footprint_region = inside | near  # outline plus 100 m: water just outside the OSM edge

    bb = transform_bounds(crs, "EPSG:4326", *array_bounds(shape[0], shape[1], tr))
    wc = {y: worldcover.read_to_grid(worldcover.find_map_href(client, y, bb), tr, shape, crs)
          for y in worldcover.VERSIONS}
    bld = buildings.rasterize(buildings.load_footprints(lake_id), crs, shape, tr)
    wc_built = wc[2021] == worldcover.BUILT_UP

    ef, en = wet_frequency(em, ev)
    rf, rn = wet_frequency(rm, rv)
    sens = sensitivity(ef, en, rf, rn, footprint_region, wc_built, bld)
    early_wet = (ef >= CENTRAL[0]) & (en >= MIN_OBS_EARLY) & footprint_region
    recent_wet = (rf >= CENTRAL[0]) & (rn >= MIN_OBS_RECENT) & footprint_region
    early_ha, recent_ha = float(early_wet.sum()) * PX_HA, float(recent_wet.sum()) * PX_HA
    c = sens["central"]
    lost_c = lost_water(ef, en, rf, rn, CENTRAL[0], CENTRAL[1], footprint_region)
    if figure is not None:
        draw_figure(figure, props["name"], lake_r, ef, rf, lost_c, wc_built, bld)
    return {
        "lake_id": lake_id,
        "outline_ha": props["area_ha"],
        "outline_source": "OpenStreetMap (no official boundary available)",
        "periods": {"early": list(EARLY_YEARS), "recent": list(RECENT_YEARS),
                    "early_clean_months": len(early_m), "recent_clean_months": len(recent_m)},
        "wet_footprint_early_ha": round(early_ha, 2),
        "wet_footprint_recent_ha": round(recent_ha, 2),
        "lost_water_ha": c["lost_ha"],
        # what the lost-water pixels are now: WorldCover 2021 classes and building cover
        "lost_water_now_worldcover_2021": class_summary(wc[2021], lost_c)["classes"],
        "lost_water_now_building_share": share(bld, lost_c),
        "lost_water_pct_of_early_footprint": pct(c["lost_ha"], early_ha),
        "lost_water_now_built_ha": {"central_either": c["built_either_ha"],
                                    "central_both": c["built_both_ha"],
                                    "low": sens["low_ha"], "high": sens["high_ha"]},
        "lost_water_now_built_pct_of_early_footprint": {
            "central_either": pct(c["built_either_ha"], early_ha),
            "low": pct(sens["low_ha"], early_ha), "high": pct(sens["high_ha"], early_ha)},
        "sensitivity_grid": sens["grid"],
        "snapshot": {
            "worldcover_2020": {"inside_outline": class_summary(wc[2020], inside),
                                "ring_100_300m": class_summary(wc[2020], ring)},
            "worldcover_2021": {"inside_outline": class_summary(wc[2021], inside),
                                "ring_100_300m": class_summary(wc[2021], ring)},
            "building_footprints": {
                "imagery": buildings.IMAGERY_DATES,
                "inside_outline_share": share(bld, inside),
                "ring_0_100m_share": share(bld, near),
                "ring_100_300m_share": share(bld, ring),
                "inside_outline_ha": round(float((bld & inside).sum()) * PX_HA, 2)},
        },
    }


def draw_figure(path, name, lake_r, early_freq, recent_freq, lost, wc_built, bld) -> None:
    """Early vs recent water frequency, and lost-water pixels over built-up references."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(1, 3, figsize=(13, 3.9), facecolor="#0b1220")
    for a, freq, title in ((ax[0], early_freq, "Water frequency, 2016-2018"),
                           (ax[1], recent_freq, "Water frequency, 2023-2026")):
        a.imshow(freq, vmin=0, vmax=1, cmap="Blues")
        a.set_title(title, color="#e6edf7", fontsize=10)
    ax[2].imshow(np.zeros(lake_r.shape), cmap="gray", vmin=0, vmax=1)
    ax[2].imshow(np.where(wc_built, 1.0, np.nan), cmap="Greys", vmin=0, vmax=2, alpha=0.9)
    ax[2].imshow(np.where(bld, 1.0, np.nan), cmap="Oranges", vmin=0, vmax=1.3, alpha=0.9)
    from matplotlib.colors import ListedColormap

    ax[2].imshow(np.where(lost, 1.0, np.nan), cmap=ListedColormap(["#ef4444"]), vmin=0, vmax=1)
    ax[2].set_title("Lost water (red) vs built-up: WorldCover (grey), buildings (orange)",
                    color="#e6edf7", fontsize=9)
    for a in ax:
        a.contour(lake_r, [0.5], colors="#fbbf24", linewidths=0.6)
        a.axis("off")
    note = "research, unvalidated; outline is OpenStreetMap, not an official boundary"
    fig.suptitle(f"{name}: lost water vs built-up ({note})", color="#8aa0b8", fontsize=8, y=0.02)
    fig.savefig(path, dpi=100, facecolor="#0b1220", bbox_inches="tight", pad_inches=0.15)
    plt.close(fig)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-encroach")
    ap.add_argument("--lakes", nargs="+", default=None)
    args = ap.parse_args(argv)
    lakes = load_lakes()
    client = s2.open_catalog()
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {}
    for lid in args.lakes or list(lakes):
        props, geom = lakes[lid]
        minx, miny, maxx, maxy = geom.buffer(0.01).bounds
        n = buildings.fetch_lake_footprints(lid, (minx, miny, maxx, maxy))
        res = analyse_lake(lid, props, geom, client,
                           figure=ROOT / "docs" / "media" / lid / "encroachment.png")
        res["building_footprints_in_window"] = n
        (OUT / f"{lid}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
        summary[lid] = {k: res[k] for k in (
            "outline_ha", "wet_footprint_early_ha", "wet_footprint_recent_ha", "lost_water_ha",
            "lost_water_pct_of_early_footprint", "lost_water_now_built_ha")}
        print(lid, json.dumps(summary[lid]))
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
