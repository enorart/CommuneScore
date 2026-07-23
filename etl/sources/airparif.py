"""Airparif air quality (NO2/PM2.5/PM10/O3) yearly rolling averages per commune."""

import pandas as pd


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with columns: no2, pm25, pm10, o3."""
    raise NotImplementedError("TODO: call Airparif Explore API v2 (opendata.paris.fr)")
