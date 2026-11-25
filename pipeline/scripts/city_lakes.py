"""Build the wider map directory from a Karnataka OpenStreetMap PBF (requires osmium)."""

import json
import sys

import osmium
from shapely import from_wkb, set_precision
from shapely.geometry import box, mapping, shape

from tidemark.runner import ROOT

study = box(77.4, 12.7, 77.8, 13.2)
tracked = json.loads((ROOT / "data/lakes.geojson").read_text(encoding="utf-8"))
known = [shape(f["geometry"]) for f in tracked["features"]]
features = []
factory = osmium.geom.WKBFactory()
processor = osmium.FileProcessor(sys.argv[1]).with_areas()
for area in processor.with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)):
    tags = area.tags
    name = tags.get("name:en") or tags.get("name")
    if not name or not (tags.get("natural") == "water" or tags.get("landuse") == "reservoir"):
        continue
    if tags.get("water", "") not in ("", "lake", "pond", "reservoir", "tank", "basin"):
        continue
    geom = from_wkb(bytes.fromhex(factory.create_multipolygon(area))).buffer(0)
    if geom.is_empty or not study.covers(geom.representative_point()):
        continue
    if any(g.intersection(geom).area > 0.8 * min(g.area, geom.area) for g in known):
        continue
    kind = "way" if area.from_way() else "relation"
    ident = f"{kind}-{area.orig_id()}"
    geom = set_precision(geom.simplify(0.000018, preserve_topology=True), 0.000001)
    if geom.is_empty:
        continue
    features.append({"type": "Feature", "geometry": mapping(geom), "properties": {
        "id": ident, "name": name, "name_kn": tags.get("name:kn") or tags.get("name"),
        "bbox": geom.bounds, "osm": f"https://www.openstreetmap.org/{kind}/{area.orig_id()}",
    }})
features.sort(key=lambda f: (f["properties"]["name"].casefold(), f["properties"]["id"]))
out = ROOT / "web/public/data/city-lakes.geojson"
out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                          ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(features)} additional named water bodies")
