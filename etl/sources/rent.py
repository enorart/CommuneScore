"""Average rent (EUR/m2) per commune, from ANIL's 'Carte des loyers' dataset
(data.gouv.fr, published via the tabular API).

Four typology-specific resources are published; all four are fetched since
it's the same API shape, but `loyer_m2_appartement` (all apartment typologies
combined) is the one used for the composite score. The others are kept
alongside for tooltip detail, per PROJECT_PLAN.md's "keep raw values
alongside normalized scores" rule.
"""

from pathlib import Path

import pandas as pd
import requests

from etl.common.communes_ref import IDF_DEPARTMENTS

TABULAR_API_URL = "https://tabular-api.data.gouv.fr/api/resources/{rid}/data/json/"

# column name -> data.gouv.fr resource id
RESOURCES = {
    "loyer_m2_appartement": "55b34088-0964-415f-9df7-d87dd98a09be",
    "loyer_m2_t1_t2": "14a1fe11-b2d1-49b3-9f6b-83d12df9482c",
    "loyer_m2_t3_plus": "5e3b28a4-cf56-43a3-ae79-43cceeb27f8c",
    "loyer_m2_maison": "129f764d-b613-44e4-952c-5ff50a8c9b73",
}

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw"


def _fetch_resource(column: str, rid: str) -> pd.DataFrame:
    cache_path = RAW_DIR / f"rent_{column}.json"

    if not cache_path.exists():
        # requests bundles its own CA store (certifi), which sidesteps
        # unreliable OS certificate stores that pandas.read_json's urllib
        # backend depends on for HTTPS.
        response = requests.get(TABULAR_API_URL.format(rid=rid), timeout=60)
        response.raise_for_status()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(response.content)

    raw = pd.read_json(cache_path)
    idf = raw[raw["DEP"].isin(IDF_DEPARTMENTS)]
    idf = idf.rename(columns={"INSEE_C": "code_insee", "loypredm2": column})
    return idf.set_index("code_insee")[[column]]


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with columns:
    loyer_m2_appartement, loyer_m2_t1_t2, loyer_m2_t3_plus, loyer_m2_maison.
    """
    frames = [_fetch_resource(column, rid) for column, rid in RESOURCES.items()]

    result = frames[0]
    for frame in frames[1:]:
        result = result.join(frame, how="outer")
    return result
