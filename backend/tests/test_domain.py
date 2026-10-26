from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.config import GATES
from app.domain.align import hourly_actuals
from app.domain.asof import (
    delivery_hours,
    delivery_window_utc,
    forecast_at_min_lead,
    gate_time_utc,
    latest_run_before,
    run_values,
)
from app.domain.decisions import decision_for_day
from tests.conftest import flat_run, make_forecasts, ts


class TestMarketTimes:
    def test_gate_is_on_previous_day_in_uk_local_time(self):
        assert gate_time_utc(date(2026, 1, 10), GATES["epex_60"]) == ts("2026-01-09T09:20")
        assert gate_time_utc(date(2026, 1, 10), GATES["n2ex"]) == ts("2026-01-09T09:50")
        assert gate_time_utc(date(2026, 1, 10), GATES["epex_30"]) == ts("2026-01-09T15:30")

    def test_gate_respects_british_summer_time(self):
        assert gate_time_utc(date(2026, 7, 10), GATES["epex_60"]) == ts("2026-07-09T08:20")

    def test_delivery_window_is_23_to_23_local(self):
        assert delivery_window_utc(date(2026, 1, 10)) == (ts("2026-01-09T23:00"),
                                                           ts("2026-01-10T23:00"))

    @pytest.mark.parametrize(("day", "hours"), [
        (date(2026, 1, 10), 24),
        (date(2026, 3, 29), 23),  # clocks go forward
        (date(2026, 10, 25), 25),  # clocks go back
    ])
    def test_delivery_hours_handle_clock_changes(self, day, hours):
        assert len(delivery_hours(day)) == hours


class TestLatestRun:
    forecasts = make_forecasts({
        **flat_run("2026-01-09T07:30", "2026-01-09T08:00", 48, 1000),
        **flat_run("2026-01-09T09:20", "2026-01-09T10:00", 48, 2000),
        **flat_run("2026-01-09T09:30", "2026-01-09T10:00", 48, 3000),
    })

    def test_run_published_exactly_at_gate_is_not_usable(self):
        assert latest_run_before(self.forecasts, ts("2026-01-09T09:20")) == ts("2026-01-09T07:30")

    def test_picks_most_recent_run_before_gate(self):
        assert latest_run_before(self.forecasts, ts("2026-01-09T09:50")) == ts("2026-01-09T09:30")

    def test_none_when_nothing_published_yet(self):
        assert latest_run_before(self.forecasts, ts("2026-01-09T07:00")) is None


class TestRunValues:
    def test_excludes_hours_before_publish_and_uncovered_hours(self):
        forecasts = make_forecasts(flat_run("2026-01-09T09:30", "2026-01-09T08:00", 5, 500))
        targets = pd.date_range(ts("2026-01-09T08:00"), periods=6, freq="h")
        out = run_values(forecasts, ts("2026-01-09T09:30"), targets)
        # 08:00 and 09:00 are in the past relative to a 09:30 run; 13:00 is not covered.
        assert out.generation.isna().tolist() == [True, True, False, False, False, True]
        assert out.lead_h.iloc[2] == pytest.approx(0.5)


class TestForecastAtMinLead:
    def test_uses_latest_run_at_least_horizon_hours_old(self):
        forecasts = make_forecasts({
            "2026-01-09T00:00": {"2026-01-10T12:00": 100},
            "2026-01-10T00:00": {"2026-01-10T12:00": 200},
            "2026-01-10T06:00": {"2026-01-10T12:00": 300},
        })
        start, end = ts("2026-01-10T12:00"), ts("2026-01-10T13:00")
        assert forecast_at_min_lead(forecasts, 6, start, end).generation.iloc[0] == 300
        assert forecast_at_min_lead(forecasts, 7, start, end).generation.iloc[0] == 200
        assert forecast_at_min_lead(forecasts, 36, start, end).generation.iloc[0] == 100
        assert forecast_at_min_lead(forecasts, 37, start, end).empty


class TestHourlyActuals:
    def test_averages_half_hours_and_drops_incomplete_hours(self):
        actuals = pd.DataFrame({
            "start_time": [ts("2026-01-10T00:00"), ts("2026-01-10T00:30"),
                           ts("2026-01-10T01:00")],
            "generation": [1000, 2000, 5000],
        })
        out = hourly_actuals(actuals)
        assert out.to_dict() == {ts("2026-01-10T00:00"): 1500}


class TestDecisionForDay:
    def test_uses_gate_run_and_signs_error_as_forecast_minus_actual(self, hourly_actual_factory):
        forecasts = make_forecasts({
            **flat_run("2026-01-09T07:30", "2026-01-09T08:00", 60, 10_000),
            **flat_run("2026-01-09T09:30", "2026-01-09T10:00", 60, 12_000),
        })
        actual = hourly_actual_factory("2026-01-09T23:00", [9_000] * 24)
        out = decision_for_day(forecasts, actual, date(2026, 1, 10), GATES["epex_60"])
        assert len(out) == 24
        assert (out.publish_time == ts("2026-01-09T07:30")).all()
        assert np.allclose(out.error, 1_000)
        assert out.lead_h.iloc[0] == pytest.approx(15.5)

    def test_empty_when_no_run_before_gate(self, hourly_actual_factory):
        forecasts = make_forecasts(flat_run("2026-01-09T11:30", "2026-01-09T12:00", 48, 1))
        actual = hourly_actual_factory("2026-01-09T23:00", [1] * 24)
        assert decision_for_day(forecasts, actual, date(2026, 1, 10), GATES["epex_60"]).empty


class TestAgainstSnapshot:
    """Pins down behaviour on the real January 2026 data."""

    @pytest.fixture(scope="class")
    def ds(self):
        from app.data.loader import get_dataset
        return get_dataset()

    @pytest.mark.parametrize(("gate", "expected_run"), [
        ("epex_60", "2026-01-09T07:30"),
        ("n2ex", "2026-01-09T09:30"),
        ("epex_30", "2026-01-09T11:30"),  # the 15:30 run lands exactly at gate closure
    ])
    def test_run_used_per_gate(self, ds, gate, expected_run):
        out = decision_for_day(ds.forecasts, ds.actual_hourly, date(2026, 1, 10), GATES[gate])
        assert (out.publish_time == ts(expected_run)).all()
        assert out.forecast.notna().all() and out.actual.notna().all()

    def test_every_january_decision_is_covered(self):
        from app.data.loader import decision_table, get_dataset
        table = decision_table(get_dataset("snapshot"), "epex_60")
        jan = table[table.delivery_date >= date(2026, 1, 2)]
        assert jan.delivery_date.nunique() == 31
        assert jan.forecast.notna().all() and jan.actual.notna().all()
