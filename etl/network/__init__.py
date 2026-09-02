"""The transport network drawn behind the map. Not a criterion.

etl/pipeline.py answers "how good is this commune"; this package answers
"where do the trains actually go". Its output is never scored, never joined
onto the reference table and never read by web/scoring.js.

    fetch() -> pl.DataFrame | gpd.GeoDataFrame
        The source's own data, cached through common.cache and parsed.

    build(ref) -> gpd.GeoDataFrame
        The features to draw, in WGS84, carrying the properties the frontend
        filters and styles on. `ref` is the communes_ref table, used here to
        resolve every feature to the communes it touches.

    OUTPUT_NAME: str
        The file it writes into data/processed/.

It is not a second entry point, though. pipeline.main() calls write() once the
scores are out, on the reference table it has already built: two commands
would mean two things to remember and two things for the refresh workflow to
forget, and the overlay going stale is invisible until someone switches a mode
on and finds a line that no longer exists.

Do not confuse this with etl/sources/idfm_gares.py.
They are different questions asked of different datasets, and
merging them would break both.
"""

import json
import logging
import time
from pathlib import Path

import geopandas as gpd

from etl.common import logs
from etl.network import arrets, traces

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "processed"

# Written in this order; each one names its own output file.
SOURCES = [traces, arrets]

# ~1 m. The traces are already simplified to 15 m and no stop is located to
# better than a few metres, so anything finer is noise that only churns the
# committed diff.
COORDINATE_PRECISION = 5

FEATURE_PREFIX = '{ "type": "Feature"'


def _compact(path: Path) -> None:
    """Strip GDAL's decorative whitespace, one feature to a line.

    GDAL writes `[ 2.18844, 49.02479 ]`, and over 19 505 stops those spaces are
    a quarter of the file the browser has to parse. Reparsing is safe here in a
    way it is not for communes_scores.geojson: there is no metadata member to
    splice around, and the coordinates were already rounded on the way out by
    coordinate_precision, so a round trip cannot move them.

    One feature per line is kept deliberately -- it is what makes a diff on
    these files readable when IDFM moves a stop.
    """
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.rstrip(",")
        if not stripped.startswith(FEATURE_PREFIX):
            out.append(line)
            continue
        feature = json.dumps(json.loads(stripped), separators=(",", ":"), ensure_ascii=False)
        out.append(feature + ("," if line.endswith(",") else ""))

    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def _write_file(features: gpd.GeoDataFrame, name: str) -> None:
    path = OUTPUT_DIR / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    features.to_file(path, driver="GeoJSON", coordinate_precision=COORDINATE_PRECISION)
    _compact(path)

    logger.info("wrote %s: %s, %.1f MB", name, logs.shape(features), path.stat().st_size / 1_000_000)


def write(ref: gpd.GeoDataFrame) -> None:
    """Build the overlay files from the reference table the pipeline already has."""
    for step, source in enumerate(SOURCES, start=1):
        name = source.__name__.rsplit(".", 1)[-1]
        logger.info("[%d/%d] %s", step, len(SOURCES), name)

        at = time.perf_counter()
        _write_file(source.build(ref), source.OUTPUT_NAME)
        logger.info("[%d/%d] %s in %.1fs", step, len(SOURCES), name, time.perf_counter() - at)
