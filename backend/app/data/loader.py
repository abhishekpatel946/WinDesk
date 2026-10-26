"""Dataset access for both data sources.

* ``snapshot``: the bundled Elexon extract, loaded once per process.
* ``live``: fetched from Elexon at runtime, cached for ``LIVE_TTL_SECONDS``. If a refresh
  fails, the previous live data keeps being served ("stale"); if there has never been a
  successful fetch, the snapshot is served instead ("fallback").
"""

import json
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import (
    GATES,
    LIVE_TTL_SECONDS,
    SNAPSHOT_DIR,
    SNAPSHOT_SCOPE,
    UK_TZ,
    Scope,
    live_scope,
)
from app.data import elexon
from app.domain.align import hourly_actuals
from app.domain.asof import with_lead_hours
from app.domain.decisions import build_decision_table

log = logging.getLogger(__name__)


@dataclass(eq=False)
class Dataset:
    forecasts: pd.DataFrame  # publish_time, start_time, generation, lead_h
    actuals: pd.DataFrame  # half-hourly: start_time, generation, ...
    actual_hourly: pd.Series  # index start_time (hour), MW
    manifest: dict
    source: str  # "snapshot" or "live"
    scope: Scope
    loaded_at: datetime
    _memo: dict = field(default_factory=dict, repr=False)

    def memo(self, key: tuple, compute: Callable[[], Any]) -> Any:
        """Cache derived results on the dataset so they are dropped with it."""
        if key not in self._memo:
            self._memo[key] = compute()
        return self._memo[key]


def _make_dataset(forecasts: pd.DataFrame, actuals: pd.DataFrame, manifest: dict,
                  source: str, scope: Scope) -> Dataset:
    return Dataset(
        forecasts=with_lead_hours(forecasts),
        actuals=actuals,
        actual_hourly=hourly_actuals(actuals),
        manifest=manifest,
        source=source,
        scope=scope,
        loaded_at=datetime.now(UTC),
    )


def load_snapshot(snapshot_dir: Path = SNAPSHOT_DIR) -> Dataset:
    forecasts = pd.read_csv(snapshot_dir / "forecasts.csv.gz",
                            parse_dates=["publish_time", "start_time"])
    actuals = pd.read_csv(snapshot_dir / "actuals.csv.gz",
                          parse_dates=["publish_time", "start_time"])
    manifest = json.loads((snapshot_dir / "manifest.json").read_text())
    return _make_dataset(forecasts, actuals, manifest, "snapshot", SNAPSHOT_SCOPE)


def fetch_live() -> Dataset:
    scope = live_scope(datetime.now(UK_TZ).date())
    data = elexon.fetch_clean(scope)
    return _make_dataset(data.forecasts, data.actuals, data.manifest, "live", scope)


@lru_cache(maxsize=1)
def _snapshot() -> Dataset:
    return load_snapshot()


class LiveCache:
    def __init__(self, fetch: Callable[[], Dataset], ttl_seconds: int) -> None:
        self._fetch = fetch
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._dataset: Dataset | None = None
        self._fetched_mono = 0.0
        self._last_error: str | None = None
        self._last_attempt: datetime | None = None

    def _expired(self) -> bool:
        return self._dataset is None or time.monotonic() - self._fetched_mono > self._ttl

    def get(self, force: bool = False) -> Dataset | None:
        """Live dataset, refreshing if expired. ``None`` if no fetch has ever succeeded."""
        if not force and not self._expired():
            return self._dataset
        with self._lock:
            if force or self._expired():
                self._last_attempt = datetime.now(UTC)
                try:
                    started = time.monotonic()
                    self._dataset = self._fetch()
                    self._fetched_mono = time.monotonic()
                    self._last_error = None
                    log.info("Live Elexon fetch took %.1fs", self._fetched_mono - started)
                except Exception as exc:  # noqa: BLE001 - any failure falls back
                    log.exception("Live Elexon fetch failed")
                    self._last_error = f"{type(exc).__name__}: {exc}"
            return self._dataset

    def status(self) -> dict:
        ds = self._dataset
        if ds is None:
            state = "fallback" if self._last_error else "not_loaded"
        else:
            state = "stale" if self._last_error else "live"
        expires = (ds.loaded_at + timedelta(seconds=self._ttl)).isoformat() if ds else None
        return {
            "state": state,
            "fetched_at": ds.loaded_at.isoformat() if ds else None,
            "expires_at": expires,
            "last_attempt": self._last_attempt.isoformat() if self._last_attempt else None,
            "error": self._last_error,
            "ttl_seconds": self._ttl,
        }


live_cache = LiveCache(fetch_live, LIVE_TTL_SECONDS)


def get_dataset(source: str = "snapshot") -> Dataset:
    """Dataset for ``source``; live falls back to the snapshot if Elexon is unreachable."""
    if source == "live":
        return live_cache.get() or _snapshot()
    return _snapshot()


def source_status(source: str, served: Dataset) -> dict:
    status = {"requested": source, "served": served.source,
              "loaded_at": served.loaded_at.isoformat()}
    if source == "live":
        status["live"] = live_cache.status()
    return status


def decision_table(ds: Dataset, gate_id: str) -> pd.DataFrame:
    """Decision table from the start of the warm-up history to the last delivery day."""
    return ds.memo(("decisions", gate_id), lambda: build_decision_table(
        ds.forecasts, ds.actual_hourly, GATES[gate_id],
        ds.scope.history_first + timedelta(days=1), ds.scope.delivery_last))
