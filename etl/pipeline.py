"""Orchestration. Builds the reference table, asks every source for the columns
it contributes, joins them on code_insee and writes the files the frontend
loads.

Nothing here knows what any source's data means: that lives in etl/sources/,
one module per source, all with the same shape (see etl/sources/__init__.py).
Adding a source is writing that module and adding it to SOURCES below.

Main output: data/processed/communes_scores.geojson, raw values only. Nothing
is scored here, because a 0-100 score only means something relative to a set
of communes, and the user picks that set in the browser (see web/scoring.js).

Then the transport network overlay, data/processed/reseau_{traces,arrets}.geojson,
from etl/network/. It carries no scores and joins onto nothing,
but it runs here rather than from a command of its
own. See etl/network/__init__.py.
"""

import json
import logging
import time
from pathlib import Path

import geopandas as gpd

from etl import network
from etl.common import communes_ref, logs, neighbourhood
from etl.sources import (
    airparif,
    bpe,
    bruit,
    extinctions,
    idfm_gares,
    ips_schools,
    mos,
    radiance,
    rent,
    ssmsi,
)

# Named rather than __name__: this module is the entry point, so run as
# `python -m etl.pipeline` its __name__ is "__main__".
logger = logging.getLogger("etl.pipeline")

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "communes_scores.geojson"

# Joined onto the reference table in this order, which is the order their
# columns appear in the output.
SOURCES = [rent, bpe, idfm_gares, ssmsi, airparif, mos, ips_schools, bruit, radiance, extinctions]


def _metadata() -> dict:
    """Choices the ETL made that the frontend has to state back to the user.

    Shipped inside the GeoJSON so the popup reads them instead of hardcoding a
    copy that goes stale the next time a source module changes.
    """
    meta = {"neighbourhood_radius_km": neighbourhood.DEFAULT_RADIUS_KM}

    for source in SOURCES:
        if hasattr(source, "metadata"):
            meta.update(source.metadata())
    return meta


def _write_output(communes: gpd.GeoDataFrame) -> None:
    """Write the GeoJSON, with _metadata() spliced in as a top level member.

    GDAL has no option for foreign members, and reparsing the file to add one
    would rewrite every coordinate on the way out, churning the whole committed
    diff. Inserting the header as text leaves the geometry byte for byte.
    """
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.unlink(missing_ok=True)
    communes.reset_index().to_file(OUTPUT_PATH, driver="GeoJSON")

    metadata = _metadata()
    header = f'\n"metadata": {json.dumps(metadata, ensure_ascii=False)},\n"features": ['
    written = OUTPUT_PATH.read_text(encoding="utf-8")
    OUTPUT_PATH.write_text(written.replace('\n"features": [', header, 1), encoding="utf-8")

    logger.info(
        "wrote %s: %s, %.1f MB, metadata %s",
        OUTPUT_PATH.name,
        logs.shape(communes),
        OUTPUT_PATH.stat().st_size / 1_000_000,
        metadata,
    )


def main() -> None:
    logs.setup()
    started = time.perf_counter()

    logger.info("building the reference table every source joins onto")
    ref = communes_ref.build()

    communes = ref
    for step, source in enumerate(SOURCES, start=1):
        name = source.__name__.rsplit(".", 1)[-1]
        logger.info("[%d/%d] %s", step, len(SOURCES), name)

        at = time.perf_counter()
        contribution = source.build(ref)
        communes = communes.join(contribution, how="left")

        logger.info(
            "[%d/%d] %s contributed %d columns in %.1fs",
            step,
            len(SOURCES),
            name,
            len(contribution.columns),
            time.perf_counter() - at,
        )

    _write_output(communes)

    logger.info("building the transport network overlay")
    network.write(ref)

    logger.info("pipeline finished in %.1fs", time.perf_counter() - started)


if __name__ == "__main__":
    main()
