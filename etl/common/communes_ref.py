"""Reference table: code_insee, name, geometry, population for Île-de-France communes.

Every other source module joins onto this table. Built once from INSEE/IGN
commune boundary + population files (see PROJECT_PLAN.md section 3).
"""

import geopandas as gpd


def build() -> gpd.GeoDataFrame:
    """Return a GeoDataFrame indexed by code_insee with columns:
    name, population, geometry.
    """
    raise NotImplementedError("TODO: load IGN commune boundaries + INSEE population, filter to IDF")
