"""Average rent (EUR/m2) per commune from the 'Carte des loyers' data.gouv.fr dataset."""

import pandas as pd


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with column: loyer_m2."""
    raise NotImplementedError("TODO: call Carte des loyers API")
