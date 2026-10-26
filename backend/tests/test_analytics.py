from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.analytics.backtest import band_calibration, buffer_backtest, enrich_day, walk_forward
from app.analytics.bands import bands_for_day, error_quantiles, history_before
from app.analytics.bias import apply_bias, trailing_bias
from app.analytics.buffer import firm_wind
from app.analytics.metrics import by_lead, by_local_hour, histogram, summarize
from app.config import GATES
from app.domain.asof import delivery_hours, gate_time_utc
from tests.conftest import ts


def synthetic_table(days: int = 20, seed: int = 0) -> pd.DataFrame:
    """Decision table for deliveries 1..days Jan 2026 at the 09:20 gate."""
    rng = np.random.default_rng(seed)
    frames = []
    for i in range(days):
        d = date(2026, 1, 1) + timedelta(days=i)
        hours = delivery_hours(d)
        gate = gate_time_utc(d, GATES["epex_60"])
        forecast = rng.uniform(5_000, 15_000, len(hours))
        actual = forecast - rng.normal(1_500, 2_000, len(hours))
        frames.append(pd.DataFrame({
            "delivery_date": d, "start_time": hours, "gate_time": gate,
            "publish_time": gate - pd.Timedelta(minutes=110),
            "lead_h": (hours - gate).total_seconds() / 3600 + 110 / 60,
            "forecast": forecast, "actual": actual, "error": forecast - actual,
        }))
    return pd.concat(frames, ignore_index=True)


class TestSummarize:
    def test_core_metrics(self):
        df = pd.DataFrame({"forecast": [110.0, 90, 130], "actual": [100.0, 100, 100]})
        df["error"] = df.forecast - df.actual
        s = summarize(df)
        assert s["n"] == 3
        assert s["mae"] == pytest.approx(50 / 3)
        assert s["bias"] == pytest.approx(10)
        assert s["rmse"] == pytest.approx(np.sqrt((100 + 100 + 900) / 3))
        assert s["nmae_pct"] == pytest.approx(100 * (50 / 3) / 100)
        assert s["over_forecast_share"] == pytest.approx(2 / 3)

    def test_empty(self):
        assert summarize(pd.DataFrame(columns=["forecast", "actual", "error"])) == {"n": 0}

    def test_histogram_counts_every_error(self):
        e = pd.Series([-1200.0, -10, 0, 499, 501, 3000])
        h = histogram(e, bin_mw=500)
        assert sum(b["count"] for b in h) == len(e)
        assert h[0]["lo"] == -1500

    def test_breakdowns_are_ordered(self):
        t = synthetic_table(3)
        assert by_local_hour(t)[0]["key"] == "23:00"
        leads = [int(b["key"].split("–")[0]) for b in by_lead(t)]
        assert leads == sorted(leads)


class TestHistoryBefore:
    def test_only_hours_fully_elapsed_before_cutoff_within_window(self):
        t = synthetic_table(10)
        cutoff = ts("2026-01-08T09:20")
        h = history_before(t, cutoff, days=3)
        assert (h.start_time + pd.Timedelta(hours=1) <= cutoff).all()
        assert (h.start_time >= cutoff - pd.Timedelta(days=3)).all()
        assert h.start_time.max() == ts("2026-01-08T08:00")


class TestErrorQuantiles:
    def test_falls_back_to_pooled_quantiles_for_thin_buckets(self):
        hist = pd.DataFrame({"lead_h": [1.0] * 50 + [20.0] * 5,
                             "error": [100.0] * 50 + [-900.0] * 5})
        q = error_quantiles(hist, pd.Series([2.0, 21.0, 40.0]), [0.5], bucket_h=6,
                            min_samples=40)
        assert q["q0.5"].tolist() == [100.0, 100.0, 100.0]

    def test_nan_without_history(self):
        empty = pd.DataFrame(columns=["lead_h", "error"])
        assert error_quantiles(empty, pd.Series([1.0]), [0.1]).isna().all().all()


class TestBandsBiasBuffer:
    def test_band_orientation_and_non_negative(self):
        hist = pd.DataFrame({"lead_h": [20.0] * 100, "error": np.linspace(-1000, 3000, 100)})
        day = pd.DataFrame({"lead_h": [20.0, 20.0], "forecast": [10_000.0, 500.0]})
        b = bands_for_day(day, hist)
        assert (b.p10 <= day.forecast).all() and (b.p90 >= b.p10).all()
        assert b.p10.iloc[1] == 0  # clipped, wind cannot be negative

    def test_bias_correction(self):
        hist = pd.DataFrame({"error": [1_000.0, 2_000.0]})
        assert trailing_bias(hist) == 1_500
        assert trailing_bias(hist.iloc[0:0]) == 0
        assert apply_bias(pd.Series([5_000.0, 1_000.0]), 1_500).tolist() == [3_500, 0]

    def test_buffer_grows_with_confidence(self):
        hist = pd.DataFrame({"lead_h": [20.0] * 100, "error": np.linspace(-1000, 3000, 100)})
        day = pd.DataFrame({"lead_h": [20.0], "forecast": [10_000.0]})
        b50, b90 = firm_wind(day, hist, 0.5), firm_wind(day, hist, 0.9)
        assert b90.buffer.iloc[0] > b50.buffer.iloc[0] >= 0
        assert b90.firm.iloc[0] == pytest.approx(10_000 - np.quantile(hist.error, 0.9))


class TestNoLookahead:
    def test_day_result_ignores_everything_unknown_at_its_gate(self):
        t = synthetic_table(20)
        target = date(2026, 1, 15)
        cutoff = gate_time_utc(target, GATES["epex_60"])
        future = t.start_time + pd.Timedelta(hours=1) > cutoff

        tampered = t.copy()
        tampered.loc[future, "actual"] = 0.0
        tampered.loc[future, "error"] = 1e9

        day = t[t.delivery_date == target]
        a = enrich_day(t, day)
        b = enrich_day(tampered, tampered[tampered.delivery_date == target])
        for col in ("p10", "p90", "bias", "corrected"):
            assert np.allclose(a[col], b[col]), col


class TestBacktestOnSyntheticData:
    def test_bias_correction_removes_systematic_error(self):
        t = synthetic_table(25)
        wf = walk_forward(t, date(2026, 1, 10), date(2026, 1, 25))
        assert abs(wf.corrected_error.mean()) < abs(wf.error.mean())

    def test_calibration_and_buffer_backtest_are_sane(self):
        t = synthetic_table(40)
        cal = band_calibration(walk_forward(t, date(2026, 1, 15), date(2026, 2, 9)))
        assert 0.7 < cal["inside_share"] < 0.9
        bt = buffer_backtest(t, date(2026, 1, 15), date(2026, 2, 9), 0.9)
        assert bt["firm_shortfall_share"] < 0.2 < bt["raw_shortfall_share"]


class TestBacktestOnSnapshot:
    """Guards the headline January 2026 findings against regressions."""

    @pytest.fixture(scope="class")
    def table(self):
        from app.data.loader import decision_table, get_dataset
        return decision_table(get_dataset("snapshot"), "epex_60")

    def test_bias_correction_beats_raw_forecast(self, table):
        wf = walk_forward(table, date(2026, 1, 2), date(2026, 2, 1))
        assert summarize(wf)["bias"] > 1_000  # raw forecast systematically over-forecasts
        assert wf.corrected_error.abs().mean() < 0.9 * wf.error.abs().mean()

    def test_bands_are_roughly_calibrated(self, table):
        cal = band_calibration(walk_forward(table, date(2026, 1, 2), date(2026, 2, 1)))
        assert 0.7 < cal["inside_share"] < 0.95
