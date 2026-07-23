"""Indice de Position Sociale (IPS) geolocalise for schools/colleges.

Optional enrichment beyond raw BPE education counts.
"""

import pandas as pd


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with column: ips_moyen."""
    raise NotImplementedError("TODO: call data.gouv.fr tabular API for IPS ecoles/colleges")
