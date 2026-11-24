"""Export pipeline outputs as the static data bundle used by the website (web/public).

    tidemark-export

Produces:
  web/public/data/lakes.json                 lake index (name, outline, health, coverage)
  web/public/data/lakes.geojson              OSM outlines (ODbL)
  web/public/data/ghost_lakes.geojson        approximate points (CC BY-SA)
  web/public/data/series/<lake>.json         one row per month, all signals
  web/public/data/events/<lake>.json         flagged events
  web/public/data/health/<lake>.json         health score and its inputs
  web/public/data/extents/<lake>/<month>.geojson
  web/public/data/validation.json            headline validation results
  web/public/downloads/*                     CSV / GeoJSON for the data page
Nothing is computed here that is not already in data/; the site only reads these files.
"""

from __future__ import annotations

import json
import shutil

import pandas as pd

from . import jsonsafe
from .runner import ROOT, load_lakes

WEB = ROOT / "web" / "public"
DATA, DL = WEB / "data", WEB / "downloads"
SERIES_COLS = {
    "month": "month", "source": "source", "water_area_ha": "area_ha",
    "water_area_unc_ha": "unc_ha", "confidence": "confidence", "optical_date": "optical_date",
    "optical_coverage": "optical_coverage", "optical_area_ha": "optical_ha",
    "radar_area_ha": "radar_ha", "radar_n_scenes": "radar_scenes",
}
CAND_COLS = {
    "ndci_median": "ndci_median", "fai_frac": "fai_frac", "floating_mat_candidate": "floating_mat",
    "foam_candidate_ha": "foam_ha", "qc_contaminated": "haze",
    "chlorophyll_high_candidate": "chl_high",
}


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> JSON-safe records (NaN becomes null)."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


def write_json(path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = jsonsafe.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    path.write_text(text, encoding="utf-8")


def monthly_rain(lake_id: str) -> pd.Series:
    daily = pd.read_parquet(ROOT / "data" / "rainfall" / f"{lake_id}.parquet")
    daily["month"] = daily["date"].dt.strftime("%Y-%m")
    return daily.groupby("month")["precip_mm"].sum().round(1)


def lake_series(lake_id: str) -> pd.DataFrame:
    monthly = pd.read_parquet(ROOT / "data" / "monthly" / f"{lake_id}.parquet")
    cand = pd.read_parquet(ROOT / "data" / "candidates" / f"{lake_id}.parquet")
    out = monthly[list(SERIES_COLS)].rename(columns=SERIES_COLS)
    c = cand[["month", *CAND_COLS]].rename(columns=CAND_COLS)
    out = out.merge(c, on="month", how="left")
    out["rain_mm"] = out["month"].map(monthly_rain(lake_id))
    return out.sort_values("month").reset_index(drop=True)


def main() -> int:
    lakes = load_lakes()
    DATA.mkdir(parents=True, exist_ok=True)
    DL.mkdir(parents=True, exist_ok=True)
    index = []
    for lid, (props, geom) in lakes.items():
        s = lake_series(lid)
        write_json(DATA / "series" / f"{lid}.json", records(s))
        have = s[s["source"].isin(["optical", "fused", "radar"])]
        last = have.iloc[-1]
        health = json.loads((ROOT / "data" / "health" / f"{lid}.json").read_text(encoding="utf-8"))
        write_json(DATA / "health" / f"{lid}.json", health)
        rr = ROOT / "data" / "rain_response" / f"{lid}.json"
        if rr.exists():
            rr_data = json.loads(rr.read_text(encoding="utf-8"))
            write_json(DATA / "rain_response" / f"{lid}.json", rr_data)
        ev = ROOT / "data" / "events" / f"{lid}.json"
        write_json(DATA / "events" / f"{lid}.json",
                   json.loads(ev.read_text(encoding="utf-8")) if ev.exists() else [])  # NaN-safe
        ext_dir = DATA / "extents" / lid
        ext_dir.mkdir(parents=True, exist_ok=True)
        for f in (ROOT / "data" / "monthly" / lid).glob("*.geojson"):
            shutil.copy(f, ext_dir / f.name)
        minx, miny, maxx, maxy = geom.bounds
        index.append({
            "id": lid, "name": props["name"], "name_kn": props.get("name_kn"),
            "outline_ha": props["area_ha"], "osm_refs": props["source_refs"],
            "bbox": [minx, miny, maxx, maxy],
            "centroid": [round(geom.centroid.x, 5), round(geom.centroid.y, 5)],
            "months": int(len(s)), "months_with_extent": int(len(have)),
            "first_month": s["month"].iloc[0], "last_month": s["month"].iloc[-1],
            "latest_extent": {"month": last["month"], "area_ha": last["area_ha"],
                              "source": last["source"]},
            "health": {"score": health["score"], "range": health["sensitivity_range"],
                       "low_coverage": health["low_coverage"]},
        })
        keep = ["month", "source", "area_ha", "unc_ha", "confidence", "optical_ha", "radar_ha",
                "ndci_median", "fai_frac", "floating_mat", "foam_ha", "haze", "rain_mm"]
        s[keep].to_csv(DL / f"{lid}_monthly.csv", index=False)
    write_json(DATA / "lakes.json", index)
    shutil.copy(ROOT / "data" / "lakes.geojson", DATA / "lakes.geojson")
    shutil.copy(ROOT / "data" / "lakes.geojson", DL / "lakes.geojson")
    shutil.copy(ROOT / "data" / "ghost_lakes.geojson", DATA / "ghost_lakes.geojson")
    shutil.copy(ROOT / "data" / "ghost_lakes.geojson", DL / "ghost_lakes.geojson")
    shutil.copy(ROOT / "validation" / "ground_truth.csv", DL / "ground_truth.csv")

    ev_all = [pd.read_parquet(p) for p in sorted((ROOT / "data" / "events").glob("*.parquet"))
              if "summary" not in p.name]
    if ev_all:
        pd.concat(ev_all).to_csv(DL / "events.csv", index=False)
    res = json.loads((ROOT / "validation" / "results.json").read_text(encoding="utf-8"))
    write_json(DATA / "validation.json", {
        "ground_truth": res["ground_truth"],
        "water_level": [{k: v for k, v in e.items() if k in (
            "event_id", "lake", "signal", "window", "outcome", "scored_area_ha", "lake_median_ha")}
            for e in res["water_level"]],
        "foam": [{"event_id": e["event_id"], "lake": e["lake"], "window": e["window"],
                  "outcome": e["outcome"]} for e in res["foam_and_floating"]
                 if e["type"] == "foam_candidate"],
        "pipeline_events": res.get("pipeline_events_vs_ground_truth", {}),
        "jrc": res.get("jrc", {}),
    })
    print(f"exported {len(index)} lakes to {WEB}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
