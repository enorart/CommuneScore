"""Average rent (EUR/m2) per commune, from ANIL's 'Carte des loyers' dataset
(data.gouv.fr, published via the tabular API).

ANIL publishes one resource per typology. All four are fetched, since it is the
same API shape four times, but only appartement and maison are scored: t1_t2 and
t3_plus are subsets of appartement (correlation .96), so scoring them too would
weight apartments three times against houses. They are kept alongside because
the raw numbers are worth more to someone choosing where to live than the
abstract score built from them.
"""

import geopandas as gpd
import pandas as pd
import polars as pl

from etl.common import insee
from etl.common.cache import cached_download

TABULAR_API_URL = "https://tabular-api.data.gouv.fr/api/resources/{rid}/data/json/"

# column name -> data.gouv.fr resource id
RESOURCES = {
    "loyer_m2_appartement": "55b34088-0964-415f-9df7-d87dd98a09be",
    "loyer_m2_t1_t2": "14a1fe11-b2d1-49b3-9f6b-83d12df9482c",
    "loyer_m2_t3_plus": "5e3b28a4-cf56-43a3-ae79-43cceeb27f8c",
    "loyer_m2_maison": "129f764d-b613-44e4-952c-5ff50a8c9b73",
}

# The typologies averaged into the single figure the score reads.
SCORED_COLUMNS = ["loyer_m2_appartement", "loyer_m2_maison"]


def _fetch_resource(column: str, rid: str) -> pl.DataFrame:
    path = cached_download(TABULAR_API_URL.format(rid=rid), f"rent_{column}.json", timeout=60)

    return (
        pl.read_json(path)
        .filter(insee.idf_communes("INSEE_C"))
        .select(pl.col("INSEE_C").alias("code_insee"), pl.col("loypredm2").alias(column))
    )


def fetch() -> pl.DataFrame:
    """Return a DataFrame with columns: code_insee, then one per typology.

    Joined outer rather than inner: a commune ANIL could price for houses but
    not for flats keeps the figure it does have, and nulls the rest.
    """
    frames = [_fetch_resource(column, rid) for column, rid in RESOURCES.items()]

    result = frames[0]
    for frame in frames[1:]:
        result = result.join(frame, on="code_insee", how="full", coalesce=True)
    return result.sort("code_insee")


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """The four typologies, plus loyer_m2_moyen, the figure the score reads."""
    rents = insee.by_commune(fetch()).reindex(ref.index)
    rents["loyer_m2_moyen"] = rents[SCORED_COLUMNS].mean(axis=1).round(2)
    return rents
