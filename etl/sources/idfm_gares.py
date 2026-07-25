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

from pathlib import Path

import geopandas as gpd
import requests

EXPORT_URL = (
    "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/"
    "emplacement-des-gares-idf/exports/geojson"
)

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw"
CACHE_PATH = RAW_DIR / "idfm_gares.geojson"

# Modes ordered as a rider ranks them for getting out of their commune:
# regional rail first, then urban. Used only to sort line lists for display.
MODE_ORDER = ["RER", "TRAIN", "METRO", "TRAMWAY", "TRAM", "VAL", "CABLE"]


def _download() -> None:
    if not CACHE_PATH.exists():
        response = requests.get(EXPORT_URL, timeout=120)
        response.raise_for_status()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_bytes(response.content)


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
    _download()

    gares = gpd.read_file(CACHE_PATH)
    return gares[["id_ref_zdc", "nom_zdc", "res_com", "mode", "geometry"]].rename(
        columns={
            "id_ref_zdc": "station_id",
            "nom_zdc": "gare",
            "res_com": "ligne",
        }
    )