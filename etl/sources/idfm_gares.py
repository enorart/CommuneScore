"""Rail stations and the lines serving them, from Ile-de-France Mobilites.

Replaces BPE's transport domain, which is unusable here: BPE knows only
SNCF/RER,  no metro, no tram and 99% of its transport domain is taxi-VTC company registrations.
IDFM publishes the actual network: 996 stations across 50 lines, every mode included

One row per (station x line): an interchange like Gare du Nord appears once
per line that stops there, so `id_ref_zdc` (zone de correspondance) is what
identifies a station across those rows.

Unlike the other source modules this one returns points rather than a table
keyed by code_insee: the dataset locates stations by coordinates and carries
no INSEE code. Keeping the geometry lets the pipeline measure distance to
the stations themselves.
"""

import logging

import geopandas as gpd
import pandas as pd

from etl.common import logs, neighbourhood
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

EXPORT_URL = (
    "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/"
    "emplacement-des-gares-idf/exports/geojson"
)

CACHE_NAME = "idfm_gares.geojson"

# Modes ordered as a rider ranks them for getting out of their commune:
# regional rail first, then urban. Used only to sort line lists for display.
MODE_ORDER = ["RER", "TRAIN", "METRO", "TRAMWAY", "TRAM", "VAL", "CABLE"]


def _line_sort_key(line: str) -> tuple[int, str, int, str]:
    """Utils : Order lines the way a network map does, not the way ASCII does.

    Plain alphabetical sorting interleaves "METRO 1, METRO 10, METRO 11,
    METRO 2", which reads as broken in a tooltip.
    """
    family, _, rest = line.partition(" ")
    digits = "".join(c for c in rest if c.isdigit())
    suffix = "".join(c for c in rest if not c.isdigit())

    mode = family if family in MODE_ORDER else family.replace("TRAM", "TRAMWAY")
    rank = MODE_ORDER.index(mode) if mode in MODE_ORDER else len(MODE_ORDER)
    return (rank, family, int(digits) if digits else 0, suffix)


def format_lines(lines) -> str:
    """Render a set of line names as one readable, network-ordered string."""
    return ", ".join(sorted(set(lines), key=_line_sort_key))


def fetch() -> gpd.GeoDataFrame:
    """Return one point per (station, line) served in Ile-de-France.

    Columns: station_id, gare, ligne, mode, geometry. A handful of stations
    sit outside the region on lines that reach into it (Transilien termini in
    the Oise, say); they are kept, since they are genuinely reachable from
    the communes near the border.
    """
    gares = gpd.read_file(cached_download(EXPORT_URL, CACHE_NAME, timeout=120))
    stations = gares[["id_ref_zdc", "nom_zdc", "res_com", "mode", "geometry"]].rename(
        columns={
            "id_ref_zdc": "station_id",
            "nom_zdc": "gare",
            "res_com": "ligne",
        }
    )

    logger.info(
        "fetched %s: %d stations across %d lines",
        logs.shape(stations),
        stations["station_id"].nunique(),
        stations["ligne"].nunique(),
    )
    return stations


def build(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """Rail access per commune: stations inside it, and lines within reach.

    Lines rather than stations are what the score reads: three stops on the same
    RER get you to the same places, three different lines do not.

    Reach is measured with points_within rather than neighbourhood.aggregate
    because this source has real coordinates. Aggregating at commune
    granularity credited Versailles with an RER A station 6.8 km away, on the
    grounds that Rueil-Malmaison comes within 2.3 km of its boundary.
    """
    stations = fetch()

    communes = ref[["geometry"]].rename_axis("code_insee").reset_index()
    inside = stations.to_crs(communes.crs).sjoin(communes, how="inner", predicate="within")

    own = inside.groupby("code_insee").agg(
        nb_gares=("station_id", "nunique"),
        gares=("gare", lambda names: ", ".join(sorted(set(names)))),
    )

    nearby = (
        neighbourhood.points_within(ref, stations)
        .groupby("code_insee")
        .agg(
            **{
                neighbourhood.column("nb_gares"): ("station_id", "nunique"),
                neighbourhood.column("nb_lignes"): ("ligne", "nunique"),
                neighbourhood.column("lignes"): ("ligne", lambda lines: format_lines(lines.dropna())),
            }
        )
    )

    rail = own.join(nearby, how="outer").reindex(ref.index)

    # A commune with no station has none, not an unknown number of them.
    counts = [c for c in rail.columns if c.startswith("nb_")]
    rail[counts] = rail[counts].fillna(0).astype("int64")
    rail = rail.fillna("")

    logger.info(
        "built %s, %d communes with a station of their own, %d with none within reach",
        logs.shape(rail),
        int((rail["nb_gares"] > 0).sum()),
        int((rail[neighbourhood.column("nb_lignes")] == 0).sum()),
    )
    return rail