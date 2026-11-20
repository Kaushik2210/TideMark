import pytest
from shapely.geometry import box

from tidemark.geometry import area_ha, element_to_geometry


def ring(x0, y0, x1, y1):
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    return [{"lat": y, "lon": x} for x, y in pts]


def test_area_ha_matches_expected_square():
    # 0.01 deg x 0.01 deg at ~12.95N, 77.6E: ~1.083 km x ~1.107 km ~= 120 ha
    ha = area_ha(box(77.60, 12.95, 77.61, 12.96))
    assert 118 < ha < 122


def test_closed_way_becomes_polygon():
    el = {"type": "way", "id": 1, "geometry": ring(77.6, 12.9, 77.61, 12.91)}
    geom = element_to_geometry(el)
    assert geom.geom_type == "Polygon"
    assert geom.is_valid


def test_open_way_rejected():
    el = {"type": "way", "id": 2, "geometry": ring(77.6, 12.9, 77.61, 12.91)[:-1]}
    with pytest.raises(ValueError):
        element_to_geometry(el)


def test_multipolygon_subtracts_inner_island():
    outer = ring(77.60, 12.90, 77.62, 12.92)
    inner = ring(77.608, 12.908, 77.612, 12.912)
    el = {
        "type": "relation",
        "id": 3,
        "members": [
            {"type": "way", "role": "outer", "geometry": outer},
            {"type": "way", "role": "inner", "geometry": inner},
        ],
    }
    geom = element_to_geometry(el)
    full = area_ha(box(77.60, 12.90, 77.62, 12.92))
    hole = area_ha(box(77.608, 12.908, 77.612, 12.912))
    assert area_ha(geom) == pytest.approx(full - hole, rel=1e-6)


def test_split_outer_fragments_are_stitched():
    # one square ring supplied as two open halves
    a = [{"lat": 12.90, "lon": 77.60}, {"lat": 12.90, "lon": 77.61}, {"lat": 12.91, "lon": 77.61}]
    b = [{"lat": 12.91, "lon": 77.61}, {"lat": 12.91, "lon": 77.60}, {"lat": 12.90, "lon": 77.60}]
    el = {
        "type": "relation",
        "id": 4,
        "members": [
            {"type": "way", "role": "outer", "geometry": a},
            {"type": "way", "role": "outer", "geometry": b},
        ],
    }
    assert area_ha(element_to_geometry(el)) == pytest.approx(
        area_ha(box(77.60, 12.90, 77.61, 12.91)), rel=1e-6
    )


def test_relation_without_outer_ring_rejected():
    with pytest.raises(ValueError):
        element_to_geometry({"type": "relation", "id": 5, "members": []})
