"""Logging setup, shared by everything under etl/.

Modules only ever call logging.getLogger(__name__) and log; configuring
handlers is the entry point's job, which is what setup() is for. Importing a
source module therefore never reconfigures anyone else's logging.

Log calls pass their arguments lazily (logger.info("%d rows", n), never an
f-string) so nothing is formatted for a level that is switched off.
"""

import logging
import os

# Wide enough for the longest module name, etl.common.neighbourhood.
FORMAT = "%(asctime)s %(levelname)-7s %(name)-24s %(message)s"
DATE_FORMAT = "%H:%M:%S"

DEFAULT_LEVEL = "INFO"

# Libraries that log at INFO about work we already report ourselves.
NOISY = ["pyogrio", "fiona", "urllib3"]


def setup(level: str | int | None = None) -> None:
    """Configure logging for a run. Falls back to the LOG_LEVEL environment
    variable, then to INFO, so a run can be made noisier without touching code:

        LOG_LEVEL=DEBUG uv run python -m etl.pipeline
    """
    logging.basicConfig(
        level=level or os.environ.get("LOG_LEVEL", DEFAULT_LEVEL),
        format=FORMAT,
        datefmt=DATE_FORMAT,
    )

    for name in NOISY:
        logging.getLogger(name).setLevel(logging.WARNING)


def shape(frame) -> str:
    """'1285 rows x 60 columns', so every source reports its frames the same way.

    Works on polars, pandas and geopandas frames alike, which is the point:
    sources parse in one and hand over in another.
    """
    rows, columns = frame.shape
    return f"{rows} rows x {columns} columns"
