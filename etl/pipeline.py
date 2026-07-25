"""Orchestrates all ETL sources, joins on code_insee, normalizes, and writes
the final static dataset consumed by the frontend.

Output: data/processed/communes_scores.geojson
"""

from pathlib import Path

from etl.common import communes_ref
from etl.sources import bpe, rent

# TODO : include all sources of data : security, air...

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "communes_scores.geojson"


def main() -> None:
    ref = communes_ref.build()

    # Source modules return polars DataFrames (tabular work); geopandas only
    # understands pandas, so convert before joining onto the geometry table.
    rent_df = rent.fetch().to_pandas().set_index("code_insee")
    bpe_df = bpe.fetch().to_pandas().set_index("code_insee")

    joined = ref.join(rent_df, how="left").join(bpe_df, how="left")

    # Equipment counts mean nothing without knowing how many people they
    # serve, so expose a per-1000-inhabitants rate alongside each raw count
    # (PROJECT_PLAN.md design rules 3 and 4). Population comes from
    # communes_ref, which is why this lives here and not in bpe.py.
    for column in bpe.CRITERION_COLUMNS:
        rate = joined[column] / joined["population"] * 1000
        # 3 decimals is well past what these counts justify, and keeps the
        # committed geojson from carrying 17 significant digits per value.
        joined[f"{column}_pour_1000_hab"] = rate.round(3)

    # TODO: join security and environment scores here once those source
    # modules are implemented.
    # ips_df = ips_schools.fetch()
    # ssmsi_df = ssmsi.fetch()
    # corine_df = corine.fetch()
    # airparif_df = airparif.fetch()

    # TODO: normalize each criterion to 0-100 (etl.common.normalize)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists():
        OUTPUT_PATH.unlink()
    joined.reset_index().to_file(OUTPUT_PATH, driver="GeoJSON")


if __name__ == "__main__":
    main()
