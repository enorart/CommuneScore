"""Reference table: code_insee, name, geometry, population, and the
département / intercommunalité each commune belongs to.

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

import logging
import urllib.parse
from pathlib import Path

import geopandas as gpd
import pandas as pd

from etl.common.insee import IDF_DEPARTMENTS, PARIS_CODE

logger = logging.getLogger(__name__)

WFS_BASE_URL = "https://data.geopf.fr/wfs/ows"

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw"
COMMUNES_CACHE_PATH = RAW_DIR / "communes_idf.geojson"
PARIS_ARR_CACHE_PATH = RAW_DIR / "paris_arrondissements.geojson"
EPCI_CACHE_PATH = RAW_DIR / "epci_idf.geojson"

# Inner-ring communes belong to two intercommunalites at once: the Metropole du
# Grand Paris, and inside it an etablissement public territorial. MGP spans 131
# communes across three departments. Prefer the EPT wherever there is one.
METROPOLE_NATURE = "Métropole"

# Paris is a member of MGP but exercises the EPT functions itself, so its
# arrondissements have no EPT to inherit. Filing them under a 131-commune
# metropole would label a 20-arrondissement group with the wrong body's name,
# so they form their own group, keyed by the commune code build() drops.
PARIS_EPCI_NAME = "Ville de Paris"

# Simplification tolerance in degrees (~20m) for the final output geometry.
# AdminExpress ships full-precision boundaries meant for GIS work; simplifying
# here cuts the output GeoJSON with no visible difference at commune-choropleth zoom levels.
SIMPLIFY_TOLERANCE_DEG = 0.0002


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


def _quoted(codes: list[str]) -> str:
    """A CQL_FILTER IN () list: 'A','B','C'."""
    return ",".join(f"'{code}'" for code in codes)


def _cached_wfs(cache_path: Path, typenames: str, cql_filter: str) -> gpd.GeoDataFrame:
    """Read a WFS layer, downloading it into data/raw/ the first time.

    Not common.cache.cached_download: geopandas reads the URL itself rather
    than handing us bytes, so the caching has to happen around gpd.read_file.
    """
    if cache_path.exists():
        logger.info("cache hit  %s", cache_path.name)
        return gpd.read_file(cache_path)

    logger.info("cache miss %s, querying WFS layer %s", cache_path.name, typenames)
    gdf = gpd.read_file(_wfs_url(typenames, cql_filter))
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    gdf.to_file(cache_path, driver="GeoJSON")
    return gdf


def _fetch_communes() -> gpd.GeoDataFrame:
    return _cached_wfs(
        COMMUNES_CACHE_PATH,
        "ADMINEXPRESS-COG.LATEST:commune",
        f"code_insee_du_departement IN ({_quoted(IDF_DEPARTMENTS)})",
    )


def _fetch_paris_arrondissements() -> gpd.GeoDataFrame:
    return _cached_wfs(
        PARIS_ARR_CACHE_PATH,
        "ADMINEXPRESS-COG.LATEST:arrondissement_municipal",
        f"code_insee_de_la_commune_de_rattach = '{PARIS_CODE}'",
    )


def _fetch_epci(sirens: list[str]) -> pd.DataFrame:
    """Name and nature for the given intercommunalites, from the same COG.

    The layer ships geometry we have no use for -- commune polygons already
    tile the region -- so only the attributes are kept.
    """
    epci = _cached_wfs(
        EPCI_CACHE_PATH,
        "ADMINEXPRESS-COG.LATEST:epci",
        f"code_siren IN ({_quoted(sirens)})",
    )
    return pd.DataFrame(epci[["code_siren", "nom_officiel", "nature"]])


def _resolve_epci(communes: gpd.GeoDataFrame) -> pd.DataFrame:
    """One intercommunalite per commune, as (code_epci, nom_epci).

    AdminExpress lists every intercommunalite a commune belongs to in a single
    "/"-separated field. See METROPOLE_NATURE for why the metropole loses.
    """
    listed = communes["codes_siren_des_epci"].str.split("/")

    epci = _fetch_epci(sorted({siren for codes in listed for siren in codes}))
    names = epci.set_index("code_siren")["nom_officiel"]
    natures = epci.set_index("code_siren")["nature"]

    def pick(codes: list[str]) -> str:
        local = [code for code in codes if natures.get(code) != METROPOLE_NATURE]
        return (local or codes)[0]

    code = listed.map(pick)
    return pd.DataFrame({"code_epci": code, "nom_epci": code.map(names)}, index=communes.index)


def build() -> gpd.GeoDataFrame:
    """Return a GeoDataFrame indexed by code_insee with columns:
    name, population, code_departement, code_epci, nom_epci, geometry.
    Paris (75056) is replaced by its 20 arrondissements (75101-75120).
    """
    communes = _fetch_communes()
    communes = communes.rename(columns={"nom_officiel": "name"})
    communes = communes[communes["code_insee"] != PARIS_CODE]
    communes[["code_epci", "nom_epci"]] = _resolve_epci(communes)

    paris_arr = _fetch_paris_arrondissements()
    paris_arr = paris_arr.rename(columns={"nom_officiel": "name"})
    paris_arr["code_epci"] = PARIS_CODE
    paris_arr["nom_epci"] = PARIS_EPCI_NAME

    combined = gpd.GeoDataFrame(
        pd.concat([communes, paris_arr], ignore_index=True),
        crs=communes.crs,
    ).set_index("code_insee")

    # Holds for arrondissements too: 751xx -> 75.
    combined["code_departement"] = combined.index.str[:2]

    combined["geometry"] = combined.geometry.simplify(
        SIMPLIFY_TOLERANCE_DEG, preserve_topology=True
    )

    logger.info(
        "reference table: %d communes (%d Paris arrondissements), %d départements, %d intercommunalités",
        len(combined),
        len(paris_arr),
        combined["code_departement"].nunique(),
        combined["code_epci"].nunique(),
    )
    return combined[["name", "population", "code_departement", "code_epci", "nom_epci", "geometry"]]
