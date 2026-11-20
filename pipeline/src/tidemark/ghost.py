"""Ghost Lakes: Bengaluru lakes/tanks that have been built over, from open sources only.

    tidemark-ghost            # writes data/ghost_lakes.geojson

Source: the "Former reservoirs" table of the English Wikipedia article "Lakes in Bengaluru"
(text CC BY-SA 4.0), fetched through the MediaWiki API with its revision id recorded. Each row
gives a name, what occupies the site today, an approximate coordinate point and citation
numbers. **No polygon is invented**: every feature is a point flagged
``location_approximate``. Rows without coordinates are omitted. WorldCover (CC BY 4.0) adds
the share of built-up land around each point as independent evidence of "built over".
"""

from __future__ import annotations

import json
import re
from datetime import date

import numpy as np
import requests
from bs4 import BeautifulSoup
from shapely.geometry import Point, mapping

from . import s2, worldcover
from .geometry import reproject
from .runner import ROOT

API = "https://en.wikipedia.org/w/api.php"
PAGE = "Lakes_in_Bengaluru"
USER_AGENT = "tidemark-research/0.1"
OUT = ROOT / "data" / "ghost_lakes.geojson"
BBOX = (12.70, 77.40, 13.20, 77.80)  # south, west, north, east: points outside are rejected
RADIUS_M = 300.0
LICENCE = "CC BY-SA 4.0 (Wikipedia text); WorldCover fields CC BY 4.0"


def fetch_page() -> tuple[str, int]:
    r = requests.get(API, params={"action": "parse", "page": PAGE, "prop": "text|revid",
                                  "format": "json", "formatversion": 2},
                     headers={"User-Agent": USER_AGENT}, timeout=60)
    r.raise_for_status()
    d = r.json()["parse"]
    return d["text"], int(d["revid"])


def parse_former_reservoirs(html: str) -> list[dict]:
    """Rows of the 'Former reservoirs' table: name, detail, lat/lon (or None), citation numbers."""
    soup = BeautifulSoup(html, "html.parser")
    anchor = soup.find(id="Former_reservoirs")
    table = anchor.find_next("table") if anchor else None
    if table is None:
        raise ValueError("'Former reservoirs' table not found")
    rows = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td"])
        if len(cells) < 3:
            continue
        raw_name = cells[0].get_text(" ", strip=True)
        marked = raw_name.rstrip().endswith("*")
        name = re.sub(r"[\s*]+$", "", raw_name).strip()
        detail = re.sub(r"\s+", " ", cells[1].get_text(" ", strip=True))
        geo = cells[2].find("span", class_="geo")
        lat = lon = None
        if geo:
            m = re.match(r"\s*(-?\d+\.\d+);\s*(-?\d+\.\d+)", geo.get_text())
            if m:
                lat, lon = float(m.group(1)), float(m.group(2))
        refs = []
        if len(cells) > 3:
            ref_text = cells[3].get_text(" ", strip=True)
            refs = [int(n) for n in re.findall(r"\[\s*(\d+)\s*\]", ref_text)]
        rows.append({"name": name, "detail": detail, "lat": lat, "lon": lon,
                     "wikipedia_refs": refs, "marked_asterisk": marked})
    return rows


def in_bengaluru(lat: float, lon: float) -> bool:
    s, w, n, e = BBOX
    return s <= lat <= n and w <= lon <= e


def builtup_context(client, points: list[Point]) -> list[dict]:
    """WorldCover 2020/2021 built-up share within RADIUS_M of each point (None if unavailable)."""
    out = [{} for _ in points]
    for year in worldcover.VERSIONS:
        for i, p in enumerate(points):
            try:
                crs = "EPSG:32643"
                c = reproject(p, "EPSG:4326", crs)
                n = 61  # 10 m grid, ~610 m square
                from rasterio.transform import from_origin

                tr = from_origin(c.x - n * 5, c.y + n * 5, 10, 10)
                yy, xx = np.mgrid[:n, :n]
                dist = np.hypot((xx + 0.5 - n / 2) * 10, (yy + 0.5 - n / 2) * 10)
                region = dist <= RADIUS_M
                href = worldcover.find_map_href(client, year, (p.x - 0.01, p.y - 0.01,
                                                               p.x + 0.01, p.y + 0.01))
                cls = worldcover.read_to_grid(href, tr, (n, n), crs)
                frac = worldcover.class_fractions(cls, region)
                out[i][f"worldcover_{year}_builtup_frac"] = frac.get("built-up", 0.0)
                out[i][f"worldcover_{year}_classes"] = frac
            except Exception as exc:
                out[i][f"worldcover_{year}_builtup_frac"] = None
                out[i][f"worldcover_{year}_error"] = f"{type(exc).__name__}"
    return out


def build() -> dict:
    html, revid = fetch_page()
    rows = parse_former_reservoirs(html)
    kept = [r for r in rows if r["lat"] is not None and in_bengaluru(r["lat"], r["lon"])]
    omitted = [r["name"] for r in rows if r not in kept]
    points = [Point(r["lon"], r["lat"]) for r in kept]
    ctx = builtup_context(s2.open_catalog(), points)
    features = []
    for r, p, c in zip(kept, points, ctx, strict=True):
        features.append({
            "type": "Feature",
            "properties": {
                "name": r["name"],
                "occupied_today_by": r["detail"] or None,
                "geometry_kind": "approximate_point",
                "location_approximate": True,
                "source": (f"Wikipedia, 'Lakes in Bengaluru', Former reservoirs table, "
                           f"revision {revid}"),
                "source_url": f"https://en.wikipedia.org/w/index.php?title={PAGE}&oldid={revid}",
                "wikipedia_ref_numbers": r["wikipedia_refs"],
                # Wikipedia marks some rows with "*" without explaining it in the table;
                # the meaning is not confirmed (the lake may partly survive).
                "wikipedia_asterisk_unexplained": r["marked_asterisk"],
                "licence": LICENCE,
                "retrieved": date.today().isoformat(),
                **c,
            },
            "geometry": mapping(p),
        })
    fc = {"type": "FeatureCollection", "name": "tidemark_ghost_lakes", "features": features,
          "note": "Points are approximate; the table says it is not exhaustive. No lake "
                  "outline is implied."}
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(features)} ghost lakes written; omitted (no usable coordinates): {omitted}")
    return fc


def main(argv: list[str] | None = None) -> int:
    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
