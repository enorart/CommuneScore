"""Shared normalization helpers to scale raw per-commune metrics to 0-100."""

import pandas as pd


def min_max_scale(series: pd.Series, invert: bool = False) -> pd.Series:
    """Scale a numeric series to 0-100 using min-max normalization.

    Set invert=True for criteria where lower raw values are better
    (e.g. crime rate), so the resulting score still means "higher = better".
    """
    raise NotImplementedError("TODO: implement min-max scaling with invert support")


def z_score_scale(series: pd.Series) -> pd.Series:
    """Alternative scaling that preserves outlier spread."""
    raise NotImplementedError("TODO: implement z-score scaling")
