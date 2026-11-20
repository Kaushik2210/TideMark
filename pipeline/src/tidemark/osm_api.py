"""Fetch pinned OSM objects from the main OSM API (``/full``), cached on disk.

Used for the registry build because it is a direct object lookup (one small request per
ref) and far more reliable than the public Overpass instances. The response is converted to
the same shape as Overpass ``out geom`` so geometry code has a single input format.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests

BASE = "https://api.openstreetmap.org/api/0.6"
USER_AGENT = "tidemark-research/0.1"
CACHE_DIR = Path(os.environ.get("TIDEMARK_CACHE", ".cache")) / "osm_api"


def _get(ref: str, attempts: int = 4) -> dict:
    kind, oid = ref.split("/")
    cache_file = CACHE_DIR / f"{kind}_{oid}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    last: Exception | None = None
    for i in range(attempts):
        try:
            resp = requests.get(
                f"{BASE}/{kind}/{oid}/full.json",
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(data), encoding="utf-8")
            return data
        except (requests.RequestException, ValueError) as exc:
            last = exc
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"OSM API failed for {ref} after {attempts} attempts: {last}")


def to_geom_element(full: dict, ref: str) -> dict:
    """Convert a ``/full`` payload into an Overpass-``out geom``-style element."""
    kind, oid = ref.split("/")
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in full["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in full["elements"] if e["type"] == "way"}

    def way_geom(way: dict) -> list[dict]:
        return [{"lat": nodes[n][1], "lon": nodes[n][0]} for n in way["nodes"] if n in nodes]

    if kind == "way":
        el = ways[int(oid)]
        return {**el, "geometry": way_geom(el)}
    rel = next(e for e in full["elements"] if e["type"] == "relation" and e["id"] == int(oid))
    members = []
    for m in rel.get("members", []):
        if m["type"] == "way" and m["ref"] in ways:
            members.append({**m, "geometry": way_geom(ways[m["ref"]])})
    return {**rel, "members": members}


def fetch(refs: list[str]) -> tuple[list[dict], str | None]:
    """Return (geom-style elements, latest element edit timestamp)."""
    elements, stamps = [], []
    for ref in refs:
        el = to_geom_element(_get(ref), ref)
        elements.append(el)
        if el.get("timestamp"):
            stamps.append(el["timestamp"])
    return elements, max(stamps) if stamps else None
