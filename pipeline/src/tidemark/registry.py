"""Lake registry: config/lakes.yaml + OpenStreetMap -> data/lakes.geojson.

Usage (from /pipeline):
    tidemark-registry discover "Bellandur|Bellanduru"   # list candidate OSM features
    tidemark-registry build                              # write ../data/lakes.geojson
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import yaml
from shapely.geometry import mapping
from shapely.ops import unary_union

from . import osm_api, overpass
from .geometry import area_ha, element_to_geometry

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG = ROOT / "pipeline" / "config" / "lakes.yaml"
DEFAULT_OUT = ROOT / "data" / "lakes.geojson"
OSM_REF = re.compile(r"^(way|relation)/(\d+)$")
LICENCE = "ODbL-1.0"
ATTRIBUTION = "© OpenStreetMap contributors"


def load_config(path: Path = DEFAULT_CONFIG) -> dict:
    cfg = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    validate_config(cfg)
    return cfg


def validate_config(cfg: dict) -> None:
    ids: set[str] = set()
    if len(cfg.get("bbox", [])) != 4:
        raise ValueError("bbox must be [south, west, north, east]")
    for lake in cfg.get("lakes", []):
        lid = lake.get("id")
        if not lid or not re.fullmatch(r"[a-z0-9_]+", lid):
            raise ValueError(f"invalid lake id: {lid!r}")
        if lid in ids:
            raise ValueError(f"duplicate lake id: {lid}")
        ids.add(lid)
        if lake.get("status") not in ("pinned", "pending"):
            raise ValueError(f"{lid}: status must be 'pinned' or 'pending'")
        for ref in lake.get("osm", []):
            if not OSM_REF.match(ref):
                raise ValueError(f"{lid}: bad OSM ref {ref!r} (want way/ID or relation/ID)")
        if lake["status"] == "pinned" and not lake.get("osm"):
            raise ValueError(f"{lid}: pinned lakes need at least one OSM ref")


def fetch_elements(refs: list[str]) -> tuple[list[dict], str | None]:
    """Fetch full geometry for pinned OSM refs via the OSM API.

    Returns (elements, latest edit timestamp among the objects). Overpass is only used
    for `discover`; its public instances are unreliable for scripted builds (DECISIONS D-006).
    """
    return osm_api.fetch(refs)


def build_feature(lake: dict, elements: list[dict], osm_timestamp: str | None) -> dict:
    wanted = set(lake["osm"])
    found = {f"{e['type']}/{e['id']}": e for e in elements}
    missing = wanted - found.keys()
    if missing:
        raise ValueError(f"{lake['id']}: OSM features not returned: {sorted(missing)}")
    geom = unary_union([element_to_geometry(found[r]) for r in sorted(wanted)])
    names = {found[r].get("tags", {}).get("name") for r in wanted}
    return {
        "type": "Feature",
        "id": lake["id"],
        "properties": {
            "id": lake["id"],
            "name": lake["name"],
            "name_kn": lake.get("name_kn"),
            "area_ha": round(area_ha(geom), 2),
            "source": "OpenStreetMap",
            "source_refs": sorted(wanted),
            "osm_names": sorted(n for n in names if n),
            "licence": LICENCE,
            "attribution": ATTRIBUTION,
            "osm_last_edit": osm_timestamp,
            "retrieved": date.today().isoformat(),
            "geometry_kind": "boundary_polygon",
            "notes": lake.get("notes"),
        },
        "geometry": mapping(geom),
    }


def build(config_path: Path = DEFAULT_CONFIG, out_path: Path = DEFAULT_OUT) -> dict:
    cfg = load_config(config_path)
    features, skipped = [], []
    for lake in cfg["lakes"]:
        if lake["status"] != "pinned":
            skipped.append(lake["id"])
            continue
        elements, ts = fetch_elements(lake["osm"])
        features.append(build_feature(lake, elements, ts))
    collection = {
        "type": "FeatureCollection",
        "name": "tidemark_lakes",
        "features": features,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(collection, ensure_ascii=False, indent=1), encoding="utf-8")
    if skipped:
        print(f"skipped (status: pending): {', '.join(skipped)}", file=sys.stderr)
    return collection


def discover(pattern: str, bbox: list[float]) -> list[dict]:
    """List named water features in the bbox matching a regex, with areas."""
    s, w, n, e = bbox
    q = (
        f'[out:json][timeout:90];(way["natural"="water"]["name"~"{pattern}",i]({s},{w},{n},{e});'
        f'relation["natural"="water"]["name"~"{pattern}",i]({s},{w},{n},{e}););out geom;'
    )
    rows = []
    for el in overpass.query(q).get("elements", []):
        try:
            ha = round(area_ha(element_to_geometry(el)), 2)
        except ValueError:
            ha = None
        tags = el.get("tags", {})
        rows.append(
            {
                "ref": f"{el['type']}/{el['id']}",
                "name": tags.get("name"),
                "name_en": tags.get("name:en"),
                "water": tags.get("water"),
                "area_ha": ha,
            }
        )
    return sorted(rows, key=lambda r: -(r["area_ha"] or 0))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tidemark-registry")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="write data/lakes.geojson from config")
    b.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    b.add_argument("--out", type=Path, default=DEFAULT_OUT)
    d = sub.add_parser("discover", help="list candidate OSM features matching a regex")
    d.add_argument("pattern")
    d.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = ap.parse_args(argv)

    if args.cmd == "build":
        fc = build(args.config, args.out)
        for f in fc["features"]:
            p = f["properties"]
            print(f"{f['id']:<12} {p['area_ha']:>9.2f} ha  {p['source_refs']}")
        return 0
    cfg = load_config(args.config)
    for row in discover(args.pattern, cfg["bbox"]):
        print(row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
