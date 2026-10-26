"""Market-time rules: which forecast was available when, and for which delivery hours.

All timestamps are tz-aware UTC ``pd.Timestamp``s. ``forecasts`` frames have the columns
``publish_time``, ``start_time``, ``generation`` and (after ``with_lead_hours``) ``lead_h``.
"""

from datetime import date, datetime, timedelta

import pandas as pd

from app.config import DELIVERY_START_LOCAL, UK_TZ, GatePreset


def _local_to_utc(day: date, at) -> pd.Timestamp:
    return pd.Timestamp(datetime.combine(day, at, tzinfo=UK_TZ)).tz_convert("UTC")


def gate_time_utc(delivery_date: date, gate: GatePreset) -> pd.Timestamp:
    """Auction deadline for delivery day D: gate local time on D-1."""
    return _local_to_utc(delivery_date - timedelta(days=1), gate.local_time)


def delivery_window_utc(delivery_date: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of delivery day D: 23:00 local on D-1 to 23:00 local on D."""
    start = _local_to_utc(delivery_date - timedelta(days=1), DELIVERY_START_LOCAL)
    end = _local_to_utc(delivery_date, DELIVERY_START_LOCAL)
    return start, end


def delivery_hours(delivery_date: date) -> pd.DatetimeIndex:
    """Hourly target times in the delivery window (23, 24 or 25 on clock-change days)."""
    start, end = delivery_window_utc(delivery_date)
    return pd.date_range(start, end, freq="h", inclusive="left")


def with_lead_hours(forecasts: pd.DataFrame) -> pd.DataFrame:
    out = forecasts.copy()
    out["lead_h"] = (out.start_time - out.publish_time).dt.total_seconds() / 3600.0
    return out


def latest_run_before(forecasts: pd.DataFrame, cutoff: pd.Timestamp) -> pd.Timestamp | None:
    """Publish time of the most recent run published strictly before ``cutoff``."""
    published = forecasts.publish_time[forecasts.publish_time < cutoff]
    return None if published.empty else published.max()


def run_values(forecasts: pd.DataFrame, publish_time: pd.Timestamp,
               targets: pd.DatetimeIndex) -> pd.DataFrame:
    """One run's forecast for ``targets``; hours it does not cover (or that lie in the
    past relative to the run) are NaN."""
    run = forecasts[(forecasts.publish_time == publish_time) & (forecasts.lead_h >= 0)]
    run = run.set_index("start_time")[["generation", "lead_h"]]
    out = run.reindex(targets)
    out.index.name = "start_time"
    return out


def forecast_at_min_lead(forecasts: pd.DataFrame, horizon_h: float, start: pd.Timestamp,
                         end: pd.Timestamp) -> pd.DataFrame:
    """For each target hour in [start, end), the latest forecast published at least
    ``horizon_h`` hours before it."""
    eligible = forecasts[
        (forecasts.lead_h >= horizon_h)
        & (forecasts.start_time >= start)
        & (forecasts.start_time < end)
    ]
    idx = eligible.groupby("start_time").publish_time.idxmax()
    picked = eligible.loc[idx, ["start_time", "publish_time", "generation", "lead_h"]]
    return picked.set_index("start_time").sort_index()


def runs_for_window(forecasts: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp,
                    published_from: pd.Timestamp) -> pd.DataFrame:
    """All genuinely forward-looking forecast points for targets in [start, end) from runs
    published between ``published_from`` and the end of the window."""
    return forecasts[
        (forecasts.start_time >= start)
        & (forecasts.start_time < end)
        & (forecasts.publish_time >= published_from)
        & (forecasts.publish_time < end)
        & (forecasts.lead_h >= 0)
    ].sort_values(["publish_time", "start_time"])
