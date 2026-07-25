"""Orchestrates all ETL sources, joins on code_insee, normalizes, and writes
the final static dataset consumed by the frontend.

Output: data/processed/communes_scores.geojson
"""

from pathlib import Path

from etl.common import communes_ref, neighbourhood, normalize
from etl.sources import bpe, rent

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "communes_scores.geojson"

# The rent typologies folded into the rent score, both in EUR/m2 (rent.py).
# ANIL also publishes t1_t2 and t3_plus, but those are subsets of loyer_m2_appartement
RENT_COLUMNS = [
    "loyer_m2_appartement",
    "loyer_m2_maison",
]

# Equipment columns are named after the radius they were counted over, so
# the output is self-describing. web/sliders.js has to agree — its
# NEARBY_RADIUS_KM is the same number.
NEARBY_SUFFIX = f"{neighbourhood.DEFAULT_RADIUS_KM:g}km"


def main() -> None:
    ref = communes_ref.build()

    # Source modules return polars DataFrames (tabular work); geopandas only
    # understands pandas, so convert before joining onto the geometry table.
    rent_df = rent.fetch().to_pandas().set_index("code_insee")
    bpe_df = bpe.fetch().to_pandas().set_index("code_insee")

    joined = ref.join(rent_df, how="left").join(bpe_df, how="left")

    # What matters for choosing where to live is how much is reachable, not
    # how much sits inside the commune's own borders :
    # equipment is re-counted over each commune plus everything within reach.
    nearby = neighbourhood.aggregate(ref, joined[bpe.CRITERION_COLUMNS])

    for column in bpe.CRITERION_COLUMNS:
        joined[f"{column}_{NEARBY_SUFFIX}"] = nearby[column].astype("int64")

    joined[f"population_{NEARBY_SUFFIX}"] = nearby["population_voisinage"]

    # TODO: join security and environment scores here once those source
    # modules are implemented.
    # ips_df = ips_schools.fetch()
    # ssmsi_df = ssmsi.fetch()
    # corine_df = corine.fetch()
    # airparif_df = airparif.fetch()

    # Per-criterion 0-100 scores. The composite is deliberately NOT computed
    # here -- weights are the user's to set, so app.js combines these
    # client-side on every slider move (PROJECT_PLAN.md section 2).
    for column in bpe.CRITERION_COLUMNS:
        criterion = column.removeprefix("nb_")
        joined[f"score_{criterion}"] = normalize.log_min_max_scale(
            joined[f"{column}_{NEARBY_SUFFIX}"]
        ).round(1)

    # Averaged in EUR/m2 rather than by averaging the two ranks: the
    # typologies share a unit, so the mean is a real price and stays
    # meaningful in a tooltip. Cheaper is better, hence invert.
    joined["loyer_m2_moyen"] = joined[RENT_COLUMNS].mean(axis=1).round(2)
    joined["score_loyer"] = normalize.percentile_rank(joined["loyer_m2_moyen"], invert=True).round(1)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists():
        OUTPUT_PATH.unlink()
    joined.reset_index().to_file(OUTPUT_PATH, driver="GeoJSON")


if __name__ == "__main__":
    main()
