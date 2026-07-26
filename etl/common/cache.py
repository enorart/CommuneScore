"""One-time downloads into data/raw/.

Every source module fetches a file it then parses, and none of these sources
change more than once a year, so the raw file is kept on disk and the download
is skipped if it is already there. Deleting one file forces a re-fetch of just
that source.

The cache is also the seam the manual workaround relies on: behind a
TLS-intercepting proxy `requests` cannot reach any HTTPS host, and downloading
the file by hand into the exact path a module expects -- each names it in a
CACHE_NAME constant, resolved against RAW_DIR below -- is enough to make the
pipeline run without it.
"""

import logging
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw"


def _size(path: Path) -> str:
    return f"{path.stat().st_size / 1_000_000:.1f} MB"


def cached_download(url: str, filename: str, timeout: int = 300) -> Path:
    """Return the local path of `url`, fetching it into data/raw/ only once."""
    path = RAW_DIR / filename

    if path.exists():
        logger.info("cache hit  %s (%s)", filename, _size(path))
        return path

    logger.info("cache miss %s, downloading from %s", filename, url)
    started = time.perf_counter()

    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(response.content)

    logger.info("downloaded %s (%s in %.1fs)", filename, _size(path), time.perf_counter() - started)
    return path
