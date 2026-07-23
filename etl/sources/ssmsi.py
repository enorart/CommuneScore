"""SSMSI communal crime statistics -> security score input."""

import pandas as pd


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with column: crime_rate_per_1000."""
    raise NotImplementedError("TODO: call SSMSI dataset API, compute rate per 1000 inhabitants")
