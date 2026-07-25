"""Orchestrates all ETL sources, joins on code_insee, normalizes, and writes
the final static dataset consumed by the frontend.

Output: data/processed/communes_scores.geojson
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

from etl.common import communes_ref, neighbourhood, normalize
from etl.sources import bpe, idfm_gares, rent

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
    stations and lines have to be counted distinctly,
    and the data has real coordinates, so reach is measured to the stations
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

    # TODO: join security and environment scores here once those source
    # modules are implemented.
    # ips_df = ips_schools.fetch()
    # ssmsi_df = ssmsi.fetch()
    # corine_df = corine.fetch()
    # airparif_df = airparif.fetch()

    # Per-criterion 0-100 scores. The composite is deliberately NOT computed
    # here : weights are the user's to set (slider)
    for column in bpe.CRITERION_COLUMNS:
        criterion = column.removeprefix("nb_")
        joined[f"score_{criterion}"] = normalize.log_min_max_scale(
            joined[f"{column}_{NEARBY_SUFFIX}"]
        ).round(1)

    # Transport scores on distinct lines reachable, not stations: three stops
    # on the same RER get you to the same places, three different lines do
    # not. log1p means the jump from no rail at all to one line is the biggest step
    joined["score_transport"] = normalize.log_min_max_scale(
        joined[f"nb_lignes_{NEARBY_SUFFIX}"]
    ).round(1)

    # Averaged in EUR/m2
    # Cheaper is better, invert=True.
    joined["loyer_m2_moyen"] = joined[RENT_COLUMNS].mean(axis=1).round(2)
    joined["score_loyer"] = normalize.percentile_rank(joined["loyer_m2_moyen"], invert=True).round(1)

    # Combine all cleaned metrics
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists():
        OUTPUT_PATH.unlink()
    joined.reset_index().to_file(OUTPUT_PATH, driver="GeoJSON")


if __name__ == "__main__":
    main()
