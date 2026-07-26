"""Airparif air quality (NO2, PM2.5, PM10, O3) per commune.

Not implemented. Yearly averages rather than current readings: the question is
what a place is usually like, not what it is like today.
"""

import geopandas as gpd
import pandas as pd
import polars as pl


def fetch() -> pl.DataFrame:
    """Return the published yearly concentrations, in the source's own shape."""
    raise NotImplementedError("TODO: call Airparif Explore API v2 (opendata.paris.fr)")


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with columns: no2, pm25, pm10, o3."""
    raise NotImplementedError("TODO: aggregate concentrations onto communes")
