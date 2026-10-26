"""Walk-forward replay of each delivery day using only history available at its gate."""

from datetime import date

import pandas as pd

from app.analytics.bands import bands_for_day, history_before
from app.analytics.bias import apply_bias, trailing_bias
from app.analytics.buffer import firm_wind
from app.config import BAND_HISTORY_DAYS, BIAS_HISTORY_DAYS


def _in_range(table: pd.DataFrame, first: date, last: date) -> pd.DataFrame:
    return table[(table.delivery_date >= first) & (table.delivery_date <= last)]


def enrich_day(table: pd.DataFrame, day: pd.DataFrame) -> pd.DataFrame:
    """Add ``p10``, ``p90``, ``bias`` and ``corrected`` to one delivery day's rows."""
    cutoff = day.gate_time.iloc[0]
    bands = bands_for_day(day, history_before(table, cutoff, BAND_HISTORY_DAYS))
    bias = trailing_bias(history_before(table, cutoff, BIAS_HISTORY_DAYS))
    return day.assign(p10=bands.p10, p90=bands.p90, bias=bias,
                      corrected=apply_bias(day.forecast, bias))


def walk_forward(table: pd.DataFrame, first: date, last: date) -> pd.DataFrame:
    days = [enrich_day(table, d) for _, d in _in_range(table, first, last).groupby("delivery_date")]
    out = pd.concat(days) if days else table.iloc[0:0]
    return out.assign(corrected_error=out.corrected - out.actual)


def band_calibration(enriched: pd.DataFrame) -> dict:
    d = enriched.dropna(subset=["actual", "p10", "p90"])
    if d.empty:
        return {"n": 0}
    return {
        "n": int(len(d)),
        "inside_share": float(((d.actual >= d.p10) & (d.actual <= d.p90)).mean()),
        "below_p10_share": float((d.actual < d.p10).mean()),
        "above_p90_share": float((d.actual > d.p90).mean()),
        "mean_width": float((d.p90 - d.p10).mean()),
    }


def buffer_backtest(table: pd.DataFrame, first: date, last: date, confidence: float) -> dict:
    """How often the buyer would have been short of wind if they planned on the raw
    forecast vs on the firm-wind level at ``confidence``."""
    frames = []
    for _, day in _in_range(table, first, last).groupby("delivery_date"):
        hist = history_before(table, day.gate_time.iloc[0], BAND_HISTORY_DAYS)
        frames.append(day.join(firm_wind(day, hist, confidence)))
    if not frames:
        return {"n": 0}
    d = pd.concat(frames).dropna(subset=["actual", "firm"])
    raw_short = (d.forecast - d.actual).clip(lower=0)
    firm_short = (d.firm - d.actual).clip(lower=0)
    return {
        "n": int(len(d)),
        "confidence": confidence,
        "raw_shortfall_share": float((raw_short > 0).mean()),
        "firm_shortfall_share": float((firm_short > 0).mean()),
        "raw_shortfall_mwh": float(raw_short.sum()),
        "firm_shortfall_mwh": float(firm_short.sum()),
        "mean_buffer_mw": float(d.buffer.mean()),
        "total_buffer_mwh": float(d.buffer.sum()),
    }
