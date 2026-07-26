"""Average rent (EUR/m2) per commune, from ANIL's 'Carte des loyers' dataset
(data.gouv.fr, published via the tabular API).

Four typology-specific resources are published; all four are fetched since
it's the same API shape, but `loyer_m2_appartement` (all apartment typologies
combined) is the one used for the composite score. The others are kept
alongside for tooltip detail: the raw numbers are worth more to someone
choosing where to live than the abstract score built from them.
"""

import polars as pl

from etl.common.cache import cached_download
from etl.common.communes_ref import IDF_DEPARTMENTS

TABULAR_API_URL = "https://tabular-api.data.gouv.fr/api/resources/{rid}/data/json/"

# column name -> data.gouv.fr resource id
RESOURCES = {
    "loyer_m2_appartement": "55b34088-0964-415f-9df7-d87dd98a09be",
    "loyer_m2_t1_t2": "14a1fe11-b2d1-49b3-9f6b-83d12df9482c",
    "loyer_m2_t3_plus": "5e3b28a4-cf56-43a3-ae79-43cceeb27f8c",
    "loyer_m2_maison": "129f764d-b613-44e4-952c-5ff50a8c9b73",
}


def _fetch_resource(column: str, rid: str) -> pl.DataFrame:
    path = cached_download(TABULAR_API_URL.format(rid=rid), f"rent_{column}.json", timeout=60)

    raw = pl.read_json(path)
    return raw.filter(pl.col("DEP").is_in(IDF_DEPARTMENTS)).select(
        pl.col("INSEE_C").alias("code_insee"),
        pl.col("loypredm2").alias(column),
    )


def fetch() -> pl.DataFrame:
    """Return a DataFrame with columns: code_insee, loyer_m2_appartement,
    loyer_m2_t1_t2, loyer_m2_t3_plus, loyer_m2_maison.
    """
    frames = [_fetch_resource(column, rid) for column, rid in RESOURCES.items()]

    result = frames[0]
    for frame in frames[1:]:
        result = result.join(frame, on="code_insee", how="full", coalesce=True)
    return result
