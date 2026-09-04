"""Entry point: uv sync --group isochrone && uv run python -m etl.isochrone

Deliberately separate from etl.pipeline, which etl/network/ is deliberately
part of. The rule is not "one command" but "wired into CI": this build needs a
JDK 21, 451 MB of downloads and one to two hours, so folding it into the
pipeline would make every local run unusable. .github/workflows/isochrone.yml runs
it on its own schedule.

Output: data/processed/temps_{transit,velo,marche}.bin.gz + temps_index.json.
"""

import datetime
import gzip
import json
import logging
import time
from pathlib import Path

import numpy as np

from etl.common import communes_ref, logs
from etl.isochrone import (
    DEPARTURE_HOUR,
    DEPARTURE_WINDOW,
    INDEX_NAME,
    MAX_TIME,
    MODES,
    OUTPUT_NAME,
    PERCENTILE,
    UNREACHABLE,
)
from etl.isochrone import matrix as matrices
from etl.isochrone import network as networks

# Named rather than __name__: run as `python -m etl.isochrone`, its __name__ is
# "__main__".
logger = logging.getLogger("etl.isochrone")

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "processed"


def _write_matrix(matrix: np.ndarray, mode: str) -> None:
    """Gzip the raw bytes ourselves rather than trusting the server to.

    GitHub Pages does compress what it serves -- communes_scores.geojson goes
    out at 1.3 MB of its 5.1 -- but that is keyed on content type, and
    application/octet-stream is not on the list. Compressing here makes it
    certain; the browser undoes it with DecompressionStream("gzip").
    """
    path = OUTPUT_DIR / OUTPUT_NAME.format(mode=mode)
    path.write_bytes(gzip.compress(matrix.tobytes(), 9, mtime=0))

    logger.info(
        "wrote %s: %d x %d, %.2f MB raw, %.2f MB gzipped",
        path.name,
        *matrix.shape,
        matrix.nbytes / 1_000_000,
        path.stat().st_size / 1_000_000,
    )


def _write_index(codes, profile: dict) -> None:
    """The order the matrices are in, and what they measure.

    Shipped rather than derived from communes_scores.geojson's feature order:
    a matrix read against the wrong order is wrong silently and everywhere.
    """
    path = OUTPUT_DIR / INDEX_NAME
    path.write_text(
        json.dumps(
            {
                "communes": list(codes),
                "profil": profile
                | {
                    "heure": f"{DEPARTURE_HOUR:02d}:00",
                    "fenetre_min": int(DEPARTURE_WINDOW.total_seconds() // 60),
                    "percentile": PERCENTILE,
                    "max_min": int(MAX_TIME.total_seconds() // 60),
                    "inaccessible": UNREACHABLE,
                },
                "modes": {key: value["label"] for key, value in MODES.items()},
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    logger.info("wrote %s: %d communes, profile %s", path.name, len(codes), profile["date"])


def main() -> None:
    logs.setup()
    started = time.perf_counter()

    logger.info("building the reference table the matrices are indexed by")
    ref = communes_ref.build()
    places = matrices.origins(ref)

    network, profile = networks.build()
    date = datetime.date.fromisoformat(profile["date"])
    logger.info("network ready in %.0fs", time.perf_counter() - started)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for step, mode in enumerate(MODES, start=1):
        logger.info("[%d/%d] %s", step, len(MODES), mode)

        at = time.perf_counter()
        _write_matrix(matrices.compute(network, mode, date, places), mode)
        logger.info("[%d/%d] %s in %.0fs", step, len(MODES), mode, time.perf_counter() - at)

    _write_index(places["id"].to_numpy(), profile)
    logger.info("isochrone finished in %.0fs", time.perf_counter() - started)


if __name__ == "__main__":
    main()
