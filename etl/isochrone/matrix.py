"""One mode, one 1285 x 1285 matrix of minutes.

Row i is origin i, column j destination j, in the order of the index file.
The matrix is **not symmetric** -- a transit trip out of a commune at 08:00 is
not the reverse of the trip into it -- so the whole square is kept.
"""

import datetime
import logging

import geopandas as gpd
import numpy as np

from etl.common import communes_ref, logs
from etl.isochrone import DEPARTURE_HOUR, DEPARTURE_WINDOW, MAX_TIME, MODES, PERCENTILE, UNREACHABLE

logger = logging.getLogger(__name__)


def origins(ref: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """One point per commune, at its chef-lieu. R5 snaps it to the street.

    **Not the polygon's middle**, and the difference decides whether the layer
    is usable at all. Measured on nine communes before this was changed:
    Fontainebleau is 172 km2 of which most is forest, its representative point
    lands three kilometres into the trees, and every destination came back
    unreachable within two hours -- which reads as "you cannot get there from
    here" and is false. The chef-lieu is where the town is.

    AdminExpress publishes it, so it costs one more cached WFS layer and no new
    source. `representative_point()` remains the fallback, and is guaranteed
    inside the polygon where a plain centroid is not (it falls outside its own
    commune for 5 of the 1285).

    A chef-lieu shared by several communes falls back too. Paris 1er, 2e and
    4e all carry the Hotel de Ville, which has been the mairie of the merged
    Paris Centre sector since 2020 -- so all three would have had the same
    origin, an identical row, and a travel time of zero minutes between them.
    Their polygons are small and dense, so the forest problem the chef-lieu
    exists to solve does not apply there.

    What this still cannot fix is a commune whose people do not live at its
    chef-lieu. That is stated in the frontend's note rather than corrected with
    a weighting nothing publishes.
    """
    points = communes_ref.chef_lieux().reindex(ref.index)

    unusable = points.isna() | points.to_wkb().duplicated(keep=False).fillna(False)
    if unusable.any():
        logger.info(
            "%d communes have no chef-lieu of their own, using their polygon: %s",
            int(unusable.sum()),
            ", ".join(ref.loc[unusable, "name"]),
        )
        points[unusable] = ref.geometry[unusable].representative_point()

    return gpd.GeoDataFrame(
        {"id": ref.index.to_numpy()},
        geometry=points.to_numpy(),
        crs=ref.crs,
    )


def compute(network, mode: str, date: datetime.date, places: gpd.GeoDataFrame) -> np.ndarray:
    """Travel times from every commune to every commune, as uint8 minutes."""
    import r5py

    modes = [getattr(r5py.TransportMode, name) for name in MODES[mode]["r5"]]
    departure = datetime.datetime.combine(date, datetime.time(hour=DEPARTURE_HOUR))

    logger.info(
        "%s: %d x %d, departing %s within %s, %dth percentile",
        mode,
        len(places),
        len(places),
        departure,
        DEPARTURE_WINDOW,
        PERCENTILE,
    )

    times = r5py.TravelTimeMatrix(
        network,
        origins=places,
        destinations=places,
        # A chef-lieu is a point on a village square, not on a road centreline,
        # and R5 silently returns nothing for an origin it cannot link to the
        # street network.
        snap_to_network=True,
        departure=departure,
        departure_time_window=DEPARTURE_WINDOW,
        percentiles=[PERCENTILE],
        max_time=MAX_TIME,
        transport_modes=modes,
    )
    logger.info("%s: R5 returned %s", mode, logs.shape(times))

    return _square(times, places["id"].to_numpy(), mode)


def _square(times, codes: np.ndarray, mode: str) -> np.ndarray:
    """Reshape r5py's long format into a dense uint8 square."""
    column = _travel_time_column(times)
    order = {code: i for i, code in enumerate(codes)}

    matrix = np.full((len(codes), len(codes)), UNREACHABLE, dtype=np.uint8)
    rows = times["from_id"].map(order).to_numpy()
    cols = times["to_id"].map(order).to_numpy()
    minutes = times[column].to_numpy(dtype="float64")

    # R5 leaves a pair unset rather than at max_time when it finds no route.
    found = np.isfinite(minutes)
    matrix[rows[found], cols[found]] = np.clip(np.round(minutes[found]), 0, UNREACHABLE - 1)

    reached = int((matrix != UNREACHABLE).sum())
    logger.info(
        "%s: %.1f%% of pairs reachable within %s, median %d min",
        mode,
        100 * reached / matrix.size,
        MAX_TIME,
        int(np.median(matrix[matrix != UNREACHABLE])) if reached else -1,
    )
    return matrix


def _travel_time_column(times) -> str:
    """r5py names the column travel_time, or travel_time_p50 with percentiles."""
    for candidate in (f"travel_time_p{PERCENTILE}", "travel_time"):
        if candidate in times.columns:
            return candidate
    raise ValueError(f"no travel time column in {list(times.columns)}")
