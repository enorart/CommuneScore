"""Orchestrates all ETL sources, joins on code_insee, normalizes, and writes
the final static dataset consumed by the frontend.

Output: data/processed/communes_scores.geojson
"""

from pathlib import Path

from etl.common import communes_ref
from etl.sources import rent

# TODO : include all sources of data : BPE, security, air...

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "communes_scores.geojson"


def main() -> None:
    ref = communes_ref.build()

    # Source modules return polars DataFrames (tabular work); geopandas only
    # understands pandas, so convert before joining onto the geometry table.
    rent_df = rent.fetch().to_pandas().set_index("code_insee")

    joined = ref.join(rent_df, how="left")

    # TODO: join BPE per-capita rates, security, and environment scores here
    # once those source modules are implemented.
    # bpe_df = bpe.fetch()
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
