"""Live data source: caching, refresh and fallback behaviour (no network access)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import LIVE_DELIVERY_DAYS, SNAPSHOT_SCOPE, Scope, live_scope
from app.data import elexon, loader
from app.data.loader import LiveCache, load_snapshot
from app.main import app


def _snapshot_as_live(scope=SNAPSHOT_SCOPE):
    ds = load_snapshot()
    return loader._make_dataset(ds.forecasts.drop(columns="lead_h"), ds.actuals, ds.manifest,
                                "live", scope)


class TestLiveScope:
    def test_rolling_window_ends_tomorrow_with_warmup(self):
        s = live_scope(date(2026, 10, 26))
        assert s.delivery_last == date(2026, 10, 27)
        assert s.decision_last == date(2026, 10, 26)
        assert (s.delivery_last - s.delivery_first).days == LIVE_DELIVERY_DAYS - 1
        assert (s.delivery_first - s.history_first).days >= 30

    def test_api_ranges_follow_the_served_dataset(self, monkeypatch):
        scope = Scope("test", date(2025, 12, 10), date(2026, 1, 12), date(2026, 1, 20))
        monkeypatch.setattr(loader, "live_cache",
                            LiveCache(lambda: _snapshot_as_live(scope), ttl_seconds=60))
        client = TestClient(app)
        meta = client.get("/api/meta", params={"source": "live"}).json()
        assert meta["delivery_range"] == {"first": "2026-01-12", "last": "2026-01-20"}
        assert meta["scope_label"] == "test"
        out_of_scope = {"delivery_date": "2026-01-25", "source": "live"}
        assert client.get("/api/cockpit", params=out_of_scope).status_code == 404
        acc = client.get("/api/accuracy", params={"source": "live"}).json()
        assert acc["range"] == {"first": "2026-01-12", "last": "2026-01-20"}

    def test_cockpit_reports_gate_closed_for_past_days(self):
        body = TestClient(app).get("/api/cockpit", params={"delivery_date": "2026-01-23"}).json()
        assert body["gate"]["closed"] is True


class TestLiveCache:
    def test_fetches_once_within_ttl_then_refreshes(self, monkeypatch):
        calls = []
        cache = LiveCache(lambda: calls.append(1) or _snapshot_as_live(), ttl_seconds=60)
        first = cache.get()
        assert cache.get() is first and len(calls) == 1

        monkeypatch.setattr(loader.time, "monotonic", lambda: 1e12)
        assert cache.get() is not first and len(calls) == 2
        assert cache.status()["state"] == "live"

    def test_force_refresh(self):
        calls = []
        cache = LiveCache(lambda: calls.append(1) or _snapshot_as_live(), ttl_seconds=3600)
        cache.get()
        cache.get(force=True)
        assert len(calls) == 2

    def test_keeps_serving_stale_data_when_refresh_fails(self):
        results = [_snapshot_as_live()]

        def fetch():
            if results:
                return results.pop()
            raise TimeoutError("elexon down")

        cache = LiveCache(fetch, ttl_seconds=3600)
        good = cache.get()
        assert cache.get(force=True) is good
        status = cache.status()
        assert status["state"] == "stale" and "elexon down" in status["error"]

    def test_none_and_fallback_state_when_never_fetched(self):
        def fetch():
            raise ConnectionError("no network")

        cache = LiveCache(fetch, ttl_seconds=60)
        assert cache.get() is None
        assert cache.status()["state"] == "fallback"


class TestLiveApi:
    @pytest.fixture
    def client(self, monkeypatch):
        monkeypatch.setattr(loader, "live_cache", LiveCache(_snapshot_as_live, ttl_seconds=60))
        monkeypatch.setattr("app.services.live_cache", loader.live_cache)
        return TestClient(app)

    def test_meta_reports_live_source(self, client):
        body = client.get("/api/meta", params={"source": "live"}).json()
        assert body["source"]["requested"] == "live"
        assert body["source"]["served"] == "live"
        assert body["source"]["live"]["state"] == "live"

    def test_live_results_match_snapshot_for_the_same_data(self, client):
        params = {"delivery_date": "2026-01-23", "gate": "epex_60"}
        live = client.get("/api/cockpit", params={**params, "source": "live"}).json()
        snap = client.get("/api/cockpit", params={**params, "source": "snapshot"}).json()
        assert live["hours"] == snap["hours"]

    def test_refresh_endpoint(self, client):
        body = client.post("/api/live/refresh").json()
        assert body["source"]["live"]["state"] == "live"

    def test_falls_back_to_snapshot_when_elexon_unreachable(self, monkeypatch):
        def fetch():
            raise ConnectionError("no network")

        monkeypatch.setattr(loader, "live_cache", LiveCache(fetch, ttl_seconds=60))
        monkeypatch.setattr("app.services.live_cache", loader.live_cache)
        client = TestClient(app)
        meta = client.get("/api/meta", params={"source": "live"}).json()
        assert meta["source"]["served"] == "snapshot"
        assert meta["source"]["live"]["state"] == "fallback"
        r = client.get("/api/cockpit", params={"delivery_date": "2026-01-23", "source": "live"})
        assert r.status_code == 200

    def test_rejects_unknown_source(self, client):
        r = client.get("/api/meta", params={"source": "bogus"})
        assert r.status_code == 422


def test_clean_frames_match_snapshot_schema():
    raw_f = [{"publishTime": "2026-01-09T07:30:00Z", "startTime": "2026-01-10T00:00:00Z",
              "generation": 100, "dataset": "WINDFOR"}]
    raw_a = [{"startTime": "2026-01-10T00:00:00Z", "publishTime": "2026-01-10T00:30:00Z",
              "settlementDate": "2026-01-10", "settlementPeriod": 1, "fuelType": "WIND",
              "generation": 90}]
    f, _ = elexon.clean_forecasts(raw_f)
    a, _ = elexon.clean_actuals(raw_a)
    snap = load_snapshot()
    assert list(f.columns) == list(snap.forecasts.columns.drop("lead_h"))
    assert list(a.columns) == list(snap.actuals.columns)
    assert f.publish_time.dtype == snap.forecasts.publish_time.dtype
