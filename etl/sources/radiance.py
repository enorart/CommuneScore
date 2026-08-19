"""Cerema's LuoJia 1-01 night radiance, the input to the light pollution criterion.

The satellite measures the light Ile-de-France sends upwards, at 130 m, in
nW/cm2/sr. It carries no commune at all: the communes come from
intersecting the surface with communes_ref's polygons.
Measures every commune with its lights on, and says nothing about city light extinction.

Known limitations:
  - it is an emission map, not a sky brightness map. It measures light leaving
    the ground, not the glow a resident actually sees.
  - 2018: LuoJia 1-01 was a demonstration satellite and the campaign was not repeated.
  - the commune mean is area weighted, not population weighted, so a large
    commune with a dark forest behind a lit centre reads better than its
    residents experience.
"""

import logging
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize

from etl.common import logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

# The campaign year
YEAR = 2018

# The one resource covering all eight departements. Named for them rather than
# for the region, which is why it is easy to miss among the 73 others.
URL = (
    "https://static.data.gouv.fr/resources/"
    "cartographies-departementales-de-la-radiance-nocturne-du-satellite-luojia-2018/"
    "20240313-155303/radiance-nocturne-luojia1-2018-d75-77-78-91-92-93-94-95.zip"
)

CACHE_NAME = f"radiance_luojia_{YEAR}_idf.zip"

# Metadatas
RESOLUTION_M = 130
UNIT = "nW/cm2/sr"
ACQUISITIONS = ("22 juin 2018, 23h37", "3 octobre 2018, 23h54")

# Handle specific mesured values / noises
NOISE_FLOOR = 2.0
NODATA = 100_000.0
MIN_COVERAGE = 0.5

RADIANCE_COLUMN = "radiance_nocturne"


def _zonal_mean(path: Path, ref: gpd.GeoDataFrame) -> tuple[pd.Series, pd.Series]:
    """The raster's mean inside each commune, and the share of its cells that
    carried a value, both indexed by code_insee.

    Area weighted, every valid cell counting once. The commune polygons are
    reprojected onto the raster rather than the other way round: reprojecting
    1 285 polygons is cheap and leaves the measured values untouched, where
    warping the grid would resample them. Here they land on the same CRS
    anyway, the raster being in Lambert-93 already.
    """
    with rasterio.open(path) as coverage:
        band = coverage.read(1)
        # 1-based, so that 0 can mean "outside every commune" in the one array.
        communes = ref.geometry.to_crs(coverage.crs)
        labels = rasterize(
            ((geometry, index) for index, geometry in enumerate(communes, start=1)),
            out_shape=(coverage.height, coverage.width),
            transform=coverage.transform,
            fill=0,
            dtype="int32",
            # Without it a commune narrower than a cell could rasterise to
            # nothing at all, and the smallest here is 9.6 ha. At 130 m that
            # one lands on 14 cells; the median commune on 460.
            all_touched=True,
        )

    inside = labels > 0
    usable = inside & np.isfinite(band) & (band != NODATA)
    bins = len(ref) + 1
    total = np.bincount(labels[usable], weights=band[usable], minlength=bins)
    cells = np.bincount(labels[usable], minlength=bins)
    every = np.bincount(labels[inside], minlength=bins)

    means = np.where(cells > 0, total / np.maximum(cells, 1), np.nan)
    coverage_share = cells / np.maximum(every, 1)
    return pd.Series(means[1:], index=ref.index), pd.Series(coverage_share[1:], index=ref.index)


def fetch() -> Path:
    """Return the local GeoTIFF path, downloading and unpacking it once.

    A path rather than a frame: a raster has no tabular shape
    until it meets the commune polygons, and that join is build()'s job. The
    unzip is this module's alone: Cerema ships the raster with its QGIS
    style, its metadata and the vector footprint of the two acquisitions, and
    only the raster is read here.
    """
    archive = cached_download(URL, CACHE_NAME, timeout=120)
    with zipfile.ZipFile(archive) as bundle:
        member = next(name for name in bundle.namelist() if name.endswith(".tif"))
        path = archive.parent / Path(member).name
        if not path.exists():
            bundle.extract(member, archive.parent)

    logger.info("fetched %s for %d at %d m", path.name, YEAR, RESOLUTION_M)
    return path


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """The commune's mean upward radiance, in nW/cm2/sr.

    Scored as a rank rather than a level, in the browser: Cerema states that
    absolute radiances from this mosaic are not to be used for quantitative
    comparison. A rank asks only that the surface order communes correctly,
    which the seam check in this module's docstring establishes that it does.
    """
    mean, coverage = _zonal_mean(fetch(), ref)

    # A raster that came back empty would take the criterion down with it
    # silently: every commune would simply stop being scored on light.
    if mean.isna().all():
        raise ValueError("the LuoJia mosaic produced no value for any commune")

    radiance = pd.DataFrame({RADIANCE_COLUMN: mean.where(coverage >= MIN_COVERAGE).round(2)})

    scored = radiance[RADIANCE_COLUMN]
    logger.info(
        "built %s, radiance median %.2f %s (%.2f-%.2f), %d communes at the noise floor, %d unscored",
        logs.shape(radiance),
        scored.median(),
        UNIT,
        scored.min(),
        scored.max(),
        int((scored == 0).sum()),
        int(scored.isna().sum()),
    )
    return radiance


def metadata() -> dict:
    """The vintage, the resolution and the hour of the passes, so the popup
    states what it is showing rather than keeping its own copy.
    """
    return {
        "pollution_lumineuse": {
            "annee": YEAR,
            "satellite": "LuoJia 1-01",
            "resolution_m": RESOLUTION_M,
            "unite": UNIT,
            "passages": list(ACQUISITIONS),
            "seuil_bruit": NOISE_FLOOR,
        }
    }
