import numpy as np
import pytest
from rasterio.transform import from_origin

from tidemark import ghost, worldcover

HTML = """
<div><h4 id="Former_reservoirs">Former reservoirs</h4></div>
<table class="wikitable"><tbody>
<tr><th>Name</th><th>Detail</th><th>Coordinates</th><th>Refs</th></tr>
<tr><td><a href="/wiki/X">Dharmambudhi</a></td><td>Majestic bus stand</td>
 <td><span class="geo">12.9779; 77.5721</span></td>
 <td><sup class="reference"><a href="#c"><span class="cite-bracket">[</span>230<span class="cite-bracket">]</span></a></sup></td></tr>
<tr><td><a href="/wiki/J">Jaraganahalli</a>* </td><td></td>
 <td><span class="geo">12.9018; 77.5720</span></td><td></td></tr>
<tr><td>Nowhere</td><td>no coordinates</td><td></td><td></td></tr>
<tr><td>Far away</td><td>outside the city</td><td><span class="geo">28.6; 77.2</span></td><td></td></tr>
</tbody></table>
"""


def test_parse_rows_refs_marker_and_missing_coordinates():
    rows = ghost.parse_former_reservoirs(HTML)
    assert [r["name"] for r in rows] == ["Dharmambudhi", "Jaraganahalli", "Nowhere", "Far away"]
    d, j, n, f = rows
    assert (d["lat"], d["lon"]) == (12.9779, 77.5721) and d["wikipedia_refs"] == [230]
    assert d["detail"] == "Majestic bus stand" and not d["marked_asterisk"]
    assert j["marked_asterisk"] and j["name"] == "Jaraganahalli"
    assert n["lat"] is None


def test_bounding_box_rejects_other_cities():
    assert ghost.in_bengaluru(12.9779, 77.5721)
    assert not ghost.in_bengaluru(28.6, 77.2)


def test_missing_table_is_an_error():
    with pytest.raises(ValueError):
        ghost.parse_former_reservoirs("<p>nothing here</p>")


def test_class_fractions_ignore_nodata_and_name_classes():
    cls = np.array([[50, 50, 10], [50, 0, 80]], dtype="uint8")
    region = np.ones_like(cls, dtype=bool)
    f = worldcover.class_fractions(cls, region)
    assert f == {"tree cover": 0.2, "built-up": 0.6, "permanent water bodies": 0.2}
    assert worldcover.class_fractions(np.zeros((2, 2), "uint8"), np.ones((2, 2), bool)) == {}


def test_read_to_grid_resamples_a_local_geotiff(tmp_path):
    import rasterio

    path = tmp_path / "wc.tif"
    data = np.full((300, 300), 50, dtype="uint8")
    data[:, 150:] = 80
    tr = from_origin(77.60, 13.00, 0.0001, 0.0001)  # ~11 m pixels in lon/lat
    with rasterio.open(path, "w", driver="GTiff", height=300, width=300, count=1, dtype="uint8",
                       crs="EPSG:4326", transform=tr) as dst:
        dst.write(data, 1)
    from shapely.geometry import Point

    from tidemark.geometry import reproject

    c = reproject(Point(77.615, 12.985), "EPSG:4326", "EPSG:32643")
    grid = from_origin(c.x - 200, c.y + 200, 10, 10)
    out = worldcover.read_to_grid(str(path), grid, (40, 40), "EPSG:32643")
    assert set(np.unique(out)) == {50, 80}
    assert out[:, :10].mean() == 50 and out[:, -10:].mean() == 80  # west built-up, east water
