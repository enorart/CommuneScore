"""Shared normalization helpers to scale raw per-commune metrics to 0-100."""

import numpy as np
import pandas as pd


def percentile_rank(series: pd.Series, invert: bool = False) -> pd.Series:
    """Scale a numeric series to 0-100 by rank among all communes.

    Preferred over min_max_scale for the equipment and rent criteria: those
    distributions have long tails (one commune with a hospital cluster, one
    with a retail park), and min-max lets a single outlier compress every
    other commune into the bottom of the colour scale. Ranking is immune to
    that by construction and spreads communes evenly across the map.

    The trade-off is that absolute magnitude is lost -- being 10x better
    than the median and being marginally better both just mean "higher
    rank" -- which is why the pipeline keeps the raw values alongside for
    tooltips.

    Ties share the average of the ranks they span. Set invert=True where
    lower raw values are better (rent, crime rate), so the resulting score
    always means "higher = better".
    """
    ranked = series.rank(method="average", pct=True, ascending=not invert)
    return ranked * 100


def min_max_scale(series: pd.Series, invert: bool = False) -> pd.Series:
    """Scale a numeric series to 0-100 using min-max normalization.

    Set invert=True for criteria where lower raw values are better
    (e.g. crime rate), so the resulting score still means "higher = better".

    Outlier-sensitive by nature -- see percentile_rank for why the current
    criteria use ranking instead.
    """
    low, high = series.min(), series.max()
    if high == low:
        return pd.Series(50.0, index=series.index)

    scaled = (series - low) / (high - low) * 100
    return 100 - scaled if invert else scaled


def log_min_max_scale(series: pd.Series, invert: bool = False) -> pd.Series:
    """Scale a count to 0-100 on a log scale, for metrics that saturate.

    Used for equipment reachable within a few km. Going from 1 bakery within
    reach to 10 changes daily life; going from 300 to 3000 does not, and a
    scale that treats those two steps alike is lying about access.

    percentile_rank cannot express that at all -- rank is invariant under
    any monotonic transform, so ranking log(count) and ranking count give
    identical results. Plain min_max_scale would let central Paris compress
    every other commune toward zero. Taking log1p first, then min-max, keeps
    the resolution where the differences are actually felt.
    """
    return min_max_scale(np.log1p(series), invert=invert)

