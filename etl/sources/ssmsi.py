"""SSMSI communal crime statistics, the input to the security criterion.

The SSMSI (Service statistique ministeriel de la securite interieure)
publishes one national file where each row is a (commune x indicator x year)
count of offences recorded by the police and the gendarmerie, located by where
the offence was committed. The parquet edition is taken here: one 16 MB file,
against 5.2 million rows served a hundred at a time over the tabular API.

Only 9 of the 15 published indicators feed the score.
Excluded on purpose:
  - the three stupefiants indicators (usage, usage AFD, trafic). They count
    "mis en cause" on elucidated cases, so they measure police activity rather
    than the risk of living somewhere, and the same person is counted once per
    commune, so they do not even add up across territories.
  - escroqueries et fraudes aux moyens de paiement. Uniquely among the
    indicators, victims are counted at their place of residence rather than
    where the offence happened, most of it being online: it carries no local
    geography at all.
  - vols sans violence contre des personnes. The highest-volume class, and the
    one whose denominator is most wrong: it hits the daytime population, not
    residents. Paris 1er reads 312 per 1 000 on 15 114 inhabitants.
  - violences physiques intrafamiliales. These happen within the household,
    so they are not a risk the neighbourhood confers on someone moving there.

Known limitations, worth remembering before scoring on these numbers:
  - statistical secrecy. Values are published only for communes recording
    more than 5 offences over 3 successive years; below that est_diffuse is
    "ndiff" and the count is withheld. SSMSI publishes for those communes the
    mean count among the suppressed communes of the same departement and year,
    which is what fills the gap here. Small communes are therefore partly
    estimated, and nb_indicateurs_estimes says by how much.
  - place of commission, not of residence. A commune with a station, a mall or
    an office district absorbs offences committed against people who do not
    live there. Central Paris and La Defense read worse than a resident
    experiences.
  - recorded offences, not offences committed.
"""

import polars as pl

from etl.common.cache import cached_download
from etl.common.communes_ref import IDF_DEPARTMENTS, PARIS_CODE

# The RID resolves to the communal base in parquet. data.gouv.fr redirects to
# whichever version of that resource is current, so the URL never goes stale.
DATAGOUV_RESOURCE_URL = "https://www.data.gouv.fr/api/1/datasets/r/{rid}"
RESOURCE_ID = "604d71b8-337d-4869-9226-49e01bae87df"

# Latest year published. Pinned rather than read off the file, so a refreshed
# download cannot silently change which year the map is showing.
YEAR = 2025

CACHE_NAME = f"ssmsi_communes_{YEAR}.parquet"

# criterion column -> the SSMSI indicators summed into it, spelled exactly as
# the source file spells them. The two families are summed together for the
# score; they are kept apart so the popup can break the rate down.
INDICATOR_CRITERIA = {
    "nb_atteintes_personnes": [
        "Violences physiques hors cadre familial",
        "Violences sexuelles",
        "Vols avec armes",
        "Vols violents sans arme",
    ],
    "nb_atteintes_biens": [
        "Cambriolages de logement",
        "Vols de véhicule",
        "Vols dans les véhicules",
        "Vols d'accessoires sur véhicules",
        "Destructions et dégradations volontaires",
    ],
}

CRIME_COLUMNS = list(INDICATOR_CRITERIA)

CURATED_INDICATORS = [label for labels in INDICATOR_CRITERIA.values() for label in labels]


def _read_idf_rows() -> pl.DataFrame:
    """Read the national parquet and cut it down to the curated indicators for
    IDF communes and Paris arrondissements, in YEAR.
    """
    path = cached_download(DATAGOUV_RESOURCE_URL.format(rid=RESOURCE_ID), CACHE_NAME)

    rows = (
        pl.scan_parquet(path)
        .filter(pl.col("annee") == YEAR)
        # `indicateur` is a Categorical; comparing it as text keeps the filter
        # independent of the file's category ordering.
        .filter(pl.col("indicateur").cast(pl.Utf8).is_in(CURATED_INDICATORS))
        .filter(pl.col("CODGEO_2026").str.slice(0, 2).is_in(IDF_DEPARTMENTS))
        .filter(pl.col("CODGEO_2026") != PARIS_CODE)
        .select(
            pl.col("CODGEO_2026").alias("code_insee"),
            pl.col("indicateur").cast(pl.Utf8),
            # Under statistical secrecy the count is withheld, and the mean
            # over the departement's suppressed communes is given instead.
            pl.coalesce("nombre", "complement_info_nombre").alias("faits"),
            (pl.col("est_diffuse") == "ndiff").alias("estime"),
        )
        .collect()
    )

    # A label that stops matching -- a rename upstream, a stray accent here --
    # would silently drop a whole offence class out of the score.
    missing = set(CURATED_INDICATORS) - set(rows["indicateur"].unique())
    if missing:
        raise ValueError(f"SSMSI indicators missing from the source file: {sorted(missing)}")

    return rows


def fetch() -> pl.DataFrame:
    """Return a DataFrame with columns: code_insee, nb_atteintes_personnes,
    nb_atteintes_biens, nb_indicateurs_estimes.

    Counts, not rates: the pipeline turns these into faits per 1 000
    inhabitants using communes_ref's population, so that every rate on the
    site divides by the same figure. The rates published alongside could not
    be summed anyway -- cambriolages are given per 1 000 logements, every
    other indicator per 1 000 habitants.

    A commune absent from the file comes out absent here too, and so lands as
    null rather than as zero: unlike a commune with no cinema in bpe.py, it is
    unknown, not crime-free.
    """
    rows = _read_idf_rows()

    counts = rows.group_by("code_insee").agg(
        [
            pl.col("faits").filter(pl.col("indicateur").is_in(labels)).sum().round().alias(column)
            for column, labels in INDICATOR_CRITERIA.items()
        ]
        # How much of those two counts is SSMSI's departmental mean rather
        # than a real count, out of the 9 curated indicators.
        + [pl.col("estime").sum().alias("nb_indicateurs_estimes")]
    )

    return counts.with_columns(pl.col(c).cast(pl.Int32) for c in counts.columns[1:]).sort("code_insee")
