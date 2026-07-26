"""CORINE Land Cover -> share of green and natural space per commune.

Not implemented. Needs a spatial calc: land cover polygons intersected with
commune boundaries and area weighted, which has to happen in a metric CRS (see
neighbourhood.LAMBERT_93).
"""

import geopandas as gpd
import pandas as pd


def fetch() -> gpd.GeoDataFrame:
    """Return the land cover polygons covering Ile-de-France."""
    raise NotImplementedError("TODO: download CORINE land cover")


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with column: pct_espaces_verts."""
    raise NotImplementedError("TODO: intersect land cover with commune polygons")
