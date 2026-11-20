"""Inflow/outlet candidates from OpenStreetMap waterways meeting each lake.

Waterway lines come from the OSM map API (ODbL, cached). Direction follows OSM digitising
order (lines are normally drawn downstream), which is NOT verified on the ground, so points are
labelled "inflow"/"outflow" only as OSM-implied; "crossing" when neither end touches the lake.
"""

from __future__ import annotations

import json
from pathlib import Path

import requests
from shapely.geometry import LineString, Point, mapping
from shapely.geometry import shape as to_shape
from shapely.geometry.base import BaseGeometry

from .geometry import reproject
from .runner import CACHE_ROOT, ROOT

API = "https://api.openstreetmap.org/api/0.6/map.json"
USER_AGENT = "tidemark-research/0.1"
OUT = ROOT / "data" / "waterways"
WATERWAY_KINDS = {"river", "stream", "canal", "drain", "ditch"}
TOUCH_M = 40.0  # a waterway end within this distance of the lake outline counts as meeting it


def ways_to_lines(osm: dict) -> list[dict]:
    """Waterway ways in an OSM map.json payload -> [{kind, name, line (lon/lat)}]."""
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm["elements"] if e["type"] == "node"}
    out = []
    for e in osm["elements"]:
        tags = e.get("tags", {})
        if e["type"] != "way" or tags.get("waterway") not in WATERWAY_KINDS:
            continue
        pts = [nodes[n] for n in e["nodes"] if n in nodes]
        if len(pts) >= 2:
            out.append({"id": e["id"], "kind": tags["waterway"], "name": tags.get("name"),
                        "line": LineString(pts)})
    return out


def inlet_points(lake_ll: BaseGeometry, ways: list[dict], crs: str = "EPSG:32643") -> list[dict]:
    """Where waterways meet the lake: the nearest end (or crossing) as lon/lat points."""
    lake = reproject(lake_ll, "EPSG:4326", crs)
    zone = lake.buffer(TOUCH_M)
    pts = []
    for w in ways:
        line = reproject(w["line"], "EPSG:4326", crs)
        if not line.intersects(zone):
            continue
        start, end = Point(line.coords[0]), Point(line.coords[-1])
        if end.distance(lake) <= TOUCH_M:
            kind, p = "inflow", end
        elif start.distance(lake) <= TOUCH_M:
            kind, p = "outflow", start
        else:
            kind, p = "crossing", line.intersection(zone).representative_point()
        ll = reproject(p, crs, "EPSG:4326")
        pts.append({"kind": kind, "waterway": w["kind"], "name": w["name"], "osm_way": w["id"],
                    "lon": round(ll.x, 6), "lat": round(ll.y, 6)})
    return pts


def fetch_and_save(lake_id: str, lake_ll: BaseGeometry) -> list[dict]:
    cache = CACHE_ROOT / "waterways" / f"{lake_id}.json"
    if cache.exists():
        osm = json.loads(cache.read_text(encoding="utf-8"))
    else:
        minx, miny, maxx, maxy = lake_ll.buffer(0.002).bounds
        r = requests.get(API, params={"bbox": f"{minx},{miny},{maxx},{maxy}"},
                         headers={"User-Agent": USER_AGENT}, timeout=120)
        r.raise_for_status()
        osm = r.json()
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(osm), encoding="utf-8")
    pts = inlet_points(lake_ll, ways_to_lines(osm))
    OUT.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {k: v for k, v in p.items() if k not in ("lon", "lat")}
         | {"attribution": "© OpenStreetMap contributors (ODbL)"},
         "geometry": mapping(Point(p["lon"], p["lat"]))} for p in pts]}
    Path(OUT / f"{lake_id}.geojson").write_text(json.dumps(fc), encoding="utf-8")
    return pts


def load_points(lake_id: str) -> list[Point]:
    f = OUT / f"{lake_id}.geojson"
    if not f.exists():
        return []
    fc = json.loads(f.read_text(encoding="utf-8"))
    return [to_shape(ft["geometry"]) for ft in fc["features"]]
