"""Domain configuration: market deadlines, delivery window and data scope."""

import os
from dataclasses import dataclass
from datetime import date, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "data" / "snapshot"

# Data sources: the bundled snapshot, or Elexon fetched at runtime and cached in memory.
DATA_SOURCES = ("snapshot", "live")
DEFAULT_SOURCE = os.getenv("DEFAULT_DATA_SOURCE", "snapshot")
LIVE_TTL_SECONDS = int(os.getenv("LIVE_TTL_SECONDS", "900"))


@dataclass(frozen=True)
class GatePreset:
    id: str
    label: str
    market: str
    local_time: time  # UK local time on D-1


GATES: dict[str, GatePreset] = {
    g.id: g
    for g in (
        GatePreset("epex_60", "EPEX 60-min auction", "EPEX SPOT GB Day-Ahead hourly", time(9, 20)),
        GatePreset("n2ex", "N2EX hourly auction", "Nord Pool N2EX GB Day-Ahead", time(9, 50)),
        GatePreset("epex_30", "EPEX 30-min auction", "EPEX SPOT GB Day-Ahead half-hourly",
                   time(15, 30)),
    )
}
DEFAULT_GATE = "epex_60"

# GB day-ahead delivery day D runs 23:00 (D-1) to 23:00 (D), UK local time.
DELIVERY_START_LOCAL = time(23, 0)

# Purchase decisions made in January 2026 => deliveries 2 Jan .. 1 Feb 2026.
DECISION_FIRST = date(2026, 1, 1)
DECISION_LAST = date(2026, 1, 31)
DELIVERY_FIRST = date(2026, 1, 2)
DELIVERY_LAST = date(2026, 2, 1)

# December 2025 is ingested only as trailing history for bands and bias correction.
HISTORY_FIRST = date(2025, 12, 1)


@dataclass(frozen=True)
class Scope:
    """Dates a dataset covers. Days before ``delivery_first`` are warm-up history only."""

    label: str
    history_first: date
    delivery_first: date
    delivery_last: date

    @property
    def decision_first(self) -> date:
        return self.delivery_first - timedelta(days=1)

    @property
    def decision_last(self) -> date:
        return self.delivery_last - timedelta(days=1)


SNAPSHOT_SCOPE = Scope("January 2026 purchase decisions", HISTORY_FIRST, DELIVERY_FIRST,
                       DELIVERY_LAST)

# Live data: a rolling window of delivery days ending tomorrow (today's purchase decision).
LIVE_DELIVERY_DAYS = int(os.getenv("LIVE_DELIVERY_DAYS", "60"))
# Warm-up must cover the 30-day band history for the first delivery day.
WARMUP_DAYS = (DELIVERY_FIRST - HISTORY_FIRST).days


def live_scope(today: date) -> Scope:
    """``today`` is the UK-local date: its decision is for delivery tomorrow."""
    last = today + timedelta(days=1)
    first = last - timedelta(days=LIVE_DELIVERY_DAYS - 1)
    return Scope(f"Rolling {LIVE_DELIVERY_DAYS} days to tomorrow",
                 first - timedelta(days=WARMUP_DAYS), first, last)


BAND_HISTORY_DAYS = 30
BIAS_HISTORY_DAYS = 7
LEAD_BUCKET_HOURS = 6
MIN_BUCKET_SAMPLES = 40
