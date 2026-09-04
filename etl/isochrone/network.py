"""The routable network: OpenStreetMap streets plus IDFM timetables.

Two downloads, both ODbL, both through common.cache so the PowerShell
hand-download workaround in PROGRESS.md keeps working behind the TLS proxy.

The awkward part here is not the network, it is picking the day to travel on.
"""

import datetime
import logging
import zipfile

import polars as pl

from etl.common.cache import cached_download

logger = logging.getLogger(__name__)

OSM_URL = "https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf"
OSM_CACHE_NAME = "osm_ile_de_france.osm.pbf"

GTFS_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip"
GTFS_CACHE_NAME = "idfm_gtfs.zip"

# The day of the week the matrices are built for. A weekday, and Tuesday
# rather than Monday or Friday because those two carry the most atypical
# service on either side of a weekend.
WEEKDAY = 1  # Monday is 0


def _read(archive: zipfile.ZipFile, name: str, columns: list[str]) -> pl.DataFrame:
    with archive.open(name) as member:
        return pl.read_csv(member, columns=columns, infer_schema=False)


def service_date(gtfs: "pathlib.Path") -> datetime.date:  # noqa: F821
    """Pick the Tuesday inside the feed's validity with the most trips running.

    **Never hardcode this date.** IDFM's feed covers about 30 days from the
    moment it is generated and is regenerated three times a day, so a fixed
    date stops being valid within the month and the next quarterly run would
    silently produce a matrix of unreachable everywhere.

    Choosing the *busiest* Tuesday rather than the first one is what keeps the
    result away from a school-holiday week, where the grande couronne runs a
    reduced timetable, without this module needing a calendar of French school
    holidays. It is a pure function of the feed, so the same feed always gives
    the same day.
    """
    with zipfile.ZipFile(gtfs) as archive:
        calendar = _read(
            archive,
            "calendar.txt",
            ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
        )
        exceptions = _read(archive, "calendar_dates.txt", ["service_id", "date", "exception_type"])
        trips = _read(archive, "trips.txt", ["service_id"])

    per_service = trips.group_by("service_id").len("trips")

    starts = calendar["start_date"].str.to_date("%Y%m%d")
    ends = calendar["end_date"].str.to_date("%Y%m%d")
    first, last = starts.min(), ends.max()
    logger.info("GTFS validity %s to %s", first, last)

    day = pl.col(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][WEEKDAY])
    weekly = calendar.filter(day == "1").with_columns(
        pl.col("start_date").str.to_date("%Y%m%d"),
        pl.col("end_date").str.to_date("%Y%m%d"),
    )

    added = exceptions.filter(pl.col("exception_type") == "1")
    removed = exceptions.filter(pl.col("exception_type") == "2")

    best, best_trips = None, 0
    candidate = first + datetime.timedelta(days=(WEEKDAY - first.weekday()) % 7)
    while candidate <= last:
        stamp = candidate.strftime("%Y%m%d")
        running = set(
            weekly.filter(
                (pl.col("start_date") <= candidate) & (pl.col("end_date") >= candidate)
            )["service_id"]
        )
        running |= set(added.filter(pl.col("date") == stamp)["service_id"])
        running -= set(removed.filter(pl.col("date") == stamp)["service_id"])

        running_trips = int(
            per_service.filter(pl.col("service_id").is_in(list(running)))["trips"].sum() or 0
        )
        logger.debug("%s: %d services, %d trips", candidate, len(running), running_trips)
        if running_trips > best_trips:
            best, best_trips = candidate, running_trips

        candidate += datetime.timedelta(days=7)

    if best is None:
        # A feed with no Tuesday in it is not a feed this can work from, and
        # silently falling back to another day would change what the numbers
        # mean without saying so.
        raise ValueError(f"no {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][WEEKDAY]}day runs in {first}..{last}")

    logger.info("chose %s: %d trips, the busiest of %d candidates", best, best_trips, (last - first).days // 7 + 1)
    return best


def build():
    """Return (TransportNetwork, profile), the profile describing what was used.

    r5py is imported here rather than at module level: importing it starts a
    JVM, and `python -m etl.isochrone --help` should not need a JDK.
    """
    import r5py

    osm = cached_download(OSM_URL, OSM_CACHE_NAME, timeout=1800)
    gtfs = cached_download(GTFS_URL, GTFS_CACHE_NAME, timeout=1800)

    date = service_date(gtfs)

    logger.info("building the R5 network from %s + %s", osm.name, gtfs.name)
    network = r5py.TransportNetwork(osm, [gtfs])

    profile = {
        "date": date.isoformat(),
        "jour": "mardi",
        "osm": OSM_URL,
        "gtfs": GTFS_URL,
    }
    return network, profile
