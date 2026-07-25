"""INSEE BPE (Base permanente des equipements) 2025, commune-level counts.

INSEE publishes one national CSV where each row is a (territory x equipment
type) count, so everything we need is already aggregated per commune.

Three things about the file shape drive the filtering below:
  - GEO_OBJECT mixes 11 territory levels in the same file (COM, ARM, DEP,
    EPCI, bassins de vie...); only COM and ARM are commune-level.
  - Paris arrondissements are GEO_OBJECT "ARM" (75101-75120) and the whole
    of Paris is a separate COM row (75056). communes_ref keys Paris by
    arrondissement, so we take ARM there and drop 75056. The 20 ARM rows
    sum to exactly the 75056 row, so nothing is lost or double-counted.
  - subtotals are inline, flagged "_T" at type, sous-domaine and domaine
    level. Keeping only leaf FACILITY_TYPE rows avoids counting them twice.

Known limitations, worth remembering before scoring on these numbers:
  - counts stop at the commune border, and BPE publishes no coordinates, so
    neighbourhood.aggregate can only reach whole neighbouring communes rather
    than measure to the equipments themselves.
  - equipments are counted, not their capacity (size).
"""

import zipfile
from pathlib import Path

import polars as pl
import requests

from etl.common.communes_ref import IDF_DEPARTMENTS, PARIS_CODE

BPE_URL = "https://www.insee.fr/fr/statistiques/fichier/8217527/DS_BPE_CSV_FR.zip"
DATA_MEMBER = "DS_BPE_2025_data.csv"

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw"
CACHE_PATH = RAW_DIR / "bpe_2025.zip"

# The 7 BPE domaines are too coarse to score on directly, so criteria are
# curated from the 28 sous-domaines instead. Excluded on purpose: A (86% of
# it is artisans du batiment and coiffeurs/restaurants), G (tourisme), F2
# (sports de nature), C4-C7 (universites and formation continue),
# D4/D6/D7 (action sociale, not medical access).

# criterion column -> BPE sous-domaines aggregated whole
SDOM_CRITERIA = {
    "nb_sports": ["F1"],
    "nb_culture": ["F3"],
    "nb_enseignement": ["C1", "C2", "C3"],  # ecoles, colleges, lycees
    "nb_sante": ["D1", "D2", "D3"],  # medical seul, hors action sociale
    "nb_commerces": ["B1", "B2", "B3"],
}

# criterion column -> individual BPE types, where the sous-domaine is too coarse
TYPE_CRITERIA = {
    # creches / micro-creches / RPE / LAEP, pulled out of D5 which also holds
    # accueils de loisirs and centres sociaux.
    "nb_petite_enfance": ["D502", "D503", "D504", "D509"],
}

# Transport deliberately does not come from BPE. Its E1 sous-domaine is 99%
# taxi-VTC registrations (54 895 rows out of 55 328 in IDF), and the gares it
# does carry are SNCF/RER only, no metro, no tram.

CRITERION_COLUMNS = list(SDOM_CRITERIA) + list(TYPE_CRITERIA)


def _download() -> None:
    if not CACHE_PATH.exists():
        response = requests.get(BPE_URL, timeout=300)
        response.raise_for_status()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_bytes(response.content)


def _read_idf_leaf_rows() -> pl.DataFrame:
    """Read the national CSV out of the cached zip and cut it down to leaf
    equipment counts for IDF communes and Paris arrondissements.
    """
    _download()

    with zipfile.ZipFile(CACHE_PATH) as archive:
        raw = pl.read_csv(
            archive.read(DATA_MEMBER),
            separator=";",
            # GEO must stay a string: "01" and "75101" both break as ints.
            schema_overrides={"GEO": pl.Utf8},
        )

    is_idf_commune = (
        (pl.col("GEO_OBJECT") == "COM")
        & pl.col("GEO").str.slice(0, 2).is_in(IDF_DEPARTMENTS)
        & (pl.col("GEO") != PARIS_CODE)
    )
    is_paris_arrondissement = (pl.col("GEO_OBJECT") == "ARM") & pl.col("GEO").str.starts_with("751")

    return (
        raw.filter(pl.col("FACILITY_TYPE") != "_T")
        .filter(is_idf_commune | is_paris_arrondissement)
        .rename({"GEO": "code_insee"})
        .select("code_insee", "FACILITY_SDOM", "FACILITY_TYPE", "OBS_VALUE")
    )


def _sous_domaine_counts(rows: pl.DataFrame) -> pl.DataFrame:
    """One column per BPE sous-domaine, named bpe_a1 ... bpe_g1."""
    wide = (
        rows.group_by("code_insee", "FACILITY_SDOM")
        .agg(pl.col("OBS_VALUE").sum())
        .pivot(on="FACILITY_SDOM", index="code_insee", values="OBS_VALUE")
    )
    return wide.rename({c: f"bpe_{c.lower()}" for c in wide.columns if c != "code_insee"})


def _criterion_counts(rows: pl.DataFrame) -> pl.DataFrame:
    """One column per entry of SDOM_CRITERIA / TYPE_CRITERIA."""
    aggregations = [
        pl.col("OBS_VALUE").filter(pl.col("FACILITY_SDOM").is_in(sdoms)).sum().alias(column)
        for column, sdoms in SDOM_CRITERIA.items()
    ] + [
        pl.col("OBS_VALUE").filter(pl.col("FACILITY_TYPE").is_in(types)).sum().alias(column)
        for column, types in TYPE_CRITERIA.items()
    ]
    return rows.group_by("code_insee").agg(aggregations)


def fetch() -> pl.DataFrame:
    """Return a DataFrame with columns: code_insee, the seven nb_* criterion
    counts, and one bpe_<sous-domaine> raw count per BPE sous-domaine.
    """
    rows = _read_idf_leaf_rows()

    result = _criterion_counts(rows).join(_sous_domaine_counts(rows), on="code_insee", how="left")

    # Unlike rent, a missing value here is a real zero, not an unknown: a
    # commune with no cinema simply has no row in the source file.
    counts = [c for c in result.columns if c != "code_insee"]

    # The pivot emits sous-domaine columns in hash order; sort them so the
    # committed geojson doesn't churn between runs.
    ordered = ["code_insee", *CRITERION_COLUMNS, *sorted(c for c in counts if c.startswith("bpe_"))]

    return result.with_columns(pl.col(counts).fill_null(0).cast(pl.Int32)).select(ordered).sort("code_insee")
