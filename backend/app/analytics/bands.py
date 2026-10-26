"""Empirical uncertainty bands from errors that were already observable at decision time."""

import numpy as np
import pandas as pd

from app.config import LEAD_BUCKET_HOURS, MIN_BUCKET_SAMPLES


def history_before(table: pd.DataFrame, cutoff: pd.Timestamp, days: int) -> pd.DataFrame:
    """Decision rows whose actual outturn was known by ``cutoff`` (the whole hour has
    elapsed), restricted to the trailing ``days``."""
    known = table.start_time + pd.Timedelta(hours=1) <= cutoff
    recent = table.start_time >= cutoff - pd.Timedelta(days=days)
    return table[known & recent & table.error.notna()]


def error_quantiles(history: pd.DataFrame, lead_h: pd.Series, qs: list[float],
                    bucket_h: int = LEAD_BUCKET_HOURS,
                    min_samples: int = MIN_BUCKET_SAMPLES) -> pd.DataFrame:
    """Quantiles of ``error`` for each requested lead time, using errors from the same
    lead-time bucket, falling back to all lead times when the bucket is thin."""
    cols = [f"q{q}" for q in qs]
    if history.empty:
        return pd.DataFrame(np.nan, index=lead_h.index, columns=cols)
    pooled = history.error.quantile(qs).to_numpy()
    hist_bucket = np.floor(history.lead_h / bucket_h)
    per_bucket = {
        b: (grp.quantile(qs).to_numpy() if len(grp) >= min_samples else pooled)
        for b, grp in history.error.groupby(hist_bucket)
    }
    target_bucket = np.floor(lead_h / bucket_h)
    values = [per_bucket.get(b, pooled) for b in target_bucket]
    return pd.DataFrame(values, index=lead_h.index, columns=cols)


def bands_for_day(day: pd.DataFrame, history: pd.DataFrame, low: float = 0.1,
                  high: float = 0.9) -> pd.DataFrame:
    """P10/P90 of *generation*. Since actual = forecast - error, the generation P10 uses
    the error P90 and vice versa."""
    q = error_quantiles(history, day.lead_h, [low, high])
    return pd.DataFrame({
        "p10": (day.forecast - q[f"q{high}"]).clip(lower=0),
        "p90": (day.forecast - q[f"q{low}"]).clip(lower=0),
    }, index=day.index)
