"""CORINE Land Cover -> percent green/natural space per commune.

Requires a spatial calc (land cover polygons intersected with commune
boundaries) via geopandas.
"""

import pandas as pd


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with column: pct_espaces_verts."""
    raise NotImplementedError("TODO: download CORINE land cover, spatial intersection with commune polygons")
