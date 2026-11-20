import json

import pytest

from tidemark import registry


def way(i, x0=77.6, y0=12.9, x1=77.61, y1=12.91):
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    return {
        "type": "way",
        "id": i,
        "tags": {"name": f"Lake {i}"},
        "geometry": [{"lat": y, "lon": x} for x, y in pts],
    }


def cfg(**lake):
    base = {"id": "a", "name": "A", "osm": ["way/1"], "status": "pinned"}
    base.update(lake)
    return {"bbox": [12.7, 77.4, 13.2, 77.8], "lakes": [base]}


def test_real_config_is_valid():
    c = registry.load_config()
    assert {lake["id"] for lake in c["lakes"]} >= {"bellandur", "varthur", "ulsoor"}


@pytest.mark.parametrize(
    "bad",
    [
        {"id": "Bad Id"},
        {"status": "maybe"},
        {"osm": ["node/5"]},
        {"osm": []},
    ],
)
def test_invalid_config_rejected(bad):
    with pytest.raises(ValueError):
        registry.validate_config(cfg(**bad))


def test_duplicate_ids_rejected():
    c = cfg()
    c["lakes"].append(dict(c["lakes"][0]))
    with pytest.raises(ValueError):
        registry.validate_config(c)


def test_build_feature_unions_and_records_provenance():
    lake = {"id": "a", "name": "A", "osm": ["way/1", "way/2"]}
    els = [way(1), way(2, x0=77.62, x1=77.63)]
    f = registry.build_feature(lake, els, "2026-07-24T11:04:51Z")
    p = f["properties"]
    assert f["geometry"]["type"] == "MultiPolygon"
    assert p["source"] == "OpenStreetMap" and p["licence"] == "ODbL-1.0"
    assert p["source_refs"] == ["way/1", "way/2"]
    assert 230 < p["area_ha"] < 245  # two ~120 ha squares


def test_build_feature_fails_loudly_on_missing_feature():
    with pytest.raises(ValueError, match="not returned"):
        registry.build_feature({"id": "a", "name": "A", "osm": ["way/9"]}, [way(1)], None)


def test_build_skips_pending_and_writes_geojson(tmp_path, monkeypatch):
    import yaml

    c = cfg()
    c["lakes"].append({"id": "b", "name": "B", "osm": [], "status": "pending"})
    cfg_path = tmp_path / "lakes.yaml"
    cfg_path.write_text(yaml.safe_dump(c), encoding="utf-8")
    monkeypatch.setattr(registry, "fetch_elements", lambda refs: ([way(1)], "ts"))
    out = tmp_path / "out" / "lakes.geojson"
    registry.build(cfg_path, out)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert [f["id"] for f in data["features"]] == ["a"]
