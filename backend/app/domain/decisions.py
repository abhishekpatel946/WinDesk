"""The decision table: what the buyer saw at each gate, and what actually happened."""

from datetime import date, timedelta

import pandas as pd

from app.config import GatePreset
from app.domain.asof import delivery_hours, gate_time_utc, latest_run_before, run_values

DECISION_COLUMNS = ["delivery_date", "start_time", "gate_time", "publish_time", "lead_h",
                    "forecast", "actual", "error"]


def decision_for_day(forecasts: pd.DataFrame, actual_hourly: pd.Series, delivery_date: date,
                     gate: GatePreset) -> pd.DataFrame:
    """Hourly rows for one delivery day. ``error = forecast - actual`` (positive means the
    forecast promised more wind than was delivered)."""
    cutoff = gate_time_utc(delivery_date, gate)
    publish_time = latest_run_before(forecasts, cutoff)
    hours = delivery_hours(delivery_date)
    if publish_time is None:
        return pd.DataFrame(columns=DECISION_COLUMNS)
    run = run_values(forecasts, publish_time, hours)
    out = pd.DataFrame({
        "delivery_date": delivery_date,
        "start_time": hours,
        "gate_time": cutoff,
        "publish_time": publish_time,
        "lead_h": run.lead_h.to_numpy(),
        "forecast": run.generation.to_numpy(),
        "actual": actual_hourly.reindex(hours).to_numpy(),
    })
    out["error"] = out.forecast - out.actual
    return out


def build_decision_table(forecasts: pd.DataFrame, actual_hourly: pd.Series, gate: GatePreset,
                         first: date, last: date) -> pd.DataFrame:
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    frames = [decision_for_day(forecasts, actual_hourly, d, gate) for d in days]
    frames = [f for f in frames if not f.empty]
    if not frames:
        return pd.DataFrame(columns=DECISION_COLUMNS)
    return pd.concat(frames, ignore_index=True)
