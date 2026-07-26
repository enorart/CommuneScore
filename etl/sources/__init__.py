"""One module per data source. Every one of them looks the same from outside.

    fetch() -> pl.DataFrame | gpd.GeoDataFrame
        The source's own data, in the source's own shape, downloaded once
        through common.cache and parsed. Nothing project specific here.

    build(ref) -> pd.DataFrame
        The columns this source contributes to the output, indexed by
        code_insee. `ref` is the communes_ref table, for the sources that need
        its geometry (neighbourhood reach) or its population (rates). All the
        source specific handling, curation and derivation lives here.

    metadata() -> dict            (optional)
        Choices the frontend has to state back to the user, merged into the
        GeoJSON's top level `metadata` member by pipeline.py.

No source imports another, and pipeline.py knows nothing about any of their
data: adding a source is writing one module and adding it to SOURCES.
"""
