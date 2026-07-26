"""Orchestrates all ETL sources, joins them on code_insee, and writes the
static dataset the frontend consumes.

Output: data/processed/communes_scores.geojson — raw values only. Nothing here
is scored: a 0-100 score only means something relative to a set of communes,
and which set that is belongs to the user, who picks it in the browser (see
web/scoring.js). This pipeline's job is to make the raw values reachable.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

from etl.common import communes_ref, neighbourhood
from etl.sources import bpe, idfm_gares, rent, ssmsi

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "communes_scores.geojson"

# The rent typologies folded into the rent score, both in EUR/m2 (rent.py).
# ANIL also publishes t1_t2 and t3_plus, but those are subsets of loyer_m2_appartement
RENT_COLUMNS = [
    "loyer_m2_appartement",
    "loyer_m2_maison",
]

# Equipment columns are named after the radius they were counted over, so
# the output is self-describing.
NEARBY_SUFFIX = f"{neighbourhood.DEFAULT_RADIUS_KM:g}km"


def _rail_access(ref: gpd.GeoDataFrame) -> pd.DataFrame:
    """Rail access per commune, from IDFM station and line data.

    Cannot go through neighbourhood.aggregate for two separate reasons:
    stations and lines have to be counted distinctly -- three stops on the same
    RER get you to the same places, three different lines do not -- and the
    data has real coordinates, so reach is measured to the stations themselves
    rather than to whole neighbouring communes.
    """
    stations = idfm_gares.fetch()

    communes = ref[["geometry"]].rename_axis("code_insee").reset_index()
    inside = stations.to_crs(communes.crs).sjoin(communes, how="inner", predicate="within")

    own = inside.groupby("code_insee").agg(
        nb_gares=("station_id", "nunique"),
        gares=("gare", lambda names: ", ".join(sorted(set(names)))),
    )

    nearby = neighbourhood.points_within(ref, stations).groupby("code_insee").agg(
        **{
            f"nb_gares_{NEARBY_SUFFIX}": ("station_id", "nunique"),
            f"nb_lignes_{NEARBY_SUFFIX}": ("ligne", "nunique"),
            f"lignes_{NEARBY_SUFFIX}": ("ligne", lambda lines: idfm_gares.format_lines(lines.dropna())),
        }
    )

    rail = own.join(nearby, how="outer").reindex(ref.index)

    counts = [c for c in rail.columns if c.startswith("nb_")]
    rail[counts] = rail[counts].fillna(0).astype("int64")
    return rail.fillna("")

# TODO : clean code by combining the fetch of ssmsi
def _security_rates(joined: pd.DataFrame) -> pd.DataFrame:
    """Curated SSMSI offence counts as faits per 1 000 inhabitants.

    The one criterion measured as a rate rather than a count. Per-capita was
    rejected for equipment -- it ranks hamlets first -- but crime has no
    saturation argument to stand on instead: 400 burglaries in Paris 15e and
    400 in a village are not the same fact.

    The denominator is communes_ref's population, not SSMSI's own insee_pop,
    so every figure on the site divides by the same number. It is also why the
    rates are recomputed from counts rather than read off the file, where
    cambriolages are published per 1 000 logements and the rest per 1 000
    habitants -- two denominators that cannot be added together.
    """
    counts = joined[ssmsi.CRIME_COLUMNS]
    per_1000 = counts.div(joined["population"], axis=0).mul(1000)

    rates = per_1000.round(2).rename(columns=lambda c: c.replace("nb_", "taux_"))
    rates["taux_delinquance"] = per_1000.sum(axis=1, min_count=len(counts.columns)).round(2)
    return rates


def main() -> None:
    ref = communes_ref.build()

    # Source modules return polars DataFrames; geopandas only
    # understands pandas, so convert before joining onto the geometry table.
    rent_df = rent.fetch().to_pandas().set_index("code_insee")
    bpe_df = bpe.fetch().to_pandas().set_index("code_insee")

    joined = ref.join(rent_df, how="left").join(bpe_df, how="left")

    # What matters for choosing where to live is how much is reachable, not
    # how much sits inside the commune's own borders
    nearby = neighbourhood.aggregate(ref, joined[bpe.CRITERION_COLUMNS])

    for column in bpe.CRITERION_COLUMNS:
        joined[f"{column}_{NEARBY_SUFFIX}"] = nearby[column].astype("int64")

    joined[f"population_{NEARBY_SUFFIX}"] = nearby["population_voisinage"]

    # rail access : metro, tram, rer, train...
    joined = joined.join(_rail_access(ref))

    # recorded crime, per commune
    joined = joined.join(ssmsi.fetch().to_pandas().set_index("code_insee"), how="left")

    # TODO: join environment scores here once those source modules are implemented.
    # ips_df = ips_schools.fetch()
    # corine_df = corine.fetch()
    # airparif_df = airparif.fetch()

    # The single rent figure the rent score is built from, in EUR/m2.
    joined["loyer_m2_moyen"] = joined[RENT_COLUMNS].mean(axis=1).round(2)

    # The counts themselves are a step on the way; only the rates are shown.
    joined = joined.join(_security_rates(joined)).drop(columns=ssmsi.CRIME_COLUMNS)

    # Combine all cleaned metrics
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists():
        OUTPUT_PATH.unlink()
    joined.reset_index().to_file(OUTPUT_PATH, driver="GeoJSON")


if __name__ == "__main__":
    main()
