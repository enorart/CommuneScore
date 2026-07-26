"""INSEE geography: the codes every source has to agree on, and the two
operations they all repeat on them.

National files are keyed by code commune. Cutting one down to Ile-de-France and
handing it to geopandas is the same work every time, so it lives here rather
than four times over in etl/sources/.
"""

import pandas as pd
import polars as pl

IDF_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

PARIS_CODE = "75056"


def idf_communes(column: str) -> pl.Expr:
    """Rows of `column` that are an Ile-de-France commune, Paris by arrondissement.

    National files carry Paris twice, as the whole city (75056) and as its 20
    arrondissements (75101-75120). communes_ref keys Paris by arrondissement,
    so 75056 is dropped here; keeping both would count Paris twice.
    """
    code = pl.col(column)
    return code.str.slice(0, 2).is_in(IDF_DEPARTMENTS) & (code != PARIS_CODE)


def by_commune(frame: pl.DataFrame) -> pd.DataFrame:
    """A polars frame carrying code_insee, as pandas indexed by it.

    Sources parse in polars, but the reference table is a GeoDataFrame and
    geopandas only speaks pandas, so every source crosses over at this point.
    """
    return frame.to_pandas().set_index("code_insee")
