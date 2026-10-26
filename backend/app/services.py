"""Use-case layer: combines the dataset, domain rules and analytics for the API.

Each use case resolves its dataset once (per ``source``) and memoises derived results on
that dataset, so a live refresh naturally invalidates them.
"""

from datetime import date, timedelta

import pandas as pd

from app.analytics import metrics
from app.analytics.backtest import band_calibration, buffer_backtest, walk_forward
from app.analytics.bands import history_before
from app.analytics.buffer import firm_wind
from app.config import (
    BAND_HISTORY_DAYS,
    BIAS_HISTORY_DAYS,
    DATA_SOURCES,
    DEFAULT_GATE,
    DEFAULT_SOURCE,
    GATES,
    UK_TZ,
)
from app.data.loader import Dataset, decision_table, get_dataset, live_cache, source_status
from app.domain.asof import (
    delivery_window_utc,
    forecast_at_min_lead,
    gate_time_utc,
    runs_for_window,
)


class NotFoundError(ValueError):
    pass


def _iso(t: pd.Timestamp | None) -> str | None:
    return None if t is None or pd.isna(t) else t.isoformat()


def _num(v) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), 1)


def _local_label(t: pd.Timestamp) -> str:
    return t.tz_convert(UK_TZ).strftime("%H:%M")


def _walk_forward(ds: Dataset, gate_id: str) -> pd.DataFrame:
    return ds.memo(("walk_forward", gate_id), lambda: walk_forward(
        decision_table(ds, gate_id), ds.scope.delivery_first, ds.scope.delivery_last))


def _check_delivery_date(ds: Dataset, d: date) -> None:
    first, last = ds.scope.delivery_first, ds.scope.delivery_last
    if not first <= d <= last:
        raise NotFoundError(f"delivery_date must be between {first} and {last}")


def meta(source: str) -> dict:
    ds = get_dataset(source)
    scope = ds.scope
    return {
        "sources": list(DATA_SOURCES),
        "default_source": DEFAULT_SOURCE,
        "source": source_status(source, ds),
        "gates": [
            {"id": g.id, "label": g.label, "market": g.market,
             "local_time": g.local_time.strftime("%H:%M")}
            for g in GATES.values()
        ],
        "default_gate": DEFAULT_GATE,
        "scope_label": scope.label,
        "decision_range": {"first": scope.decision_first.isoformat(),
                           "last": scope.decision_last.isoformat()},
        "delivery_range": {"first": scope.delivery_first.isoformat(),
                           "last": scope.delivery_last.isoformat()},
        "method": {
            "band_history_days": BAND_HISTORY_DAYS,
            "bias_history_days": BIAS_HISTORY_DAYS,
            "delivery_window": "23:00 (D-1) to 23:00 (D), UK local time",
            "error_definition": "forecast - actual (positive = forecast promised more wind)",
        },
        "data": ds.manifest,
    }


def refresh_live() -> dict:
    live_cache.get(force=True)
    return meta("live")


def cockpit(delivery_date: date, gate_id: str, source: str) -> dict:
    ds = get_dataset(source)
    _check_delivery_date(ds, delivery_date)
    wf = _walk_forward(ds, gate_id)
    day = wf[wf.delivery_date == delivery_date].sort_values("start_time")
    if day.empty:
        raise NotFoundError("No forecast was available before this gate")

    gate_time = day.gate_time.iloc[0]
    publish_time = day.publish_time.iloc[0]
    later = ds.forecasts.publish_time[ds.forecasts.publish_time >= gate_time]
    next_run = later.min() if not later.empty else None

    widths = day.p90 - day.p10
    riskiest = day.loc[widths.idxmax()]
    has_actuals = day.actual.notna().all()
    return {
        "delivery_date": delivery_date.isoformat(),
        "gate": {"id": gate_id, "label": GATES[gate_id].label,
                 "time_utc": _iso(gate_time), "time_local": _local_label(gate_time),
                 "closed": bool(gate_time <= pd.Timestamp.now(tz="UTC"))},
        "run": {
            "publish_time_utc": _iso(publish_time),
            "publish_time_local": _local_label(publish_time),
            "age_minutes_at_gate": round((gate_time - publish_time).total_seconds() / 60),
            "next_run_utc": _iso(next_run),
            "lead_h_min": _num(day.lead_h.min()),
            "lead_h_max": _num(day.lead_h.max()),
        },
        "bias_applied_mw": _num(day.bias.iloc[0]),
        "hours": [
            {"time_utc": _iso(r.start_time), "label": _local_label(r.start_time),
             "lead_h": _num(r.lead_h), "forecast": _num(r.forecast), "p10": _num(r.p10),
             "p90": _num(r.p90), "corrected": _num(r.corrected), "actual": _num(r.actual)}
            for r in day.itertuples()
        ],
        "kpis": {
            "forecast_mwh": _num(day.forecast.sum()),
            "corrected_mwh": _num(day.corrected.sum()),
            "p10_mwh": _num(day.p10.sum()),
            "p90_mwh": _num(day.p90.sum()),
            "peak_mw": _num(day.forecast.max()),
            "peak_label": _local_label(day.loc[day.forecast.idxmax(), "start_time"]),
            "min_mw": _num(day.forecast.min()),
            "min_label": _local_label(day.loc[day.forecast.idxmin(), "start_time"]),
            "riskiest_label": _local_label(riskiest.start_time),
            "riskiest_range_mw": _num(widths.max()),
        },
        "outcome": {
            "actual_mwh": _num(day.actual.sum()),
            "mae": _num(day.error.abs().mean()),
            "bias": _num(day.error.mean()),
            "corrected_mae": _num(day.corrected_error.abs().mean()),
        } if has_actuals else None,
    }


def _round_dict(d: dict) -> dict:
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}


def _round_rows(rows: list[dict]) -> list[dict]:
    return [_round_dict(r) for r in rows]


def accuracy(gate_id: str, first: date | None, last: date | None, source: str) -> dict:
    ds = get_dataset(source)
    first = first or ds.scope.delivery_first
    last = last or ds.scope.delivery_last
    if first > last:
        raise NotFoundError("'from' must not be after 'to'")
    return ds.memo(("accuracy", gate_id, first, last), lambda: _accuracy(ds, gate_id, first, last))


def _accuracy(ds: Dataset, gate_id: str, first: date, last: date) -> dict:
    wf = _walk_forward(ds, gate_id)
    sel = wf[(wf.delivery_date >= first) & (wf.delivery_date <= last)]
    if sel.empty:
        raise NotFoundError("No delivery days in the requested range")
    corrected = sel.assign(error=sel.corrected_error, forecast=sel.corrected)

    comparison = []
    for gid, g in GATES.items():
        other = _walk_forward(ds, gid)
        other = other[(other.delivery_date >= first) & (other.delivery_date <= last)]
        s = metrics.summarize(other)
        comparison.append({"gate_id": gid, "label": g.label,
                           "local_time": g.local_time.strftime("%H:%M"),
                           "mae": s.get("mae"), "rmse": s.get("rmse"), "bias": s.get("bias"),
                           "p90_abs": s.get("p90_abs")})

    start, _ = delivery_window_utc(first)
    _, end = delivery_window_utc(last)
    return {
        "gate_id": gate_id,
        "range": {"first": first.isoformat(), "last": last.isoformat()},
        "summary": _round_dict(metrics.summarize(sel)),
        "corrected_summary": _round_dict(metrics.summarize(corrected)),
        "calibration": _round_dict(band_calibration(sel)),
        "gate_comparison": _round_rows(comparison),
        "by_hour": _round_rows(metrics.by_local_hour(sel)),
        "by_lead": _round_rows(metrics.by_lead(sel, size=3)),
        "by_wind_level": _round_rows(metrics.by_wind_level(sel)),
        "lead_curve_all_runs": _round_rows(
            metrics.lead_curve(ds.forecasts, ds.actual_hourly, start, end)),
        "histogram": metrics.histogram(sel.error),
        "daily": _round_rows(metrics.daily(sel)),
    }


def drift(delivery_date: date, source: str) -> dict:
    ds = get_dataset(source)
    _check_delivery_date(ds, delivery_date)
    start, end = delivery_window_utc(delivery_date)
    pts = runs_for_window(ds.forecasts, start, end, published_from=start - pd.Timedelta(days=2))
    hours = pd.date_range(start, end, freq="h", inclusive="left")
    actual = ds.actual_hourly.reindex(hours)

    gate_runs = {}
    for gid in GATES:
        published = ds.forecasts.publish_time[
            ds.forecasts.publish_time < gate_time_utc(delivery_date, GATES[gid])]
        gate_runs[gid] = _iso(published.max()) if not published.empty else None

    runs = []
    for publish_time, grp in pts.groupby("publish_time"):
        vals = grp.set_index("start_time").generation.reindex(hours)
        err = (vals - actual).dropna()
        runs.append({
            "publish_time_utc": _iso(publish_time),
            "label": publish_time.tz_convert(UK_TZ).strftime("%d %b %H:%M"),
            "hours_before_delivery": _num((start - publish_time).total_seconds() / 3600),
            "coverage": int(vals.notna().sum()),
            "values": [_num(v) for v in vals],
            "mae": _num(err.abs().mean()) if not err.empty else None,
            "energy_mwh": _num(vals.sum()) if vals.notna().all() else None,
        })
    return {
        "delivery_date": delivery_date.isoformat(),
        "hours": [{"time_utc": _iso(t), "label": _local_label(t)} for t in hours],
        "actual": [_num(v) for v in actual],
        "actual_mwh": _num(actual.sum()) if actual.notna().all() else None,
        "gate_runs": gate_runs,
        "runs": runs,
    }


def _buffer_backtest(ds: Dataset, gate_id: str, confidence: float) -> dict:
    return ds.memo(("buffer_backtest", gate_id, confidence), lambda: buffer_backtest(
        decision_table(ds, gate_id), ds.scope.delivery_first, ds.scope.delivery_last,
        confidence))


def buffer(delivery_date: date, gate_id: str, confidence: float, source: str) -> dict:
    ds = get_dataset(source)
    _check_delivery_date(ds, delivery_date)
    table = decision_table(ds, gate_id)
    day = table[table.delivery_date == delivery_date].sort_values("start_time")
    if day.empty:
        raise NotFoundError("No forecast was available before this gate")
    hist = history_before(table, day.gate_time.iloc[0], BAND_HISTORY_DAYS)
    fw = day.join(firm_wind(day, hist, confidence))
    return {
        "delivery_date": delivery_date.isoformat(),
        "gate_id": gate_id,
        "confidence": confidence,
        "history_hours": int(len(hist)),
        "hours": [
            {"time_utc": _iso(r.start_time), "label": _local_label(r.start_time),
             "forecast": _num(r.forecast), "firm": _num(r.firm), "buffer": _num(r.buffer),
             "actual": _num(r.actual)}
            for r in fw.itertuples()
        ],
        "totals": {
            "forecast_mwh": _num(fw.forecast.sum()),
            "firm_mwh": _num(fw.firm.sum()),
            "buffer_mwh": _num(fw.buffer.sum()),
            "peak_buffer_mw": _num(fw.buffer.max()),
            "actual_mwh": _num(fw.actual.sum()) if fw.actual.notna().all() else None,
        },
        "backtest": _round_dict(_buffer_backtest(ds, gate_id, confidence)),
    }


MAX_EXPLORER_DAYS = 31


def explorer(first: date, last: date, horizon_h: float, source: str) -> dict:
    if first > last:
        raise NotFoundError("'from' must not be after 'to'")
    if (last - first).days >= MAX_EXPLORER_DAYS:
        raise NotFoundError(f"Range is limited to {MAX_EXPLORER_DAYS} days")
    ds = get_dataset(source)
    lo, hi = ds.scope.delivery_first - timedelta(days=1), ds.scope.delivery_last
    if first < lo or last > hi:
        raise NotFoundError(f"Dates must be between {lo} and {hi}")
    start = pd.Timestamp(first, tz="UTC")
    end = pd.Timestamp(last + timedelta(days=1), tz="UTC")
    fc = forecast_at_min_lead(ds.forecasts, horizon_h, start, end)
    hours = pd.date_range(start, end, freq="h", inclusive="left")
    df = pd.DataFrame({"forecast": fc.generation.reindex(hours),
                       "publish_time": fc.publish_time.reindex(hours),
                       "actual": ds.actual_hourly.reindex(hours)})
    df["error"] = df.forecast - df.actual
    return {
        "horizon_h": horizon_h,
        "range": {"first": first.isoformat(), "last": last.isoformat()},
        "summary": _round_dict(metrics.summarize(df)),
        "points": [
            {"time_utc": _iso(t), "forecast": _num(r.forecast), "actual": _num(r.actual),
             "publish_time_utc": _iso(r.publish_time)}
            for t, r in df.iterrows()
        ],
    }
