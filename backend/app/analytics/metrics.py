"""Forecast error metrics. Input frames carry ``forecast``, ``actual`` and
``error = forecast - actual`` in MW (hourly averages, so MW == MWh per row)."""

import numpy as np
import pandas as pd

from app.config import UK_TZ

WIND_LEVEL_BINS = [0, 5_000, 10_000, 15_000, np.inf]
WIND_LEVEL_LABELS = ["< 5 GW", "5–10 GW", "10–15 GW", "> 15 GW"]


def summarize(df: pd.DataFrame) -> dict:
    d = df.dropna(subset=["error"])
    if d.empty:
        return {"n": 0}
    err, abs_err = d.error, d.error.abs()
    mae = float(abs_err.mean())
    return {
        "n": int(len(d)),
        "mae": mae,
        "rmse": float(np.sqrt((err**2).mean())),
        "bias": float(err.mean()),
        "nmae_pct": 100 * mae / float(d.actual.mean()),
        "p50_abs": float(abs_err.quantile(0.5)),
        "p90_abs": float(abs_err.quantile(0.9)),
        "p99_abs": float(abs_err.quantile(0.99)),
        "max_abs": float(abs_err.max()),
        "over_forecast_share": float((err > 0).mean()),
        "forecast_mwh": float(d.forecast.sum()),
        "actual_mwh": float(d.actual.sum()),
    }


def _group_stats(d: pd.DataFrame, key: pd.Series) -> list[dict]:
    g = d.groupby(key, observed=True)
    out = pd.DataFrame({
        "n": g.error.size(),
        "mae": g.error.apply(lambda e: e.abs().mean()),
        "bias": g.error.mean(),
        "rmse": g.error.apply(lambda e: float(np.sqrt((e**2).mean()))),
    })
    return [{"key": str(k), **{c: float(v) for c, v in row.items()}}
            for k, row in out.iterrows()]


def by_local_hour(df: pd.DataFrame) -> list[dict]:
    d = df.dropna(subset=["error"])
    hour = d.start_time.dt.tz_convert(UK_TZ).dt.strftime("%H:00")
    # Delivery-day order: 23:00 first.
    stats = _group_stats(d, hour)
    return sorted(stats, key=lambda s: (s["key"] != "23:00", s["key"]))


def lead_bucket(lead_h: pd.Series, size: int) -> pd.Series:
    start = (np.floor(lead_h / size) * size).astype(int)
    return start.map(lambda s: f"{s}–{s + size}h")


def by_lead(df: pd.DataFrame, size: int = 6) -> list[dict]:
    d = df.dropna(subset=["error"])
    stats = _group_stats(d, lead_bucket(d.lead_h, size))
    return sorted(stats, key=lambda s: int(s["key"].split("–")[0]))


def by_wind_level(df: pd.DataFrame) -> list[dict]:
    d = df.dropna(subset=["error"])
    level = pd.cut(d.actual, WIND_LEVEL_BINS, labels=WIND_LEVEL_LABELS, right=False)
    return _group_stats(d, level)


def histogram(errors: pd.Series, bin_mw: int = 500) -> list[dict]:
    e = errors.dropna()
    if e.empty:
        return []
    lo = int(np.floor(e.min() / bin_mw) * bin_mw)
    hi = int(np.ceil(e.max() / bin_mw) * bin_mw) + bin_mw
    counts, edges = np.histogram(e, bins=np.arange(lo, hi + 1, bin_mw))
    return [{"lo": int(a), "hi": int(b), "count": int(c)}
            for a, b, c in zip(edges[:-1], edges[1:], counts, strict=True)]


def daily(df: pd.DataFrame) -> list[dict]:
    d = df.dropna(subset=["error"])
    g = d.groupby("delivery_date")
    out = pd.DataFrame({
        "mae": g.error.apply(lambda e: e.abs().mean()),
        "bias": g.error.mean(),
        "forecast_mwh": g.forecast.sum(),
        "actual_mwh": g.actual.sum(),
    })
    return [{"date": k.isoformat(), **{c: float(v) for c, v in row.items()}}
            for k, row in out.iterrows()]


def lead_curve(forecasts: pd.DataFrame, actual_hourly: pd.Series, start: pd.Timestamp,
               end: pd.Timestamp, bucket_h: int = 3, max_lead_h: int = 48) -> list[dict]:
    """Error vs lead time across *every* forecast run (not just the gate run)."""
    f = forecasts[(forecasts.start_time >= start) & (forecasts.start_time < end)
                  & (forecasts.lead_h >= 0) & (forecasts.lead_h < max_lead_h)]
    d = f.assign(actual=f.start_time.map(actual_hourly)).dropna(subset=["actual"])
    d = d.assign(error=d.generation - d.actual)
    stats = _group_stats(d, lead_bucket(d.lead_h, bucket_h))
    return sorted(stats, key=lambda s: int(s["key"].split("–")[0]))
