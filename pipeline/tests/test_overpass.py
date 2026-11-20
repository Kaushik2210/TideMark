import requests

from tidemark import overpass


class Resp:
    def __init__(self, ok=True, payload=None):
        self.ok, self.payload = ok, payload or {"elements": []}

    def raise_for_status(self):
        if not self.ok:
            raise requests.HTTPError("boom")

    def json(self):
        return self.payload


def setup(monkeypatch, tmp_path):
    monkeypatch.setattr(overpass, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(overpass.time, "sleep", lambda s: None)
    monkeypatch.delenv("OVERPASS_URL", raising=False)


def test_rotates_mirrors_then_caches(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    calls = []

    def fake_post(url, **kw):
        calls.append(url)
        return Resp(ok=len(calls) >= 3, payload={"elements": [1]})

    monkeypatch.setattr(overpass.requests, "post", fake_post)
    assert overpass.query("q")["elements"] == [1]
    assert calls == overpass.MIRRORS[:3]
    overpass.query("q")  # served from cache
    assert len(calls) == 3


def test_gives_up_after_attempts(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    monkeypatch.setattr(overpass.requests, "post", lambda url, **kw: Resp(ok=False))
    try:
        overpass.query("q2", attempts=2)
    except RuntimeError as exc:
        assert "2 attempts" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
