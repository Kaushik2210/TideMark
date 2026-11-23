from datetime import date

import pandas as pd
import pytest

from tidemark import update


def test_window_covers_current_and_previous_months_across_year_end():
    assert update.window(date(2026, 11, 23), 3) == ("2026-09", "2026-11")
    assert update.window(date(2027, 1, 5), 3) == ("2026-11", "2027-01")
    assert update.window(date(2026, 5, 1), 1) == ("2026-05", "2026-05")
    with pytest.raises(ValueError):
        update.window(date(2026, 5, 1), 0)


def test_month_range_is_inclusive():
    assert update.month_range("2026-11", "2027-02") == ["2026-11", "2026-12", "2027-01", "2027-02"]


def test_merge_keeps_old_months_and_new_wins():
    old = pd.DataFrame({"month": ["2016-01", "2016-02", "2026-10"], "v": [1, 2, 3]})
    new = pd.DataFrame({"month": ["2026-10", "2026-11"], "v": [30, 40]})
    out = update.merge_missing(new, old)
    assert out["month"].tolist() == ["2016-01", "2016-02", "2026-10", "2026-11"]
    assert out.set_index("month")["v"].to_dict() == {"2016-01": 1, "2016-02": 2, "2026-10": 30, "2026-11": 40}


def test_merge_with_empty_old_returns_new_unchanged():
    new = pd.DataFrame({"month": ["2026-11"], "v": [1]})
    assert update.merge_missing(new, pd.DataFrame()).equals(new)


def test_shrink_check_flags_lost_months_only():
    assert update.check_not_shrunk({"a": 10, "b": 5}, {"a": 11, "b": 5}) == []
    msgs = update.check_not_shrunk({"a": 10, "b": 5}, {"a": 4, "b": 5})
    assert len(msgs) == 1 and msgs[0].startswith("a:")
