// Mirrors backend/app/api/schemas.py. Power in MW, energy in MWh.

export type GateId = "epex_60" | "n2ex" | "epex_30";

export interface Gate {
  id: GateId;
  label: string;
  market: string;
  local_time: string;
}

export interface DateRange {
  first: string;
  last: string;
}

export type DataSource = "snapshot" | "live";

export interface LiveStatus {
  state: "live" | "stale" | "fallback" | "not_loaded";
  fetched_at: string | null;
  expires_at: string | null;
  last_attempt: string | null;
  error: string | null;
  ttl_seconds: number;
}

export interface SourceStatus {
  requested: DataSource;
  served: DataSource;
  loaded_at: string;
  live: LiveStatus | null;
}

export interface Meta {
  sources: DataSource[];
  default_source: DataSource;
  source: SourceStatus;
  gates: Gate[];
  default_gate: GateId;
  scope_label: string;
  decision_range: DateRange;
  delivery_range: DateRange;
  method: Record<string, string | number>;
  data: {
    built_at: string;
    forecasts: { runs?: number; quality: { runs: number; off_schedule_runs: string[] } };
    actuals: { quality: { rows: number; missing_half_hours: string[] } };
  };
}

export interface CockpitHour {
  time_utc: string;
  label: string;
  lead_h: number | null;
  forecast: number | null;
  p10: number | null;
  p90: number | null;
  corrected: number | null;
  actual: number | null;
}

export interface Cockpit {
  delivery_date: string;
  gate: { id: GateId; label: string; time_utc: string; time_local: string; closed: boolean };
  run: {
    publish_time_utc: string;
    publish_time_local: string;
    age_minutes_at_gate: number;
    next_run_utc: string | null;
    lead_h_min: number | null;
    lead_h_max: number | null;
  };
  bias_applied_mw: number | null;
  hours: CockpitHour[];
  kpis: {
    forecast_mwh: number | null;
    corrected_mwh: number | null;
    p10_mwh: number | null;
    p90_mwh: number | null;
    peak_mw: number | null;
    peak_label: string;
    min_mw: number | null;
    min_label: string;
    riskiest_label: string;
    riskiest_range_mw: number | null;
  };
  outcome: {
    actual_mwh: number | null;
    mae: number | null;
    bias: number | null;
    corrected_mae: number | null;
  } | null;
}

export interface Summary {
  n: number;
  mae?: number;
  rmse?: number;
  bias?: number;
  nmae_pct?: number;
  p50_abs?: number;
  p90_abs?: number;
  p99_abs?: number;
  max_abs?: number;
  over_forecast_share?: number;
  forecast_mwh?: number;
  actual_mwh?: number;
}

export interface GroupStat {
  key: string;
  n: number;
  mae: number;
  bias: number;
  rmse: number;
}

export interface Accuracy {
  gate_id: GateId;
  range: DateRange;
  summary: Summary;
  corrected_summary: Summary;
  calibration: {
    n: number;
    inside_share?: number;
    below_p10_share?: number;
    above_p90_share?: number;
    mean_width?: number;
  };
  gate_comparison: {
    gate_id: GateId;
    label: string;
    local_time: string;
    mae: number | null;
    rmse: number | null;
    bias: number | null;
    p90_abs: number | null;
  }[];
  by_hour: GroupStat[];
  by_lead: GroupStat[];
  by_wind_level: GroupStat[];
  lead_curve_all_runs: GroupStat[];
  histogram: { lo: number; hi: number; count: number }[];
  daily: { date: string; mae: number; bias: number; forecast_mwh: number; actual_mwh: number }[];
}

export interface DriftRun {
  publish_time_utc: string;
  label: string;
  hours_before_delivery: number | null;
  coverage: number;
  values: (number | null)[];
  mae: number | null;
  energy_mwh: number | null;
}

export interface Drift {
  delivery_date: string;
  hours: { time_utc: string; label: string }[];
  actual: (number | null)[];
  actual_mwh: number | null;
  gate_runs: Record<GateId, string | null>;
  runs: DriftRun[];
}

export interface Buffer {
  delivery_date: string;
  gate_id: GateId;
  confidence: number;
  history_hours: number;
  hours: {
    time_utc: string;
    label: string;
    forecast: number | null;
    firm: number | null;
    buffer: number | null;
    actual: number | null;
  }[];
  totals: {
    forecast_mwh: number | null;
    firm_mwh: number | null;
    buffer_mwh: number | null;
    peak_buffer_mw: number | null;
    actual_mwh: number | null;
  };
  backtest: {
    n: number;
    confidence?: number;
    raw_shortfall_share?: number;
    firm_shortfall_share?: number;
    raw_shortfall_mwh?: number;
    firm_shortfall_mwh?: number;
    mean_buffer_mw?: number;
    total_buffer_mwh?: number;
  };
}

export interface Explorer {
  horizon_h: number;
  range: DateRange;
  summary: Summary;
  points: {
    time_utc: string;
    forecast: number | null;
    actual: number | null;
    publish_time_utc: string | null;
  }[];
}
