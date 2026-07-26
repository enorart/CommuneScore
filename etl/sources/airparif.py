"""Airparif modelled annual concentrations, the input to the air quality criterion.

Airparif models the whole Ile-de-France as a continuous surface, at 6.25 m,
combining its measurement network with traffic counts, emissions and weather.
It is published as a raster per pollutant per year, so unlike every other
source here it carries no commune at all: the communes come from intersecting
the surface with communes_ref's polygons, which is what build() does.

Only 2 of the 4 pollutants feed the score, combined into indice_oms.
  - NO2 and PM2.5 are the two with the clearest health basis.
  - PM10 is carried for the popup but not scored. It tracks PM2.5 closely
    (they are the same particles, one being a subset of the other), so
    scoring it too would weight particles twice against NO2.
  - O3 is carried for the popup but not scored, and it is not a
    concentration: Airparif publishes ozone as the number of days exceeding
    120 ug/m3 over 8 hours.

Known limitations:
  - the commune mean is area weighted, not population weighted. Nothing here
    publishes population on a grid, so a commune with a large forest and a
    dense core on the A86 reads better than its residents experience. The
    same effect flatters big rural communes generally.
  - it is a single figure for a territory the pollution gradient cuts across.
    A commune's peripherique edge can read twice its parkland edge. The
    criterion answers "how polluted is this commune", not "how polluted is
    this street".
  - modelled, not measured. The surface is fitted to a network of a few dozen
    stations; it is at its most reliable near them and near the roads whose
    traffic feeds the model.
  - downsampled. The source is 6.25 m and is requested at RESOLUTION_M below,
    to keep the data file small.
"""

import logging
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize

from etl.common import logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

WCS_URL = "https://namek.airparif.fr/geoserver/Moyenne_annuelle/wcs"

# Latest year in the coverage's time domain. Pinned rather than taking the
# server's default, so a re-publication cannot silently change which year the
# map is showing. DescribeCoverage lists what is available.
YEAR = 2025

# The source grid is 6.25 m over a 180 km square. Requested coarser: the
# smallest Ile-de-France commune (9.6 ha) still covers 18 cells, and every
# pollutant then fits in one ~12 MB download instead of ~3 GB.
RESOLUTION_M = 100
NATIVE_RESOLUTION_M = 6.25

# Ile-de-France, in the coverage's own CRS (Lambert II etendu), with a little
# margin. Hardcoded rather than derived from ref so that the URL, and so the
# cache filename and the manual download path, stay identical run to run.
IDF_BBOX = (534_000, 2_346_000, 691_000, 2_472_000)

# coverage name on the WCS -> the column it contributes. The first three are
# annual mean concentrations in ug/m3; o3 is a count of exceedance days, and
# is named for it so nothing downstream can mistake it for one.
POLLUTANT_COLUMNS = {
    "no2": "no2",
    "pm25": "pm25",
    "pm10": "pm10",
    "o3": "o3_jours_depassement",
}

# WHO 2021 annual guideline values, in ug/m3. indice_oms is the mean of each
# scored pollutant over its guideline, so it reads as "n times the level the
# WHO recommends" and stays meaningful when a commune is good on one and bad
# on the other. Raw ug/m3 could not be combined at all: 10 of NO2 and 10 of
# PM2.5 are not the same news.
WHO_GUIDELINES = {"no2": 10, "pm25": 5}

# GeoServer writes the coverage's own nodata, but the modelled domain is not
# rectangular, so the corners of the requested box come back NaN as well.
NODATA = -9999.0


def _coverage_url(pollutant: str) -> str:
    """The WCS GetCoverage request for one pollutant in YEAR."""
    xmin, ymin, xmax, ymax = IDF_BBOX
    return (
        f"{WCS_URL}?service=WCS&version=2.0.1&request=GetCoverage"
        f"&coverageId=Moyenne_annuelle__{pollutant}"
        "&format=image/geotiff"
        f"&subset=X({xmin},{xmax})&subset=Y({ymin},{ymax})"
        f'&subset=time("{YEAR}-01-01T00:00:00.000Z")'
        f"&scaleFactor={NATIVE_RESOLUTION_M / RESOLUTION_M}"
    )


def _zonal_mean(path: Path, ref: gpd.GeoDataFrame) -> pd.Series:
    """The raster's mean value inside each commune, indexed by code_insee.

    Area weighted, every valid cell counting once. The commune polygons are
    reprojected onto the raster rather than the other way round: reprojecting
    1 285 polygons is cheap and leaves the modelled values untouched, where
    warping the grid would resample them.
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
            # nothing at all, and the smallest here is 9.6 ha.
            all_touched=True,
        )

    usable = (labels > 0) & np.isfinite(band) & (band != NODATA)
    bins = len(ref) + 1
    total = np.bincount(labels[usable], weights=band[usable], minlength=bins)
    cells = np.bincount(labels[usable], minlength=bins)

    means = np.where(cells > 0, total / np.maximum(cells, 1), np.nan)
    return pd.Series(means[1:], index=ref.index)


def fetch() -> dict[str, Path]:
    """Return the local GeoTIFF path of every pollutant, downloading once.

    Paths rather than a frame, unlike the other sources: a raster has no
    tabular shape until it meets the commune polygons, and that join is
    build()'s job. Nothing here is project specific -- it is Airparif's
    surface, in Airparif's CRS, at the resolution it was asked for.
    """
    paths = {
        pollutant: cached_download(
            _coverage_url(pollutant),
            f"airparif_{pollutant}_{YEAR}_{RESOLUTION_M}m.tif",
            timeout=600,
        )
        for pollutant in POLLUTANT_COLUMNS
    }

    logger.info("fetched %d coverages for %d at %d m", len(paths), YEAR, RESOLUTION_M)
    return paths


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """The four pollutants averaged over each commune, plus indice_oms.

    indice_oms is what the criterion scores, and it is a ratio rather than a
    concentration on purpose: the two pollutants worth scoring have guideline
    values a factor of two apart, so only their distance from those guidelines
    is comparable, and only that can be averaged into one number.
    """
    paths = fetch()
    air = pd.DataFrame(
        {column: _zonal_mean(paths[pollutant], ref) for pollutant, column in POLLUTANT_COLUMNS.items()}
    ).round(1)

    # A coverage that came back empty would take the criterion down with it
    # silently: every commune would simply stop being scored on air.
    blank = [column for column in air.columns if air[column].isna().all()]
    if blank:
        raise ValueError(f"Airparif coverages produced no value for any commune: {blank}")

    ratios = pd.concat([air[column] / guideline for column, guideline in WHO_GUIDELINES.items()], axis=1)
    air["indice_oms"] = ratios.mean(axis=1).round(2)

    logger.info(
        "built %s, indice_oms median %.2f x the WHO guideline (%.2f-%.2f), NO2 %.1f-%.1f ug/m3, %d communes unscored",
        logs.shape(air),
        air["indice_oms"].median(),
        air["indice_oms"].min(),
        air["indice_oms"].max(),
        air["no2"].min(),
        air["no2"].max(),
        int(air["indice_oms"].isna().sum()),
    )
    return air


def metadata() -> dict:
    """Which year, at which resolution, and against which guideline values, so
    the popup can state the index it is showing rather than keep its own copy.
    """
    return {
        "air": {
            "annee": YEAR,
            "resolution_m": RESOLUTION_M,
            "seuils_oms": WHO_GUIDELINES,
        }
    }
