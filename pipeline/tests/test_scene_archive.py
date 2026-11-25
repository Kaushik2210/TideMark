import pandas as pd

from tidemark.scene_archive import select_scenes


def test_city_scene_is_real_same_month_and_best_candidate():
    rows = pd.DataFrame([
        ("2020-08", "2020-08-04", "cloudy", 90),
        ("2020-08", "2020-08-14", "clearer", 15),
        ("2020-08", "2020-09-01", "wrong-month", 0),
        ("2020-09", None, None, None),
        ("2020-10", "2020-10-08", "overcast", 99),
    ], columns=["month", "date", "scene_id", "scene_cloud_pct"])
    selection = select_scenes(rows)
    assert selection.scene_id.tolist() == ["clearer", "overcast"]
