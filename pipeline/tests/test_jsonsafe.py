import json
import math

import numpy as np
import pytest

from tidemark import jsonsafe


def test_nan_and_inf_become_null_recursively():
    obj = {"a": float("nan"), "b": [1.0, math.inf, {"c": -math.inf}], "d": (2, float("nan"))}
    out = json.loads(jsonsafe.dumps(obj))  # strict JSON.parse-compatible parse
    assert out == {"a": None, "b": [1.0, None, {"c": None}], "d": [2, None]}


def test_output_has_no_nan_tokens_and_numpy_scalars_are_plain():
    text = jsonsafe.dumps({"x": np.float64("nan"), "y": np.int64(3), "z": np.bool_(True), "w": np.float32(1.5)})
    assert "NaN" not in text and "Infinity" not in text
    assert json.loads(text) == {"x": None, "y": 3, "z": True, "w": 1.5}


def test_plain_json_would_have_emitted_nan():
    assert "NaN" in json.dumps({"a": float("nan")})  # why this module exists


def test_strictness_is_enforced_for_unserialisable_values_via_default():
    assert json.loads(jsonsafe.dumps({"p": object})) == {"p": str(object)}
    with pytest.raises(ValueError):
        json.dumps({"a": float("nan")}, allow_nan=False)
