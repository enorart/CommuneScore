"""Indice de Position Sociale (IPS) of schools and colleges, geolocated.

Not implemented. Optional enrichment on top of BPE's raw school counts: how many
schools are within reach says nothing about them.
"""

import geopandas as gpd
import pandas as pd
import polars as pl


def fetch() -> pl.DataFrame:
    """Return the per school IPS rows, in the source's own shape."""
    raise NotImplementedError("TODO: call data.gouv.fr tabular API for IPS ecoles/colleges")


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with column: ips_moyen."""
    raise NotImplementedError("TODO: average IPS over the schools of each commune")
