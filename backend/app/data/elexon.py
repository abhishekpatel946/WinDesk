"""Elexon BMRS (Insights Solution) access for the FUELHH and WINDFOR streams.

Used both by the offline snapshot builder and by the live data source at runtime.
"""

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pandas as pd

from app.config import SNAPSHOT_SCOPE, Scope

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def forecast_publish_window(scope: Scope) -> tuple[datetime, datetime]:
    """The gate for the first history day is on the previous day; the drift view for the
    last delivery day uses runs published up to the end of that day."""
    start = datetime.combine(scope.history_first - timedelta(days=2), datetime.min.time(), UTC)
    end = datetime.combine(scope.delivery_last + timedelta(days=1), datetime.min.time(), UTC)
    return start, end


def actuals_window(scope: Scope) -> tuple[date, date]:
    return scope.history_first - timedelta(days=1), scope.delivery_last + timedelta(days=1)

log = logging.getLogger(__name__)


def fetch_json(path: str, params: dict[str, str], retries: int = 4, timeout: int = 20) -> list:
    url = f"{BASE_URL}{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRYABLE_STATUS or attempt == retries - 1:
                raise
            delay = float(exc.headers.get("Retry-After") or 2**attempt)
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
            delay = 2**attempt
        log.warning("Retrying %s in %.0fs (attempt %d)", path, delay, attempt + 1)
        time.sleep(delay)
    raise RuntimeError("unreachable")


def _fetch_all(path: str, param_sets: list[dict[str, str]], workers: int) -> list[dict]:
    with ThreadPoolExecutor(max_workers=workers) as pool:
        chunks = pool.map(lambda p: fetch_json(path, p), param_sets)
        return [row for chunk in chunks for row in chunk]


def fetch_wind_actuals(start: date, end: date, chunk_days: int = 14,
                       workers: int = 6) -> list[dict]:
    """FUELHH half-hourly outturn for fuelType WIND, by settlement date (inclusive)."""
    params = []
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=chunk_days - 1), end)
        params.append({"settlementDateFrom": cur.isoformat(), "settlementDateTo": stop.isoformat(),
                       "fuelType": "WIND"})
        cur = stop + timedelta(days=1)
    return _fetch_all("/datasets/FUELHH/stream", params, workers)


def fetch_wind_forecasts(start: datetime, end: datetime, chunk_days: int = 7,
                         workers: int = 6) -> list[dict]:
    """WINDFOR forecast runs whose publishTime falls in [start, end]."""
    params = []
    cur = start
    while cur < end:
        stop = min(cur + timedelta(days=chunk_days), end)
        params.append({"publishDateTimeFrom": cur.strftime("%Y-%m-%dT%H:%M:%SZ"),
                       "publishDateTimeTo": stop.strftime("%Y-%m-%dT%H:%M:%SZ")})
        cur = stop
    return _fetch_all("/datasets/WINDFOR/stream", params, workers)


def clean_forecasts(raw: list[dict], scope: Scope = SNAPSHOT_SCOPE) -> tuple[pd.DataFrame, dict]:
    publish_from, publish_to = forecast_publish_window(scope)
    df = pd.DataFrame(raw)[["publishTime", "startTime", "generation"]]
    df = df.rename(columns={"publishTime": "publish_time", "startTime": "start_time"})
    for col in ("publish_time", "start_time"):
        df[col] = pd.to_datetime(df[col], utc=True)
    before = len(df)
    df = df.drop_duplicates(["publish_time", "start_time"], keep="last")
    df = df[(df.publish_time >= publish_from) & (df.publish_time < publish_to)]
    df = df.sort_values(["publish_time", "start_time"]).reset_index(drop=True)

    runs = df.groupby("publish_time").size()
    runs_per_day = runs.groupby(runs.index.date).size()
    quality = {
        "rows": len(df),
        "duplicates_removed": before - len(df),
        "runs": int(runs.size),
        "points_per_run": {"min": int(runs.min()), "max": int(runs.max())},
        "days_with_unusual_run_count": {
            str(d): int(n) for d, n in runs_per_day.items() if n != 8
        },
        "off_schedule_runs": [
            t.isoformat() for t in runs.index if t.minute != 30
        ],
        "negative_values": int((df.generation < 0).sum()),
    }
    return df, quality


def clean_actuals(raw: list[dict]) -> tuple[pd.DataFrame, dict]:
    df = pd.DataFrame(raw)
    df = df[df.fuelType == "WIND"][
        ["startTime", "publishTime", "settlementDate", "settlementPeriod", "generation"]
    ].rename(columns={"startTime": "start_time", "publishTime": "publish_time",
                      "settlementDate": "settlement_date", "settlementPeriod": "settlement_period"})
    for col in ("publish_time", "start_time"):
        df[col] = pd.to_datetime(df[col], utc=True)
    before = len(df)
    df = df.sort_values("publish_time").drop_duplicates("start_time", keep="last")
    df = df.sort_values("start_time").reset_index(drop=True)

    expected = pd.date_range(df.start_time.min(), df.start_time.max(), freq="30min")
    missing = expected.difference(pd.DatetimeIndex(df.start_time))
    quality = {
        "rows": len(df),
        "duplicates_removed": before - len(df),
        "missing_half_hours": [t.isoformat() for t in missing],
        "negative_values": int((df.generation < 0).sum()),
    }
    return df, quality


@dataclass(frozen=True)
class CleanData:
    forecasts: pd.DataFrame
    actuals: pd.DataFrame
    manifest: dict


def fetch_clean(scope: Scope = SNAPSHOT_SCOPE) -> CleanData:
    """Fetch the scope's analysis window from Elexon and return cleaned frames + manifest."""
    now = datetime.now(UTC)
    publish_from, publish_to = forecast_publish_window(scope)
    actuals_from, actuals_to = actuals_window(scope)
    forecasts, f_quality = clean_forecasts(
        fetch_wind_forecasts(publish_from, min(publish_to, now)), scope)
    actuals, a_quality = clean_actuals(
        fetch_wind_actuals(actuals_from, min(actuals_to, now.date())))
    manifest = {
        "built_at": now.isoformat(timespec="seconds"),
        "source": {
            "actuals": f"{BASE_URL}/datasets/FUELHH/stream (fuelType=WIND)",
            "forecasts": f"{BASE_URL}/datasets/WINDFOR/stream",
        },
        "forecasts": {
            "publish_from": forecasts.publish_time.min().isoformat(),
            "publish_to": forecasts.publish_time.max().isoformat(),
            "target_from": forecasts.start_time.min().isoformat(),
            "target_to": forecasts.start_time.max().isoformat(),
            "quality": f_quality,
        },
        "actuals": {
            "from": actuals.start_time.min().isoformat(),
            "to": actuals.start_time.max().isoformat(),
            "quality": a_quality,
        },
    }
    return CleanData(forecasts, actuals, manifest)
