"""Indice de position sociale (IPS) of every school, college and lycee.

The IPS summarises the socio-professional composition of an establishment's
pupils' families in one number: answers "whose children go there".

Three datasets, one per level, all on the Ministry's Opendatasoft portal, all
Licence Ouverte.

Known limitations:
  - the IPS is a social composition, not a quality. Treating a high one as
    "better schools" is the reading this criterion invites and cannot support.
  - where an establishment sits is not where its pupils live, and less so the
    older they are: a commune is the authority for its ecoles, a college
    serves a sector, a lycee recruits across a basin.
  - unweighted by size.
  - an ecole needs at least 25 CM2 pupils over five years to be given an IPS at
    all, so maternelles have none, and the ones below the threshold are
    published as "NS" rather than as a number. 3
"""

import json
import logging

import geopandas as gpd
import pandas as pd
import polars as pl

from etl.common import insee, logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

CATALOG_URL = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets"

# The published rentree. Pinned rather than taken as the newest value so a
# re-publication cannot silently change which year the map is showing, and so
# the three levels are guaranteed to be the same year as each other.
YEAR = "2024-2025"

# One entry per level. `ips` lists the columns to coalesce, in order: a lycee
# general has no voie pro, and its ips_ensemble_gt_pro is published null rather
# than equal to its ips_voie_gt
LEVELS = {
    "ecoles": {
        "dataset": "fr-en-ips-ecoles-ap2022",
        "commune": "code_insee_de_la_commune",
        "nom": "nom_de_l_etablissement",
        "ips": ["ips"],
    },
    "colleges": {
        "dataset": "fr-en-ips-colleges-ap2023",
        "commune": "code_insee_de_la_commune",
        "nom": "nom_de_l_etablissement",
        "ips": ["ips"],
    },
    "lycees": {
        "dataset": "donnees-ips-lycees",
        "commune": "code_commune",
        "nom": "appellation_officielle",
        "ips": ["ips_ensemble_gt_pro", "ips_voie_gt", "ips_voie_pro"],
    },
}

NIVEAUX = list(LEVELS)

# The scored column: one flat mean over every establishment of every level.
IPS_COLUMN = "ips_moyen"


def _cache_name(niveau: str) -> str:
    return f"ips_{niveau}_{YEAR[:4]}.csv"


def _list_column(niveau: str) -> str:
    return f"{niveau}_ips"


def _export_url(niveau: str) -> str:
    """One rentree of one level, as csv.

    Filtered on the year server side because the ecoles file is three rentrees
    deep and only one of them is wanted; not filtered on the departement,
    although it looks like the obvious saving, because the three datasets
    disagree on the format ("75" here, "075" in the lycees sibling). The commune
    code is the one key all three agree on, and insee.idf_communes() is already
    this project's single definition of the region.
    """
    level = LEVELS[niveau]
    columns = ",".join([level["commune"], level["nom"], *level["ips"]])
    return (
        f"{CATALOG_URL}/{level['dataset']}/exports/csv"
        f"?select={columns}&where=rentree_scolaire%3D%22{YEAR}%22&delimiter=,&limit=-1"
    )


def _read_level(niveau: str) -> pl.DataFrame:
    """One level, cut down to Ile-de-France and renamed to the common shape."""
    level = LEVELS[niveau]
    path = cached_download(_export_url(niveau), _cache_name(niveau), timeout=300)

    # The commune code must stay a string: 77001 loses its leading zero as an
    # int. The ecoles file publishes ips as text ("88.7") where the colleges
    # one publishes a double, so both are read as text and cast here.
    raw = pl.read_csv(path, schema_overrides={level["commune"]: pl.Utf8, **{c: pl.Utf8 for c in level["ips"]}})

    idf = (
        raw.rename({level["commune"]: "code_insee", level["nom"]: "nom"})
        .filter(insee.idf_communes("code_insee"))
        .with_columns(
            pl.lit(niveau).alias("niveau"),
            # strict=False is load bearing rather than defensive: DEPP writes
            # "NS" (non significatif) where an establishment is below the 25
            # CM2 threshold, so the column is only numeric once those are out.
            pl.coalesce([pl.col(c).cast(pl.Float64, strict=False) for c in level["ips"]]).alias("ips"),
        )
        .select("code_insee", "niveau", "nom", "ips")
    )

    # An establishment with no IPS carries no information for this layer, but
    # say how many rather than let a change in the suppression marker pass
    # silently as a shrinking layer.
    rows = idf.drop_nulls("ips")

    logger.info(
        "fetched %d %s in %d IDF communes, %d suppressed (%d rows nationally)",
        len(rows),
        niveau,
        rows["code_insee"].n_unique(),
        len(idf) - len(rows),
        len(raw),
    )
    return rows


def fetch() -> pl.DataFrame:
    """Return one row per establishment: code_insee, niveau, nom, ips.

    A deviation from the other sources, which each read one file in its own
    shape: this one reads three and normalises them into a single long frame,
    because the three levels differ only in which columns carry the commune,
    the name and the index. Everything downstream then treats them alike.
    """
    rows = pl.concat([_read_level(niveau) for niveau in NIVEAUX]).sort("code_insee", "niveau", "nom")

    logger.info("fetched %s over %d levels, rentree %s", logs.shape(rows), len(LEVELS), YEAR)
    return rows


def _establishment_lists(rows: pd.DataFrame) -> pd.DataFrame:
    """Per level, the commune's establishments as a JSON [[nom, ips], ...] string.

    JSON rather than the joined string idfm_gares uses for its station names:
    school names carry commas, hyphens and parentheses -- "Ecole du Verre de
    Paris - Lucas de Nehou Lycee Polyvalent des Metiers d'Art" -- so every
    separator is a collision waiting to happen, and the popup needs a name and
    a number per row rather than free text.

    Written as a string here, but it does not reach the browser as one: GDAL
    recognises a string field whose content parses as JSON and writes it out as
    a real array, so the geojson carries [["NOM", 99.1]] rather than an escaped
    string. That is the better output -- no doubled quotes, no escaping bloat --
    and render.js reads either shape rather than depend on the GDAL in use.

    Best first, so a truncated list in the popup still opens on the schools
    someone is choosing between; name breaks ties, so the order is stable
    between runs and the committed geojson does not churn.
    """
    ordered = rows.sort_values(["ips", "nom"], ascending=[False, True])

    return pd.DataFrame(
        {
            _list_column(niveau): (
                ordered[ordered["niveau"] == niveau]
                .groupby("code_insee")
                .apply(
                    lambda group: json.dumps(list(zip(group["nom"], group["ips"])), ensure_ascii=False),
                    include_groups=False,
                )
            )
            for niveau in NIVEAUX
        }
    )


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """The commune's mean IPS, and the establishments it is the mean of.

    One flat mean over all three levels rather than one per level: a mean of
    level means would give a single lycee the same say as a commune's twelve
    ecoles, and would mean something different in the 266 communes with a lycee
    than in the rest.

    Per level counts and means are deliberately not shipped. The popup derives
    both from the list it is already showing, so the summary line and the rows
    beneath it cannot drift apart, and the output carries four new columns
    rather than seven.
    """
    rows = fetch().to_pandas()

    schools = pd.DataFrame({IPS_COLUMN: rows.groupby("code_insee")["ips"].mean().round(1)})
    schools = schools.join(_establishment_lists(rows), how="left").reindex(ref.index)

    # A commune with no lycee has no list, not an empty one to parse.
    schools[[_list_column(n) for n in NIVEAUX]] = schools[[_list_column(n) for n in NIVEAUX]].fillna("")

    scored = schools[IPS_COLUMN]
    logger.info(
        "built %s over %d establishments, IPS median %.1f (%.1f-%.1f), %d communes unscored",
        logs.shape(schools),
        len(rows),
        scored.median(),
        scored.min(),
        scored.max(),
        int(scored.isna().sum()),
    )
    return schools


def metadata() -> dict:
    """Which rentree and which levels, so the popup states them rather than
    keeping its own copy of the year.
    """
    return {
        "enseignement_ips": {
            "annee": YEAR,
            "niveaux": NIVEAUX,
        }
    }
