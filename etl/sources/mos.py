"""Institut Paris Region MOS (mode d'occupation du sol) -> green space per commune.

The MOS is Ile-de-France's own land cover inventory, photo-interpreted since
1982 and re-published in 2026 with its two most recent millesimes in open data.
It carries 687 557 polygons cut at commune boundaries, each one already tagged with its
code INSEE and its surface in m2, so unlike airparif this source needs no
spatial work at all: the commune shares are a group_by.

Green space : what a resident can walk into:
  - excluded, postes 6-9 (terres labourees, prairies, vergers, maraichage).
    5 886 km2 region-wide, green on a map and not amenity: private
  - excluded, poste 16 (jardins de l'habitat), 186 km2: private.
  - excluded, poste 26 (surfaces engazonnees), 272 km2:  roadside and
  housing-estate lawn is visible green, but it is not somewhere anyone goes.
  - excluded, postes 17-23 (terrains de sport, tennis, golfs, hippodromes,
    camping). Ticketed or members-only, and the BPE sport criterion already
    counts the public ones.
  - excluded, poste 25 (cimetieres).
  - excluded, postes 11-12 (eau fermee, cours d'eau).
  - excluded, poste 24 (esplanades et places). Mineral.

Known limitations:
  - measured over the commune alone, so a commune that stops at the edge of a
    park reads poorer than its residents live. Vincennes does not get the Bois
    de Vincennes, which is in the 12e.
  - a share of surface says nothing about where inside the commune it sits. A
    commune whose green is one block of forest at its far edge reads like one
    with the same area spread over ten squares.
"""

import logging

import geopandas as gpd
import pandas as pd
import polars as pl

from etl.common import insee, logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

DATASET = "mos-occupation-du-sol-2025-and-2021-en-79-postes-de-la-region-ile-de-france"
EXPORT_URL = f"https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/{DATASET}/exports/csv"

# The published millesime. Pinned rather than taken as the newest column so a
# re-publication cannot silently change which year the map is showing
YEAR = 2025

CACHE_NAME = f"mos_{YEAR}_idf.csv"

# poste -> the family it feeds. The two green families are summed into the
# scored share and shown separately in the popup, because "60 % forest" and
# "60 % public parks" are not the same place.
GREEN_POSTES = {
    1: "foret",  # Bois ou forets
    4: "foret",  # Espaces ouverts a vegetation arbustive ou herbacee
    5: "foret",  # Berges
    13: "parcs",  # Parcs ou jardins publics
    14: "parcs",  # Autres espaces verts
    15: "parcs",  # Jardins familiaux
}

# Green, and deliberately not scored
# Published so the popup can show what the rest of the surface is.
CONTEXT_POSTES = {
    6: "agricole",  # Terres labourees
    7: "agricole",  # Prairies
    8: "agricole",  # Vergers, pepinieres
    9: "agricole",  # Maraichage, horticulture
    16: "jardins_prives",  # Jardins de l'habitat
}

POSTE_FAMILIES = GREEN_POSTES | CONTEXT_POSTES

GREEN_FAMILIES = sorted(set(GREEN_POSTES.values()))
CONTEXT_FAMILIES = sorted(set(CONTEXT_POSTES.values()))

# Every share is of the whole commune, so the denominator sums all 79 postes,
# not only the ones named above. It comes from the MOS itself rather than from
# communes_ref's polygon, whose geometry is simplified to ~20 m.
TOTAL_COLUMN = "surface_totale"

# The scored family, the sum of GREEN_FAMILIES.
GREEN_COLUMN = "espaces_verts"


def _export_url() -> str:
    """The whole layer as csv, without its geometry.

    `select` is what makes this affordable: dropping geo_shape takes the export
    to 15 MB, where the 11 curated postes alone come to 230 MB with their
    polygons. The geometry buys nothing here anyway, since every polygon
    already names its commune -- it would only be needed to reach past the
    border, which build() explains this source cannot do.
    """
    return f"{EXPORT_URL}?select=insee,mos{YEAR},st_area_sh&delimiter=,&limit=-1"


def _column(family: str) -> str:
    return f"surface_{family}"


def fetch() -> pl.DataFrame:
    """Return one row per commune: m2 of each curated family, and of everything.

    Curated here rather than in build() for the same reason bpe.py curates in
    fetch(): 687 557 polygons collapse to 1 285 rows, and carrying the other
    686 000 across to pandas would buy nothing.
    """
    polygons = pl.read_csv(cached_download(_export_url(), CACHE_NAME, timeout=900))

    poste = pl.col(f"mos{YEAR}")
    area = pl.col("st_area_sh")

    surfaces = (
        # `insee` is published as an integer, so 77001 lost its leading zero on
        # the way out. Every other source keys on the 5-character string.
        polygons.with_columns(pl.col("insee").cast(pl.Utf8).str.zfill(5).alias("code_insee"))
        .group_by("code_insee")
        .agg(
            [
                area.filter(poste.is_in([p for p, f in POSTE_FAMILIES.items() if f == family]))
                .sum()
                .alias(_column(family))
                for family in GREEN_FAMILIES + CONTEXT_FAMILIES
            ]
            + [area.sum().alias(TOTAL_COLUMN)]
        )
        # A commune with no forest has 0 m2 of forest, not an unknown one: the
        # MOS covers the whole region, so an absent poste is a real absence.
        .fill_null(0.0)
        .sort("code_insee")
    )

    logger.info(
        "fetched %s from %d polygons over %d postes, %d curated",
        logs.shape(surfaces),
        len(polygons),
        polygons[f"mos{YEAR}"].n_unique(),
        len(POSTE_FAMILIES),
    )
    return surfaces


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """Each family as a share of the commune's own surface.

    The commune alone: a commune wrapped around a park it does not contain reads
    poorer than its residents live.
    """
    surfaces = insee.by_commune(fetch()).reindex(ref.index)
    surfaces[_column(GREEN_COLUMN)] = surfaces[[_column(family) for family in GREEN_FAMILIES]].sum(axis=1)

    total = surfaces[TOTAL_COLUMN]
    shares = pd.DataFrame(
        {
            f"pct_{family}": (100 * surfaces[_column(family)] / total).round(1)
            for family in [GREEN_COLUMN, *GREEN_FAMILIES, *CONTEXT_FAMILIES]
        }
    )

    scored = shares[f"pct_{GREEN_COLUMN}"]
    logger.info(
        "built %s, green share median %.1f %% (%.1f-%.1f), %d communes unscored",
        logs.shape(shares),
        scored.median(),
        scored.min(),
        scored.max(),
        int(scored.isna().sum()),
    )
    return shares


def metadata() -> dict:
    """Which millesime and which postes, so the popup states the curation it is
    showing rather than keeping its own copy of the list.
    """
    return {
        "espaces_verts": {
            "annee": YEAR,
            "postes": sorted(GREEN_POSTES),
        }
    }
