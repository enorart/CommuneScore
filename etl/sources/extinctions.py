"""Cerema's national mapping of night lighting practice : no extinction, partial, total...
https://www.cerema.fr/fr/actualites/extinction-eclairage-public-nouvelles-donnees-2024-2025

Known limitations:
  - detected from space, not declared.
  - it is a record of *change*, not of state.
  - the smallest communes are often not detectable at all,
  having too little light for the algorithm to track.
"""

import logging

import geopandas as gpd
import pandas as pd
import pyogrio

from etl.common import insee, logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

YEAR = 2026
PERIOD = "2014-2025"

URL = (
    "https://static.data.gouv.fr/resources/"
    "cartographie-nationale-des-pratiques-declairage-nocturne/"
    "20260615-080637/carte-extinction-maille-communale-2026.gpkg"
)

CACHE_NAME = f"extinctions_{YEAR}.gpkg"

LAYER = "vecteur_extinction_communes"

# The letter, its date column, and what the popup says when it is the commune's
# most recent event. Ordered as Cerema lists them.
PRACTICES = {
    "E": ("d_extinct", "Extinction en cœur de nuit"),
    "R": ("d_renov", "Extinction partielle ou rénovation"),
    "A": ("d_abandon", "Extinction abandonnée"),
    "D": ("d_extens", "Parc d'éclairage étendu"),
}

# The two codes that carry no date at all, so no event can be latest.
NO_CHANGE = {"X": "Aucun changement détecté", "HT": "Non détectable par satellite"}

CODE_COLUMN = "code_insee"
PRACTICE_COLUMN = "eclairage_pratique"
SINCE_COLUMN = "eclairage_depuis"


def fetch() -> pd.DataFrame:
    """The practice code and the four date columns, per commune, nationally.
    """
    rows = pyogrio.read_dataframe(
        cached_download(URL, CACHE_NAME, timeout=600),
        layer=LAYER,
        columns=[CODE_COLUMN, "changes_EP", *(column for column, _ in PRACTICES.values())],
        read_geometry=False,
        use_arrow=True,
    )

    logger.info("fetched %s for %s, %d communes nationally", logs.shape(rows), PERIOD, len(rows))
    return rows


def _latest(row: pd.Series) -> tuple[str, str | None]:
    """The commune's most recent detected event, as (label, YYYY-MM).

    A date column can hold several dates, comma separated, and a commune
    several letters. The latest event of any kind is the one that describes
    what the commune does now.
    """
    code = row["changes_EP"] if isinstance(row["changes_EP"], str) else ""
    events = [
        (date.strip(), label)
        for letter, (column, label) in PRACTICES.items()
        if letter in code and isinstance(row[column], str)
        for date in row[column].split(",")
        if date.strip()
    ]
    if not events:
        return NO_CHANGE.get(code, "Non renseigné"), None

    date, label = max(events)
    return label, date


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """What the commune's lighting does at night, and since when.

    Note: Paris is the single code 75056, where everything else here keys it by its 20 arrondissements.
    The city runs one lighting policy, so 75056's value is broadcast onto all twenty.
    """
    keys = pd.Series(ref.index, index=ref.index).where(
        ~ref.index.str.startswith(insee.PARIS_CODE[:2]), insee.PARIS_CODE
    )

    rows = fetch().set_index(CODE_COLUMN)
    # Cut to the region before the row wise pass: the file is national, and the
    # only row wanted from outside ref's index is Paris itself.
    practice = rows[rows.index.isin(set(keys))].apply(_latest, axis=1, result_type="expand")
    practice.columns = [PRACTICE_COLUMN, SINCE_COLUMN]

    lighting = practice.reindex(keys).set_axis(ref.index)

    missing = int(lighting[PRACTICE_COLUMN].isna().sum())
    logger.info(
        "built %s, %s",
        logs.shape(lighting),
        ", ".join(f"{count} {label}" for label, count in lighting[PRACTICE_COLUMN].value_counts().items()),
    )
    if missing:
        # Not fatal, unlike bruit: this is a national file on its own COG
        # vintage, and a commune it has not caught up with simply shows no
        # lighting row in the popup rather than losing a score.
        logger.warning("%d communes absent from the national mesh, left unrenseigned", missing)
    return lighting


def metadata() -> dict:
    """The period and the vocabulary, so the popup states what it is showing
    rather than keeping its own copy of the labels.
    """
    return {
        "eclairage_nocturne": {
            "periode": PERIOD,
            "millesime": YEAR,
            "pratiques": [label for _, label in PRACTICES.values()] + list(NO_CHANGE.values()),
        }
    }
