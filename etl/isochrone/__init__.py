"""Travel time from every commune to every other one. Not a criterion.

The map answers "how good is this commune". This package answers "and can I get
out of it", which is the second question anyone choosing a place to live asks.
README.md listed door-to-door commute time as needing a server and a live API.
It does not: the whole answer precomputes into a static file.

**A matrix, not isochrone polygons**, and that is what makes it affordable.
1285 origins x 1285 destinations x one byte of minutes is 1.65 MB a mode, and
0.30 / 0.12 / 0.05 MB gzipped -- under half a megabyte for all three, because
minutes over a region compress extremely well. The app is already a commune
choropleth, so no new geometry ships at all; a time-limit slider becomes a
threshold on one row rather than a separate polygon set per threshold; and a
second departure profile is one more small file. Polygons would have been
~38 MB for two modes at three thresholds, and every new threshold would mean
rebuilding all of them.

**Its own entry point, and that is the opposite call from etl/network/.** The
network overlay builds in 55 s off downloads the pipeline already makes, so
folding it into pipeline.main() was right. This one needs a JDK 21, 451 MB of
downloads and about twenty minutes -- nine of them building the R5 network the
first time, which is then cached. Putting it in etl.pipeline would make every
local run unusable. It is wired into CI by .github/workflows/isochrone.yml from the
day it lands, which is the part that actually matters.

    uv sync --group isochrone
    uv run python -m etl.isochrone

**No car.** R5 and OSRM both compute free-flow times from OSM speed limits, and
no open source publishes congestion for Ile-de-France. A car layer would claim
the A86 runs at 110 km/h at 08:00 -- wrong by roughly 2x at exactly the hour
anyone cares about. Deferred until there is a defensible congestion source,
rather than shipped behind a caveat.
"""

import datetime

# The three modes shipped, and the file each one writes. Keys match
# web/traveltime.js's MODES; r5py's TransportMode values are resolved in
# matrix.py so that importing this module never starts a JVM.
MODES = {
    "transit": {"label": "Transports en commun", "r5": ["TRANSIT", "WALK"]},
    "velo": {"label": "Vélo", "r5": ["BICYCLE"]},
    "marche": {"label": "Marche", "r5": ["WALK"]},
}

OUTPUT_NAME = "temps_{mode}.bin.gz"
INDEX_NAME = "temps_index.json"

# Also the uint8 ceiling: 254 minutes is the largest value that fits, and
# nothing beyond two hours is a commute anyone is choosing a flat around.
MAX_TIME = datetime.timedelta(minutes=120)

# Not reachable within MAX_TIME, or not reachable at all. The frontend paints
# these with the no-data colour, the way -1 already means "no composite".
UNREACHABLE = 255

# The median departure inside the window below, rather than one fixed minute.
PERCENTILE = 50

# r5py defaults to 10 minutes, which is shorter than the headway of a grande
# couronne bus -- R5 then fails to find a route at all and the commune reads
# unreachable. An hour covers everything IDFM runs on a weekday morning.
DEPARTURE_WINDOW = datetime.timedelta(minutes=60)

DEPARTURE_HOUR = 8
