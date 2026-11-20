"""Minimal, polite Overpass client: mirror rotation, backoff, on-disk cache."""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import requests

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
# Generic client name; Overpass operators ask automated clients to identify themselves.
USER_AGENT = "tidemark-research/0.1"
CACHE_DIR = Path(os.environ.get("TIDEMARK_CACHE", ".cache")) / "overpass"

_last_request = 0.0


def _min_interval() -> float:
    return float(os.environ.get("TIDEMARK_MIN_REQUEST_INTERVAL", "1.0"))


def _mirrors() -> list[str]:
    primary = os.environ.get("OVERPASS_URL")
    if primary:
        return [primary] + [m for m in MIRRORS if m != primary]
    return list(MIRRORS)


def query(ql: str, *, use_cache: bool = True, attempts: int = 6, timeout: int = 120) -> dict:
    """Run an Overpass QL query and return parsed JSON.

    Results are cached by query hash so reruns are free. Each failed attempt
    moves to the next mirror and doubles the wait (capped at 60 s).
    """
    global _last_request
    key = hashlib.sha256(ql.encode()).hexdigest()[:20]
    cache_file = CACHE_DIR / f"{key}.json"
    if use_cache and cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    mirrors = _mirrors()
    wait = 5.0
    last_err: Exception | None = None
    for i in range(attempts):
        url = mirrors[i % len(mirrors)]
        gap = _min_interval() - (time.monotonic() - _last_request)
        if gap > 0:
            time.sleep(gap)
        _last_request = time.monotonic()
        try:
            resp = requests.post(
                url,
                data={"data": ql},
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            last_err = exc
            time.sleep(wait)
            wait = min(wait * 2, 60.0)
            continue
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(data), encoding="utf-8")
        return data
    raise RuntimeError(f"Overpass failed after {attempts} attempts: {last_err}")
