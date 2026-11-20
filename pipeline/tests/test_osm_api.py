from tidemark import osm_api
from tidemark.geometry import area_ha, element_to_geometry


def square_payload():
    nodes = [
        {"type": "node", "id": 1, "lat": 12.90, "lon": 77.60},
        {"type": "node", "id": 2, "lat": 12.90, "lon": 77.61},
        {"type": "node", "id": 3, "lat": 12.91, "lon": 77.61},
        {"type": "node", "id": 4, "lat": 12.91, "lon": 77.60},
    ]
    way = {"type": "way", "id": 10, "nodes": [1, 2, 3, 4, 1], "timestamp": "2024-01-02T00:00:00Z"}
    rel = {
        "type": "relation",
        "id": 20,
        "timestamp": "2025-03-04T00:00:00Z",
        "members": [{"type": "way", "ref": 10, "role": "outer"}],
    }
    return {"elements": [*nodes, way, rel]}


def test_relation_converted_to_geom_style():
    el = osm_api.to_geom_element(square_payload(), "relation/20")
    assert area_ha(element_to_geometry(el)) > 100


def test_way_converted_to_geom_style():
    el = osm_api.to_geom_element(square_payload(), "way/10")
    assert element_to_geometry(el).geom_type == "Polygon"


def test_fetch_uses_cache_and_returns_latest_edit(monkeypatch, tmp_path):
    monkeypatch.setattr(osm_api, "CACHE_DIR", tmp_path)
    calls = []

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return square_payload()

    monkeypatch.setattr(osm_api.requests, "get", lambda *a, **k: calls.append(a) or R())
    els, ts = osm_api.fetch(["relation/20", "way/10"])
    assert len(els) == 2 and ts == "2025-03-04T00:00:00Z"
    osm_api.fetch(["relation/20"])
    assert len(calls) == 2  # second fetch of relation/20 came from cache
