"""Count what is within reach of a commune, not just inside it.

Administrative borders are invisible to someone deciding where to live: a
station 500 m away in the next commune still gets you to work. The
neighbourhood of a commune is the commune itself plus a buffer around it, and
the buffer is grown from the polygon rather than from the centroid, so that a
large rural commune still picks up its immediate neighbours.

This only works for sources that publish coordinates.
"""

import logging

import geopandas as gpd
import pandas as pd

logger = logging.getLogger(__name__)

# Metric CRS for France. Buffering has to happen in metres, and the
# reference geometry is WGS84 degrees.
LAMBERT_93 = "EPSG:2154"

DEFAULT_RADIUS_KM = 1.0


def column(base: str, radius_km: float = DEFAULT_RADIUS_KM) -> str:
    """Name a neighbourhood column after the radius it was counted over, so the
    output says what it is (nb_lignes_1km).
    """
    return f"{base}_{radius_km:g}km"


def _buffered(ref: gpd.GeoDataFrame, radius_km: float) -> gpd.GeoDataFrame:
    """Each commune's polygon grown by radius_km, in metres."""
    metric = ref[["geometry"]].to_crs(LAMBERT_93)
    grown = metric.copy()
    grown["geometry"] = metric.buffer(radius_km * 1000)
    return grown


def points_within(
    ref: gpd.GeoDataFrame,
    points: gpd.GeoDataFrame,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> pd.DataFrame:
    """Return every (commune, point) pair where the point is within reach.

    Measures to the points themselves.
    Returns the points' own columns (geometry dropped) plus `code_insee`.
    """
    communes = _buffered(ref, radius_km).rename_axis("code_insee").reset_index()
    hits = points.to_crs(LAMBERT_93).sjoin(communes, how="inner", predicate="within")

    logger.info(
        "%d points within %g km of a commune, from %d points over %d communes",
        len(hits),
        radius_km,
        len(points),
        len(ref),
    )
    return pd.DataFrame(hits.drop(columns="geometry"))


