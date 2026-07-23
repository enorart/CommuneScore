"""INSEE BPE (Base Permanente des Equipements) bulk data.

Aggregates equipment point counts per commune for the domains:
sports-loisirs-culture, enseignement, sante-social, commerces,
transports-deplacements. Counts are later converted to per-capita
rates in the pipeline using communes_ref population.
"""

import pandas as pd


def fetch() -> pd.DataFrame:
    """Return a DataFrame indexed by code_insee with columns:
    nb_sports, nb_culture, nb_enseignement, nb_sante, nb_commerces, nb_transport.
    """
    raise NotImplementedError("TODO: download BPE bulk CSV, spatial join equipment points to communes")
