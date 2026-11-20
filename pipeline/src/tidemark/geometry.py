"""Geometry helpers: Overpass elements -> shapely polygons, and geodesic-ish areas."""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import linemerge, polygonize, unary_union

# UTM zone 43N covers Bengaluru (77.6 E); equal-enough area for lake-sized polygons.
AREA_CRS = "EPSG:32643"


@lru_cache(maxsize=1)
def _to_utm() -> Transformer:
    return Transformer.from_crs("EPSG:4326", AREA_CRS, always_xy=True)


def area_ha(geom: BaseGeometry) -> float:
    """Area in hectares of a lon/lat (EPSG:4326) geometry, via UTM 43N."""
    t = _to_utm()
    projected = shapely.transform(geom, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))
    return projected.area / 10_000.0


def reproject(geom: BaseGeometry, src_crs: str, dst_crs: str) -> BaseGeometry:
    """Reproject a geometry between CRSs (x/y = lon/lat or easting/northing)."""
    t = Transformer.from_crs(src_crs, dst_crs, always_xy=True)
    return shapely.transform(geom, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))


def _coords(geometry: list[dict]) -> list[tuple[float, float]]:
    return [(p["lon"], p["lat"]) for p in geometry]


def _rings_from_ways(ways: list[list[tuple[float, float]]]) -> list[Polygon]:
    """Stitch open way fragments into closed rings and return them as polygons."""
    lines = [LineString(w) for w in ways if len(w) >= 2]
    if not lines:
        return []
    merged = linemerge(lines)
    return [p for p in polygonize(merged) if p.is_valid and not p.is_empty]


def element_to_geometry(element: dict) -> Polygon | MultiPolygon:
    """Convert an Overpass element fetched with ``out geom`` into a polygon.

    Supports closed ways and multipolygon relations (outer rings minus inner
    rings; fragments are merged). Raises ValueError if no area can be built.
    """
    kind = element.get("type")
    if kind == "way":
        pts = _coords(element.get("geometry", []))
        if len(pts) < 4 or pts[0] != pts[-1]:
            raise ValueError(f"way/{element.get('id')} is not a closed ring")
        poly = Polygon(pts)
    elif kind == "relation":
        outers, inners = [], []
        for m in element.get("members", []):
            if m.get("type") != "way" or "geometry" not in m:
                continue
            (inners if m.get("role") == "inner" else outers).append(_coords(m["geometry"]))
        outer_polys = _rings_from_ways(outers)
        if not outer_polys:
            raise ValueError(f"relation/{element.get('id')} has no closed outer ring")
        poly = unary_union(outer_polys)
        inner_polys = _rings_from_ways(inners)
        if inner_polys:
            poly = poly.difference(unary_union(inner_polys))
    else:
        raise ValueError(f"unsupported element type: {kind!r}")

    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty or poly.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError(f"{kind}/{element.get('id')} produced no polygon area")
    return poly
