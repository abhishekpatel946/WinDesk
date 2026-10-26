"""Resolution alignment between half-hourly actuals and hourly forecasts."""

import pandas as pd


def hourly_actuals(actuals: pd.DataFrame) -> pd.Series:
    """Average MW of the two half-hours in each clock hour (= MWh delivered in that hour).

    Hours missing either half-hour are dropped rather than guessed.
    """
    s = actuals.set_index("start_time").generation
    grouped = s.groupby(s.index.floor("h"))
    hourly = grouped.mean()[grouped.count() == 2]
    hourly.index.name = "start_time"
    return hourly.rename("actual")
