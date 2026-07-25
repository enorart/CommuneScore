"""Reference table: code_insee, name, geometry, population for Île-de-France communes.

Every other source module joins onto this table. Built from IGN's AdminExpress
COG WFS service (data.geopf.fr), which conveniently already carries population
alongside geometry — no separate INSEE population file needed.

Paris is split into its 20 arrondissements (75101-75120) instead of kept as
the single commune code 75056: every other IDF source (rent, BPE, SSMSI) codes
Paris by arrondissement, and arrondissement-level geometry/population is
available from the same WFS service (layer `arrondissement_municipal`), so
splitting avoids inventing aggregation/weighting logic and gives more useful
granularity for a 2M-person city. Lyon/Marseille have the same commune vs.
arrondissement split but are out of scope for v1 (IDF only).
"""

import urllib.parse
from pathlib import Path

import geopandas as gpd
import pandas as pd

IDF_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

PARIS_CODE = "75056"

WFS_BASE_URL = "https://data.geopf.fr/wfs/ows"

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw"
COMMUNES_CACHE_PATH = RAW_DIR / "communes_idf.geojson"
PARIS_ARR_CACHE_PATH = RAW_DIR / "paris_arrondissements.geojson"


def _wfs_url(typenames: str, cql_filter: str) -> str:
    params = {
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "TYPENAMES": typenames,
        "OUTPUTFORMAT": "application/json",
        "SRSNAME": "EPSG:4326",
        "CQL_FILTER": cql_filter,
    }
    return f"{WFS_BASE_URL}?{urllib.parse.urlencode(params)}"


def _fetch_communes() -> gpd.GeoDataFrame:
    if COMMUNES_CACHE_PATH.exists():
        return gpd.read_file(COMMUNES_CACHE_PATH)

    departments = ",".join(f"'{code}'" for code in IDF_DEPARTMENTS)
    url = _wfs_url(
        "ADMINEXPRESS-COG.LATEST:commune",
        f"code_insee_du_departement IN ({departments})",
    )
    gdf = gpd.read_file(url)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    gdf.to_file(COMMUNES_CACHE_PATH, driver="GeoJSON")
    return gdf


def _fetch_paris_arrondissements() -> gpd.GeoDataFrame:
    if PARIS_ARR_CACHE_PATH.exists():
        return gpd.read_file(PARIS_ARR_CACHE_PATH)

    url = _wfs_url(
        "ADMINEXPRESS-COG.LATEST:arrondissement_municipal",
        f"code_insee_de_la_commune_de_rattach = '{PARIS_CODE}'",
    )
    gdf = gpd.read_file(url)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    gdf.to_file(PARIS_ARR_CACHE_PATH, driver="GeoJSON")
    return gdf


def build() -> gpd.GeoDataFrame:
    """Return a GeoDataFrame indexed by code_insee with columns:
    name, population, geometry. Paris (75056) is replaced by its 20
    arrondissements (75101-75120).
    """
    communes = _fetch_communes()
    communes = communes.rename(columns={"nom_officiel": "name"})
    communes = communes[communes["code_insee"] != PARIS_CODE]

    paris_arr = _fetch_paris_arrondissements()
    paris_arr = paris_arr.rename(columns={"nom_officiel": "name"})

    combined = gpd.GeoDataFrame(
        pd.concat([communes, paris_arr], ignore_index=True),
        crs=communes.crs,
    ).set_index("code_insee")
    return combined[["name", "population", "geometry"]]
