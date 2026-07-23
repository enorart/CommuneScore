"""Reference table: code_insee, name, geometry, population for Île-de-France communes.

Every other source module joins onto this table. Built from IGN's AdminExpress
COG WFS service (data.geopf.fr), which conveniently already carries population
alongside geometry — no separate INSEE population file needed.
"""

import urllib.parse
from pathlib import Path

import geopandas as gpd

IDF_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

WFS_BASE_URL = "https://data.geopf.fr/wfs/ows"

RAW_CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "communes_idf.geojson"


def _wfs_url() -> str:
    departments = ",".join(f"'{code}'" for code in IDF_DEPARTMENTS)
    params = {
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "TYPENAMES": "ADMINEXPRESS-COG.LATEST:commune",
        "OUTPUTFORMAT": "application/json",
        "SRSNAME": "EPSG:4326",
        "CQL_FILTER": f"code_insee_du_departement IN ({departments})",
    }
    return f"{WFS_BASE_URL}?{urllib.parse.urlencode(params)}"


def build() -> gpd.GeoDataFrame:
    """Return a GeoDataFrame indexed by code_insee with columns:
    name, population, geometry.
    """
    if RAW_CACHE_PATH.exists():
        gdf = gpd.read_file(RAW_CACHE_PATH)
    else:
        gdf = gpd.read_file(_wfs_url())
        RAW_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        gdf.to_file(RAW_CACHE_PATH, driver="GeoJSON")

    gdf = gdf.rename(columns={"nom_officiel": "name"}).set_index("code_insee")
    return gdf[["name", "population", "geometry"]]
