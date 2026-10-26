"""Procurement buffer: how much wind can be relied on at a given confidence level."""

import pandas as pd

from app.analytics.bands import error_quantiles


def firm_wind(day: pd.DataFrame, history: pd.DataFrame, confidence: float) -> pd.DataFrame:
    """``firm`` is the generation exceeded with probability ``confidence`` (historically);
    ``buffer`` is how far below the raw forecast that is, i.e. extra energy to secure."""
    q = error_quantiles(history, day.lead_h, [confidence])[f"q{confidence}"]
    firm = (day.forecast - q).clip(lower=0)
    return pd.DataFrame({
        "firm": firm,
        "buffer": (day.forecast - firm).clip(lower=0),
    }, index=day.index)
