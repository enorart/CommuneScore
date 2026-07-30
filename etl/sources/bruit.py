"""Bruitparif: how much of a commune's population lives in noise.

Noise from road, rail and air traffic, as an Lden annual average, classed
against the WHO recommendations and the limits France set in application of
directive 2002/49/CE (arrete du 4 avril 2006). The column this contributes is
the share of a commune's residents above the WHO recommendation.

The published file is a *crossed* air x noise cartography, which looks like it
would duplicate the airparif criterion and does not. Bruitparif classes noise
on its own 7-class index, Airparif classes air on its own, and only the crossed
result is published, as a 3x3 grid: each axis collapsed to "meets the WHO
recommendation" / "above it but within the regulatory limit" / "above the
limit". The nine columns are named for the pair, first digit noise, second
digit air, so the noise axis reads straight off the first digit and the air
axis is never touched.


Known limitations:
  - the shares are of the *modelled* population, which is the population living
    where a noise map exists.
  - "above the WHO recommendation" is easily reached: 53 dB Lden for road, 54
    for rail, 45 for air (see WHO_THRESHOLDS_LDEN), so a commune with any
    through traffic passes it. 146 communes read 100% and 479 read 0%: the
    criterion separates places with mapped infrastructure from places without,
    more than it grades the ones with.
  - an annual average says nothing about a night flight path versus a permanent
    motorway hum.
"""

import logging
from urllib.parse import quote

import geopandas as gpd
import pandas as pd
import polars as pl

from etl.common import logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

# The published millesime. Pinned rather than taken as the newest file so a
# re-publication cannot silently change which year the map is showing.
YEAR = 2024

_PATH = (
    "pages/En-tete/800 Le bruit en Île-de-France/300 carto-air-bruit-en-idf/"
    f"600 Opendata air-bruit/Statistiques air-bruit {YEAR}.xlsx"
)
# The path carries spaces and an accented capital; encode it rather than hope
# requests does the right thing with a raw one.
URL = "https://www.bruitparif.fr/" + quote(_PATH)

CACHE_NAME = f"bruit_air_{YEAR}.xlsx"

SHEET = "Statistiques (9) à la commune"

CODE_COLUMN = "CODE INSEE"
POP_COLUMN = "POP"

# The 3x3 grid, "<noise><air>". POP is their exact sum, checked: the largest
# deviation over the 1 287 rows is 0.0, so the file is its own denominator and
# communes_ref's population is never divided into it.
CLASSES = ["11", "12", "13", "21", "22", "23", "31", "32", "33"]

# Noise classes counted as exposed: above the WHO recommendation, whether or not
# also above the regulatory limit. This is what "exposed" means here; the
# thresholds below are Bruitparif's, applied before we ever see the file.
EXPOSED_NOISE_CLASSES = ["2", "3"]

# WHO Environmental Noise Guidelines for the European Region, 2018, strong
# recommendations, in dB Lden. Published for the popup to state, never used in
# any computation: the classification happened upstream, and the only thing that
# decides what this module counts is EXPOSED_NOISE_CLASSES above.
#
# There is no single WHO Lden, which is why the three are carried separately.
# Air traffic has the strictest guideline and the widest footprint, and that is
# what puts whole villages under the Roissy approach at 100% while central Paris
# reads 75-93%. France's own limits (arrete du 4 avril 2006) are 15 to 20 dB
# laxer: 68 road, 73 rail, 55 air.
WHO_THRESHOLDS_LDEN = {"route": 53, "fer": 54, "air": 45}

# The 2024 file predates two mergers that IGN's 2025 COG has already applied.
# Summed into their successor rather than dropped, or Saint-Denis would be
# scored on the pre-merger city and be missing 29 478 residents. Both were
# checked by arithmetic against communes_ref's population:
#   93066 Saint-Denis  111 245 + 29 478 = 140 724 modelled, IGN 149 077
#   95169 Commeny          459 +    184 =     643 modelled, IGN     646
MERGERS = {
    "93059": "93066",  # Pierrefitte-sur-Seine -> Saint-Denis, 1 Jan 2025
    "95282": "95169",  # Gouzangrez -> Commeny, 1 Jan 2024
}

# Below this share of the commune's real population being modelled, the number
# is not about the commune any more. Twelve communes on the edge of the Roissy
# mapping fall here: Rouvres reads 100% exposed on 1.2% of its residents, and
# Villeparisis 95% on 1 144 of its 26 946. Nulled rather than published, the way
# every other source leaves a value it does not have.
MIN_COVERAGE = 50.0

EXPOSED_COLUMN = "pct_pop_bruit_oms"


def fetch() -> pl.DataFrame:
    """Return per commune: modelled population, and how much of it is exposed.

    Counts rather than shares, because the merger fix has to sum populations
    before any division, and because POP is the denominator the file itself
    uses.
    """
    book = pl.read_excel(
        cached_download(URL, CACHE_NAME, timeout=120),
        sheet_name=SHEET,
        columns=[CODE_COLUMN, *CLASSES, POP_COLUMN],
    )

    exposed = sum(pl.col(c) for c in CLASSES if c[0] in EXPOSED_NOISE_CLASSES)

    rows = (
        # Published as an integer, so 77001 lost its leading zero on the way out.
        book.with_columns(pl.col(CODE_COLUMN).cast(pl.Utf8).str.zfill(5).alias("code_insee"))
        .with_columns(pl.col("code_insee").replace(MERGERS))
        .group_by("code_insee")
        .agg(
            pl.col(POP_COLUMN).sum().alias("pop_modelisee"),
            exposed.sum().alias("pop_exposee"),
        )
        .sort("code_insee")
    )

    logger.info(
        "fetched %s for %d, %d rows merged into a successor commune",
        logs.shape(rows),
        YEAR,
        len(book) - len(rows),
    )
    return rows


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """The share of the commune's modelled population above the WHO threshold."""
    rows = fetch()

    # A commune in the file that is neither in the reference table nor known to
    # have merged means the vintages have drifted apart. Raise rather than let
    # a reindex drop it silently, the way ssmsi raises on an indicator label.
    unknown = set(rows["code_insee"]) - set(ref.index)
    if unknown:
        raise ValueError(f"{len(unknown)} communes not in communes_ref and not in MERGERS: {sorted(unknown)}")

    noise = rows.to_pandas().set_index("code_insee").reindex(ref.index)
    share = (100 * noise["pop_exposee"] / noise["pop_modelisee"]).round(1)

    # Coverage is against communes_ref's population, the only outside opinion
    # available on how much of the commune the file actually models.
    coverage = 100 * noise["pop_modelisee"] / ref["population"]
    dropped = (coverage < MIN_COVERAGE).sum()

    exposure = pd.DataFrame({EXPOSED_COLUMN: share.where(coverage >= MIN_COVERAGE)})

    scored = exposure[EXPOSED_COLUMN]
    logger.info(
        "built %s, exposed share median %.1f %% (%.1f-%.1f), coverage median %.0f %%, %d communes unscored",
        logs.shape(exposure),
        scored.median(),
        scored.min(),
        scored.max(),
        coverage.median(),
        int(scored.isna().sum()),
    )
    if dropped:
        logger.info("%d communes below %.0f %% modelled coverage, left unscored", dropped, MIN_COVERAGE)
    return exposure


def metadata() -> dict:
    """The vintage and the threshold, so the popup states them rather than
    keeping its own copy.
    """
    return {
        "bruit": {
            "annee": YEAR,
            "indicateur": "Lden",
            "seuils_oms": WHO_THRESHOLDS_LDEN,
        }
    }
