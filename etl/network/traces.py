"""Line geometry for the rail network: metro, tram, RER and train.

Bus traces are deliberately not here. IDFM publishes them too, in the same
shape, but the data are very large and not very useful in our case.

The colour of every line is IDFM's own : looks like the official network map.

WARNING : Do not confuse this with etl/sources/idfm_gares.py, which feeds the transport
criterion from a different IDFM dataset and counts rail (metro, tram, train) stations only.
"""

import logging

import geopandas as gpd

from etl.common import logs
from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

URL = "https://www.data.gouv.fr/api/1/datasets/r/4701e167-27d3-4f73-a224-cf69c25c9ea6"

CACHE_NAME = "idfm_traces_ferre.geojson"

OUTPUT_NAME = "reseau_traces.geojson"

# The five groups the frontend draws a toggle for. IDFM's nine transport modes
# are more granularity than a map legend can carry: TER, Transilien, the two
# rail shuttles, the cable car and the funicular are all "a train that is not
# the metro" to someone choosing where to live, and the cable and funicular are
# two lines between them.
MODES = {
    "METRO": "metro",
    "TRAMWAY": "tram",
    "RER": "rer",
    "TRAIN": "train",
    "TER": "train",
    "NAVETTE": "train",
    "CABLE": "train",
}

SIMPLIFY_TOLERANCE_M = 15
LAMBERT_93 = "EPSG:2154"


def fetch() -> gpd.GeoDataFrame:
    """Return the raw line segments, five columns of the source's twenty-two."""
    traces = gpd.read_file(cached_download(URL, CACHE_NAME, timeout=120))
    kept = traces[["idrefligc", "res_com", "mode", "colourweb_hexa", "geometry"]]

    logger.info(
        "fetched %s: %d segments across %d lines, modes %s",
        logs.shape(kept),
        len(kept),
        kept["idrefligc"].nunique(),
        sorted(kept["mode"].dropna().unique()),
    )
    return kept


def build(ref: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """The segments to draw, simplified and tagged with the zones they cross.

    Each segment carries the departements and intercommunalites it runs
    through, as arrays.
    """
    traces = fetch()

    unknown = set(traces["mode"].dropna()) - set(MODES)
    if unknown:
        # A silent drop here would take a whole mode off the map, and the map
        # is the only place anyone would notice.
        raise ValueError(f"unknown IDFM trace modes: {sorted(unknown)}")

    metric = traces.to_crs(LAMBERT_93)
    metric["geometry"] = metric.geometry.simplify(SIMPLIFY_TOLERANCE_M)

    zones = ref[["code_departement", "code_epci", "geometry"]].to_crs(LAMBERT_93)
    crossed = metric[["geometry"]].sjoin(zones, how="left", predicate="intersects")

    deps = crossed.groupby(level=0)["code_departement"].apply(lambda v: sorted(set(v.dropna())))
    epcis = crossed.groupby(level=0)["code_epci"].apply(lambda v: sorted(set(v.dropna())))

    segments = gpd.GeoDataFrame(
        {
            "id": range(len(metric)),
            "ligne": traces["res_com"],
            "mode": traces["mode"].map(MODES),
            # The '#' is added here rather than in a MapLibre concat expression
            # evaluated once per segment per frame.
            "couleur": "#" + traces["colourweb_hexa"].fillna("888888"),
            "deps": deps.reindex(metric.index).apply(lambda v: v if isinstance(v, list) else []),
            "epcis": epcis.reindex(metric.index).apply(lambda v: v if isinstance(v, list) else []),
        },
        geometry=metric.geometry,
        crs=LAMBERT_93,
    ).to_crs("EPSG:4326")

    logger.info(
        "built %s: %d segments, %d off the reference mesh, %.1f communes crossed on average",
        logs.shape(segments),
        len(segments),
        int((segments["deps"].apply(len) == 0).sum()),
        crossed["code_departement"].notna().groupby(crossed.index).sum().mean(),
    )
    return segments
