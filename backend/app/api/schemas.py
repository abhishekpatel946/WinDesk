"""Response models. Power values are MW (hourly averages), energy values MWh."""

from typing import Literal

from pydantic import BaseModel


class Gate(BaseModel):
    id: str
    label: str
    market: str
    local_time: str


class DateRange(BaseModel):
    first: str
    last: str


class LiveStatus(BaseModel):
    state: Literal["live", "stale", "fallback", "not_loaded"]
    fetched_at: str | None
    expires_at: str | None
    last_attempt: str | None
    error: str | None
    ttl_seconds: int


class SourceStatus(BaseModel):
    requested: Literal["snapshot", "live"]
    served: Literal["snapshot", "live"]
    loaded_at: str
    live: LiveStatus | None = None


class Meta(BaseModel):
    sources: list[str]
    default_source: str
    source: SourceStatus
    gates: list[Gate]
    default_gate: str
    scope_label: str
    decision_range: DateRange
    delivery_range: DateRange
    method: dict[str, str | int]
    data: dict


class CockpitGate(BaseModel):
    id: str
    label: str
    time_utc: str
    time_local: str
    closed: bool


class CockpitRun(BaseModel):
    publish_time_utc: str
    publish_time_local: str
    age_minutes_at_gate: int
    next_run_utc: str | None
    lead_h_min: float | None
    lead_h_max: float | None


class CockpitHour(BaseModel):
    time_utc: str
    label: str
    lead_h: float | None
    forecast: float | None
    p10: float | None
    p90: float | None
    corrected: float | None
    actual: float | None


class CockpitKpis(BaseModel):
    forecast_mwh: float | None
    corrected_mwh: float | None
    p10_mwh: float | None
    p90_mwh: float | None
    peak_mw: float | None
    peak_label: str
    min_mw: float | None
    min_label: str
    riskiest_label: str
    riskiest_range_mw: float | None


class CockpitOutcome(BaseModel):
    actual_mwh: float | None
    mae: float | None
    bias: float | None
    corrected_mae: float | None


class Cockpit(BaseModel):
    delivery_date: str
    gate: CockpitGate
    run: CockpitRun
    bias_applied_mw: float | None
    hours: list[CockpitHour]
    kpis: CockpitKpis
    outcome: CockpitOutcome | None


class Summary(BaseModel):
    n: int
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    nmae_pct: float | None = None
    p50_abs: float | None = None
    p90_abs: float | None = None
    p99_abs: float | None = None
    max_abs: float | None = None
    over_forecast_share: float | None = None
    forecast_mwh: float | None = None
    actual_mwh: float | None = None


class Calibration(BaseModel):
    n: int
    inside_share: float | None = None
    below_p10_share: float | None = None
    above_p90_share: float | None = None
    mean_width: float | None = None


class GateComparison(BaseModel):
    gate_id: str
    label: str
    local_time: str
    mae: float | None
    rmse: float | None
    bias: float | None
    p90_abs: float | None


class GroupStat(BaseModel):
    key: str
    n: float
    mae: float
    bias: float
    rmse: float


class HistogramBin(BaseModel):
    lo: int
    hi: int
    count: int


class DailyStat(BaseModel):
    date: str
    mae: float
    bias: float
    forecast_mwh: float
    actual_mwh: float


class Accuracy(BaseModel):
    gate_id: str
    range: DateRange
    summary: Summary
    corrected_summary: Summary
    calibration: Calibration
    gate_comparison: list[GateComparison]
    by_hour: list[GroupStat]
    by_lead: list[GroupStat]
    by_wind_level: list[GroupStat]
    lead_curve_all_runs: list[GroupStat]
    histogram: list[HistogramBin]
    daily: list[DailyStat]


class HourLabel(BaseModel):
    time_utc: str
    label: str


class DriftRun(BaseModel):
    publish_time_utc: str
    label: str
    hours_before_delivery: float | None
    coverage: int
    values: list[float | None]
    mae: float | None
    energy_mwh: float | None


class Drift(BaseModel):
    delivery_date: str
    hours: list[HourLabel]
    actual: list[float | None]
    actual_mwh: float | None
    gate_runs: dict[str, str | None]
    runs: list[DriftRun]


class BufferHour(BaseModel):
    time_utc: str
    label: str
    forecast: float | None
    firm: float | None
    buffer: float | None
    actual: float | None


class BufferTotals(BaseModel):
    forecast_mwh: float | None
    firm_mwh: float | None
    buffer_mwh: float | None
    peak_buffer_mw: float | None
    actual_mwh: float | None


class BufferBacktest(BaseModel):
    n: int
    confidence: float | None = None
    raw_shortfall_share: float | None = None
    firm_shortfall_share: float | None = None
    raw_shortfall_mwh: float | None = None
    firm_shortfall_mwh: float | None = None
    mean_buffer_mw: float | None = None
    total_buffer_mwh: float | None = None


class Buffer(BaseModel):
    delivery_date: str
    gate_id: str
    confidence: float
    history_hours: int
    hours: list[BufferHour]
    totals: BufferTotals
    backtest: BufferBacktest


class ExplorerPoint(BaseModel):
    time_utc: str
    forecast: float | None
    actual: float | None
    publish_time_utc: str | None


class Explorer(BaseModel):
    horizon_h: float
    range: DateRange
    summary: Summary
    points: list[ExplorerPoint]
