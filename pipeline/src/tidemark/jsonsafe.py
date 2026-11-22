"""Strictly valid JSON output.

Python's ``json`` writes ``NaN`` and ``Infinity`` by default, which are not valid JSON and make
``JSON.parse`` in a browser fail. Everything that feeds the website goes through here: non-finite
floats become ``null`` and numpy scalars become plain Python values.
"""

from __future__ import annotations

import json
import math
from typing import Any

import numpy as np


def sanitize(obj: Any) -> Any:
    """Recursively replace NaN/Infinity with None and numpy scalars with Python values."""
    if isinstance(obj, dict):
        return {str(k): sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    if isinstance(obj, np.generic):
        return sanitize(obj.item())
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    return obj


def dumps(obj: Any, **kwargs: Any) -> str:
    """json.dumps that can only produce valid JSON (non-serialisable values become strings)."""
    kwargs.setdefault("default", str)
    return json.dumps(sanitize(obj), allow_nan=False, **kwargs)
