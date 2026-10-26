"""Rolling bias correction using only errors observable before the decision."""

import pandas as pd


def trailing_bias(history: pd.DataFrame) -> float:
    """Mean ``forecast - actual`` over the history window (0 if there is none)."""
    return float(history.error.mean()) if not history.empty else 0.0


def apply_bias(forecast: pd.Series, bias: float) -> pd.Series:
    return (forecast - bias).clip(lower=0)
