"""Aggregate per-commune counts over a commune and everything near it.

Administrative borders are invisible to someone deciding where to live. A
commune whose only bakery sits 500 m away in the next commune is not a
commune without a bakery, but its own BPE count says otherwise -- and small
communes, which are exactly the ones most dependent on their neighbours,
are hit hardest by that.

Re-counting over a neighbourhood removes the artefact: the bakery next door
counts, and what the score measures becomes "what can be reached from here"
rather than "what the mayor administers".

The neighbourhood of a commune is itself plus every commune intersecting a
buffer around it -- a buffer around the polygon rather than a radius around
the centroid, so that large rural communes still pick up their immediate
neighbours. Population is summed the same way, since anything expressed per
inhabitant has to use the population of the same footprint.
"""

import geopandas as gpd
import pandas as pd

# Metric CRS for France. Buffering has to happen in metres, and the
# reference geometry is WGS84 degrees.
LAMBERT_93 = "EPSG:2154"

DEFAULT_RADIUS_KM = 3.0


def _pairs(ref: gpd.GeoDataFrame, radius_km: float) -> pd.DataFrame:
    """Return (code_insee, neighbour) pairs, including each commune with itself."""
    metric = ref[["geometry"]].to_crs(LAMBERT_93)

    buffered = metric.copy()
    buffered["geometry"] = metric.buffer(radius_km * 1000)

    # Reset the right-hand index into a column: sjoin names the index it
    # carries over after the index itself, which would collide with the
    # left-hand code_insee.
    neighbours = metric.rename_axis("neighbour").reset_index()

    joined = buffered.sjoin(neighbours, how="inner", predicate="intersects")
    return pd.DataFrame(
        {
            "code_insee": joined.index,
            "neighbour": joined["neighbour"].to_numpy(),
        }
    )


def aggregate(
    ref: gpd.GeoDataFrame,
    values: pd.DataFrame,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> pd.DataFrame:
    """Sum `values` and `ref["population"]` over each commune's neighbourhood.

    `ref` is the communes_ref table (indexed by code_insee, carrying
    population and geometry); `values` is any frame of numeric columns on
    the same index. Returns a frame on that index with one summed column per
    input column, plus `population_voisinage`.
    """
    pairs = _pairs(ref, radius_km)

    summable = values.join(ref[["population"]]).rename(columns={"population": "population_voisinage"})

    return (
        pairs.join(summable, on="neighbour")
        .drop(columns="neighbour")
        .groupby("code_insee")
        .sum()
        .reindex(ref.index)
    )
