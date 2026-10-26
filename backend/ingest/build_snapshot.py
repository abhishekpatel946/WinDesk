"""Download, clean and validate the Elexon data the app needs, then write the snapshot.

Usage (from ``backend/``):  python -m ingest.build_snapshot
"""

import json
import logging

from app.config import SNAPSHOT_DIR
from app.data.elexon import fetch_clean

log = logging.getLogger("build_snapshot")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    log.info("Fetching WINDFOR and FUELHH from Elexon")
    data = fetch_clean()

    iso = "%Y-%m-%dT%H:%M:%SZ"
    data.forecasts.to_csv(SNAPSHOT_DIR / "forecasts.csv.gz", index=False, date_format=iso)
    data.actuals.to_csv(SNAPSHOT_DIR / "actuals.csv.gz", index=False, date_format=iso)
    (SNAPSHOT_DIR / "manifest.json").write_text(json.dumps(data.manifest, indent=2, default=str))
    log.info("Wrote %d forecast rows and %d actual rows to %s", len(data.forecasts),
             len(data.actuals), SNAPSHOT_DIR)


if __name__ == "__main__":
    main()
