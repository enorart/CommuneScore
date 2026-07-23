"""Orchestrates all ETL sources, joins on code_insee, normalizes, and writes
the final static dataset consumed by the frontend.

Output: data/processed/communes_scores.geojson
"""

from pathlib import Path

from etl.common import communes_ref
from etl.sources import airparif, bpe, corine, ips_schools, rent, ssmsi

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "communes_scores.geojson"


def main() -> None:
    ref = communes_ref.build()

    # TODO: fetch each source, join onto ref by code_insee
    # rent_df = rent.fetch()
    # bpe_df = bpe.fetch()
    # ips_df = ips_schools.fetch()
    # ssmsi_df = ssmsi.fetch()
    # corine_df = corine.fetch()
    # airparif_df = airparif.fetch()

    # TODO: convert BPE counts to per-capita rates using ref population

    # TODO: normalize each criterion to 0-100 (etl.common.normalize)

    # TODO: write joined GeoDataFrame to OUTPUT_PATH as GeoJSON
    raise NotImplementedError("TODO: implement full pipeline orchestration")


if __name__ == "__main__":
    main()
