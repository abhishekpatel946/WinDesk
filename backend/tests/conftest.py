import pandas as pd
import pytest

from app.domain.asof import with_lead_hours


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def make_forecasts(runs: dict[str, dict[str, float]]) -> pd.DataFrame:
    """``{publish_time: {start_time: MW}}`` -> forecasts frame with lead_h."""
    rows = [
        {"publish_time": ts(p), "start_time": ts(s), "generation": v}
        for p, points in runs.items()
        for s, v in points.items()
    ]
    return with_lead_hours(pd.DataFrame(rows))


def flat_run(publish: str, start: str, hours: int, mw: float) -> dict[str, dict[str, float]]:
    times = pd.date_range(ts(start), periods=hours, freq="h")
    return {publish: {t.isoformat(): mw for t in times}}


@pytest.fixture
def hourly_actual_factory():
    def _make(start: str, values: list[float]) -> pd.Series:
        idx = pd.date_range(ts(start), periods=len(values), freq="h", name="start_time")
        return pd.Series(values, index=idx, name="actual")

    return _make
