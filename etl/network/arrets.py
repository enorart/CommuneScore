"""Every stop in the Ile-de-France network, bus included, and the lines at it.

Ile-de-France Mobilites publishes one row per (stop x line), GTFS-shaped.
Those ids are per line, not per place => _cluster()
puts them back together.

WARNING : Do not confuse this with etl/sources/idfm_gares.py, which feeds the transport
criterion from a different IDFM dataset and counts rail (metro, tram, train) stations only.
"""

import logging
import math

import geopandas as gpd
import polars as pl
from shapely.geometry import Point

from etl.common import logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

URL = "https://www.data.gouv.fr/api/1/datasets/r/c1e44abc-6e78-49d2-90ca-25460f43ef8c"

CACHE_NAME = "idfm_arrets_lignes.csv"

OUTPUT_NAME = "reseau_arrets.geojson"

# IDFM's nine stop modes onto the five the map draws. Same grouping as
# traces.MODES, expressed in the other dataset's vocabulary: RapidTransit is
# the RER, LocalTrain the Transilien, regionalRail the TER, and the two rail
# shuttles, the cable car and the funicular are 14 stops between them.
MODES = {
    "Metro": "metro",
    "Tramway": "tram",
    "RapidTransit": "rer",
    "LocalTrain": "train",
    "regionalRail": "train",
    "RailShuttle": "train",
    "CableWay": "train",
    "Funicular": "train",
    "Bus": "bus",
}

# Modes ordered as a rider ranks them for getting out of their commune:
# regional rail first, then urban, then the bus that goes three streets.
MODE_ORDER = ["rer", "train", "metro", "tram", "bus"]
LAMBERT_93 = "EPSG:2154"
SNAP_DISTANCE_M = 50

# How close two stops of the same name must be to be drawn as one dot.
# IDFM publishes a reference stop per line, so an interchange arrives as a
# heap of near-identical points..
#
# Merging is by name *and* proximity, never by name alone: the median gap
# between two same-name stops in the same commune is 50 m, but the widest is
# 2.6 km :  a commune can have a "Mairie" bus stop at each end. 150 m keeps a
# station forecourt together and keeps those apart.
CLUSTER_DISTANCE_M = 150


def fetch() -> pl.DataFrame:
    """One row per stop id, with the modes and lines calling there collected.

    Lines are kept as "mode:shortName" so the popup can group and colour them;
    the short names alone are ambiguous, tram T3a and bus 38 both being just a
    label. The source's own Code_insee is read but not trusted -- see build().
    """
    path = cached_download(URL, CACHE_NAME, timeout=300)
    # Read as text throughout. Half these columns look numeric and are not:
    # route_long_name holds both 1203 and "EXPRESS 9115", Code_insee would
    # lose 77001's leading zero, and shortName is a line label, not a number.
    rows = pl.read_csv(path, separator=";", infer_schema=False)

    unknown = set(rows["mode"].unique()) - set(MODES)
    if unknown:
        # Dropping a mode silently would take a whole layer off the map.
        raise ValueError(f"unknown IDFM stop modes: {sorted(unknown)}")

    stops = (
        rows.group_by("stop_id")
        .agg(
            pl.col("stop_name").first().alias("nom"),
            pl.col("stop_lon").first().cast(pl.Float64),
            pl.col("stop_lat").first().cast(pl.Float64),
            pl.col("Code_insee").first().alias("insee_source"),
            pl.col("mode").replace_strict(MODES).unique().sort().alias("modes"),
            pl.concat_str(pl.col("mode").replace_strict(MODES), pl.lit(":"), pl.col("shortName"))
            .unique()
            .alias("lignes"),
        )
        .sort("stop_id")
    )

    logger.info(
        "fetched %s: %d rows collapsed to %d stops, %d of them bus",
        logs.shape(stops),
        len(rows),
        len(stops),
        int(stops["modes"].list.contains("bus").sum()),
    )
    return stops


def build(ref: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """The stops to draw, each resolved to the commune it physically stands in.

    The commune comes from a point-in-polygon join against communes_ref, not
    from the file's own Code_insee column, and that is the load-bearing choice
    in this module:

      - The file codes Paris as 75056, all 3433 of its stops, where every other
        source in this project splits Paris into its 20 arrondissements.
    """
    stops = fetch()

    points = gpd.GeoDataFrame(
        stops.drop("stop_lon", "stop_lat").to_pandas(),
        geometry=gpd.points_from_xy(stops["stop_lon"], stops["stop_lat"]),
        crs="EPSG:4326",
    ).to_crs(LAMBERT_93)

    zones = (
        ref[["code_departement", "code_epci", "geometry"]]
        .to_crs(LAMBERT_93)
        .rename_axis("code_insee")
        .reset_index()
    )
    inside = points.sjoin(zones, how="left", predicate="within")
    inside = inside[~inside.index.duplicated()]

    # Boundary stops the ~20 m simplification of the reference geometry excludes.
    stranded = inside["code_insee"].isna()
    if stranded.any():
        snapped = points[stranded].sjoin_nearest(zones, how="left", max_distance=SNAP_DISTANCE_M)
        snapped = snapped[~snapped.index.duplicated()]
        for column in ("code_insee", "code_departement", "code_epci"):
            inside.loc[stranded, column] = snapped[column]

    placed = inside[inside["code_insee"].notna()].copy()
    logger.info(
        "placed %d stops, %d snapped from beyond a boundary, %d dropped as outside the region",
        len(placed),
        int(stranded.sum() - (len(inside) - len(placed))),
        len(inside) - len(placed),
    )

    disagreements = placed[placed["insee_source"].ne(placed["code_insee"])]
    logger.info(
        "%d stops overrode their own Code_insee, %d of them the Paris 75056 block",
        len(disagreements),
        int(disagreements["insee_source"].eq("75056").sum()),
    )

    stops = _cluster(placed).sort_values(["code_insee", "nom"]).reset_index(drop=True)
    stops.insert(0, "id", range(len(stops)))
    return stops.to_crs("EPSG:4326")


def _line_sort_key(line: str) -> tuple[int, int, int, str]:
    """Order a stop's lines the way a network map does, not the way ASCII does.

    Lines arrive as "mode:shortName" and the short names are a mixture of bare
    numbers, letters and both: 4, 68, 388, 3754, A, T2, N01.
    Modes lead, in MODE_ORDER, then the plain numbered lines in numeric
    order, then everything with a letter in it, so the Noctilien N14 sits with
    N21 and N122 instead of between bus 38 and bus 68.
    """
    mode, _, name = line.partition(":")
    rank = MODE_ORDER.index(mode) if mode in MODE_ORDER else len(MODE_ORDER)
    digits = "".join(c for c in name if c.isdigit())
    return (rank, 0 if name.isdigit() else 1, int(digits) if digits else 0, name)


def _cluster(placed: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Collapse the reference stops of one place into a single point.

    Single-linkage within each (name, commune) group, at CLUSTER_DISTANCE_M.
    The group is the whole search space.
    """
    merged = []
    for (nom, code_insee), group in placed.groupby(["nom", "code_insee"], sort=False):
        coordinates = list(zip(group.geometry.x, group.geometry.y))

        # Union-find over the pairs closer than the threshold.
        parent = list(range(len(group)))

        def root(i: int) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if math.dist(coordinates[i], coordinates[j]) <= CLUSTER_DISTANCE_M:
                    parent[root(i)] = root(j)

        group = group.assign(_cluster=[root(i) for i in range(len(group))])
        for _, cluster in group.groupby("_cluster", sort=False):
            merged.append(
                {
                    "nom": nom,
                    "code_insee": code_insee,
                    "dep": cluster["code_departement"].iloc[0],
                    "epci": cluster["code_epci"].iloc[0],
                    "modes": sorted({m for row in cluster["modes"] for m in row}),
                    "lignes": sorted(
                        {v for row in cluster["lignes"] for v in row}, key=_line_sort_key
                    ),
                    "geometry": Point(cluster.geometry.x.mean(), cluster.geometry.y.mean()),
                }
            )

    stops = gpd.GeoDataFrame(merged, geometry="geometry", crs=LAMBERT_93)
    logger.info(
        "clustered %d reference stops into %d places, largest merge %d points",
        len(placed),
        len(stops),
        int(placed.groupby(["nom", "code_insee"], sort=False).size().max()),
    )
    return stops
