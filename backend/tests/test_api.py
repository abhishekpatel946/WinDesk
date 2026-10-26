import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta(client):
    body = client.get("/api/meta").json()
    assert [g["id"] for g in body["gates"]] == ["epex_60", "n2ex", "epex_30"]
    assert body["delivery_range"] == {"first": "2026-01-02", "last": "2026-02-01"}


def test_cockpit(client):
    r = client.get("/api/cockpit", params={"delivery_date": "2026-01-10", "gate": "n2ex"})
    assert r.status_code == 200
    body = r.json()
    assert body["run"]["publish_time_utc"] == "2026-01-09T09:30:00+00:00"
    assert body["run"]["age_minutes_at_gate"] == 20
    assert len(body["hours"]) == 24
    assert body["hours"][0]["label"] == "23:00"
    h = body["hours"][5]
    assert h["p10"] <= h["p90"]
    assert body["outcome"]["mae"] > 0


@pytest.mark.parametrize("params", [
    {"delivery_date": "2025-12-15"},
    {"delivery_date": "2026-01-10", "gate": "bogus"},
    {"delivery_date": "not-a-date"},
])
def test_cockpit_rejects_bad_input(client, params):
    assert client.get("/api/cockpit", params=params).status_code in (404, 422)


def test_accuracy(client):
    body = client.get("/api/accuracy", params={"gate": "epex_60"}).json()
    assert body["summary"]["n"] == 31 * 24
    assert body["corrected_summary"]["mae"] < body["summary"]["mae"]
    assert len(body["gate_comparison"]) == 3
    assert len(body["by_hour"]) == 24
    assert len(body["daily"]) == 31
    assert sum(b["count"] for b in body["histogram"]) == 31 * 24


def test_accuracy_rejects_inverted_range(client):
    r = client.get("/api/accuracy", params={"from": "2026-01-20", "to": "2026-01-10"})
    assert r.status_code == 404


def test_drift(client):
    body = client.get("/api/drift", params={"delivery_date": "2026-01-10"}).json()
    assert len(body["hours"]) == 24 and len(body["actual"]) == 24
    assert body["gate_runs"]["epex_60"] == "2026-01-09T07:30:00+00:00"
    assert len(body["runs"]) >= 8
    published = [r["publish_time_utc"] for r in body["runs"]]
    assert published == sorted(published)


def test_buffer(client):
    lo = client.get("/api/buffer", params={"delivery_date": "2026-01-10",
                                           "confidence": 0.6}).json()
    hi = client.get("/api/buffer", params={"delivery_date": "2026-01-10",
                                           "confidence": 0.95}).json()
    assert hi["totals"]["buffer_mwh"] > lo["totals"]["buffer_mwh"]
    assert hi["backtest"]["firm_shortfall_share"] < lo["backtest"]["firm_shortfall_share"]
    assert client.get("/api/buffer", params={"delivery_date": "2026-01-10",
                                             "confidence": 1.5}).status_code == 422


def test_explorer(client):
    r = client.get("/api/explorer", params={"from": "2026-01-05", "to": "2026-01-06",
                                            "horizon_h": 12})
    body = r.json()
    assert len(body["points"]) == 48
    assert body["summary"]["n"] == 48
    assert client.get("/api/explorer", params={"from": "2026-01-01", "to": "2026-02-01"}
                      ).status_code == 404
