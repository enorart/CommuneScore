# CommuneScore

A public website that helps someone choose **which commune to search for housing in**, across Île-de-France — before using a rental-listing tool (Jinka, SeLoger, etc.). **It is not a listing search engine.**

For each commune, the site shows an interactive choropleth map colored by a composite score built from: average rent, sports/leisure, culture, education, health, amenities, security, and environment (green space + air quality). Weights per criterion are adjustable live via sliders — all composite scoring happens client-side in the browser.

See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the full spec: data sources, architecture rationale, build milestones, and non-goals.

## Repository layout

```
etl/            # Python ETL pipeline — produces data/processed/communes_scores.geojson
web/            # Vite + vanilla JS static frontend (MapLibre GL JS choropleth)
data/raw/       # Downloaded source data (gitignored, re-fetchable)
data/processed/ # Final output GeoJSON consumed by the frontend
.github/workflows/
  deploy.yml        # builds web/ and deploys to GitHub Pages on push to main
  refresh-data.yml  # scheduled monthly re-run of the ETL pipeline
```

## ETL pipeline

Requires [`uv`](https://docs.astral.sh/uv/).

```bash
uv sync
uv run python -m etl.pipeline
```

Outputs `data/processed/communes_scores.geojson` (commune boundaries + population + rent + equipment counts + per-criterion 0–100 scores, keyed by `code_insee`). Raw source files are cached under `data/raw/` on first fetch — delete a specific cache file to force a re-fetch of just that source.

Currently wired in: `communes_ref` (reference geometry/population, Paris split into its 20 arrondissements), `rent`, `bpe`, and `idfm_gares`. The remaining source modules in `etl/sources/` (`ssmsi.py`, `corine.py`, `airparif.py`, `ips_schools.py`) are still stubs — see `PROJECT_PLAN.md` section 7 for build order.

`bpe` writes six curated criterion counts (`nb_sports`, `nb_culture`, `nb_enseignement`, `nb_sante`, `nb_commerces`, `nb_petite_enfance`) plus the 27 raw BPE sous-domaine counts (`bpe_a1` … `bpe_g1`), so criteria can be re-cut later without re-downloading. The criterion definitions and the reasoning behind them (why the 7 BPE domaines are too coarse to use directly) live at the top of `etl/sources/bpe.py`.

Transport does **not** come from BPE. Its transport domain is 99% taxi-VTC company registrations (54,895 rows out of 55,328 in IDF) and the stations it does carry are SNCF/RER only — no métro, no tram. `etl/sources/idfm_gares.py` replaces it with Île-de-France Mobilités' rail network: 996 stations across 50 lines, every mode, named the way a rider names them (`RER A`, `TRAIN H`, `METRO 4`, `TRAM 3a`).

### Scoring

Each criterion ends up as a `score_*` column on a 0–100 scale. Equipment criteria are computed in two steps:

1. **Neighbourhood count** (`etl/common/neighbourhood.py`). Equipment is re-counted over each commune plus everything within 3 km, giving `nb_<criterion>_3km` (and `population_3km` for context). The radius lives in `neighbourhood.DEFAULT_RADIUS_KM` and is baked into the column names via `NEARBY_SUFFIX` in `pipeline.py`; `web/sliders.js` mirrors it as `NEARBY_RADIUS_KM`. Administrative borders are invisible to a resident — a bakery 500 m away in the next commune counts.
2. **Log min-max** (`normalize.log_min_max_scale`). `log1p` of that count, min-max scaled to 0–100. The log is the point: going from 1 reachable bakery to 10 changes daily life, going from 300 to 3 000 does not.

Transport is scored the same way but on **distinct lines** reachable, not stations — three stops on the same RER get you to the same places, three different lines do not. It also measures reach differently: the IDFM data has real coordinates, so `neighbourhood.points_within` measures to the stations themselves. `aggregate` can only work at commune granularity, which credited Versailles with an RER A station 6.8 km away because Rueil-Malmaison happens to come within 2.3 km of its boundary. BPE has no coordinates, so it has no choice but to live with that.

Rent skips both steps. `score_loyer` is the inverted percentile rank of `loyer_m2_moyen` (the mean of `loyer_m2_appartement` and `loyer_m2_maison`, in €/m²), so cheaper scores higher. ANIL's `t1_t2` and `t3_plus` are carried through for tooltip detail but not scored — they're subsets of `loyer_m2_appartement` (correlation .96), so including them would weight apartments 3× against houses.

Two approaches were tried and rejected, both visible on the map as an obviously wrong answer:

- **Per-capita rates.** `PROJECT_PLAN.md` design rule 3 asks for these. They rank 300-inhabitant Seine-et-Marne villages above every real option and put Paris in the bottom third — small denominators dominate, and per-capita structurally rewards low density. The log's saturation does the job the rate was meant to do (stop big cities running away with it) without inverting the map.
- **Percentile rank of counts.** Rank is invariant under any monotonic transform, so ranking `log(count)` and ranking `count` give identical results — ranking cannot express saturation at all. It collapses to a pure density ordering where everything near central Paris wins and nothing else is distinguishable.

Raw counts and prices are kept alongside the scores for tooltips (design rule 4). The **composite** score is deliberately not computed here — weights belong to the user, so `web/app.js` combines the `score_*` columns client-side on every slider move.

### Scope

Scores are relative, so the set they are relative *to* is the user's choice: all of Île-de-France, one of the 8 départements, or one of the 63 intercommunalités. Île-de-France is the wrong yardstick once a search has been narrowed — inside a single intercommunalité every commune lands in the same narrow band and the ranking stops discriminating.

Changing the scope re-runs the whole normalization over the selected communes only, in the browser: `web/scoring.js` is a port of `etl/common/normalize.py` plus the scoring block of `etl/pipeline.py`, working from the raw columns the GeoJSON already carries. The ETL's own `score_*` columns are the Île-de-France baseline and the reference the port is checked against — at that scope the two agree exactly on all 1285 communes × 8 criteria. The catch to keep in mind is that a small scope forces a 0 and a 100 by construction: in a 4-commune intercommunalité, the best and worst are pinned to the ends of the scale however close together they really are.

The grouping comes from `code_epci` / `nom_epci`, written by `communes_ref.build()`. Inner-ring communes belong to two intercommunalités at once — the Métropole du Grand Paris plus, inside it, an EPT — and the EPT wins: MGP is 131 communes across three départements, too coarse to compare within. Paris's 20 arrondissements are their own group ("Ville de Paris"), since Paris is in MGP but exercises the EPT functions itself and so has no EPT to inherit.

## Frontend

```bash
cd web
npm install
npm run dev      # local dev server at http://localhost:5173
npm run build    # outputs to web/dist, deployed by the GitHub Action
npm run preview  # preview in localhost the static built website
```

`npm run dev` and `npm run build` both run a `predev`/`prebuild` hook (`web/scripts/sync-data.mjs`) that copies `data/processed/communes_scores.geojson` into `web/public/data/` so Vite can serve it. Re-run `uv run python -m etl.pipeline` any time you want the map to reflect fresher data, then restart `npm run dev` (or just re-run `npm run build`) to pick it up.

The map renders every IDF commune (+ Paris arrondissements) as a choropleth colored by the composite score. The scope picker at the top of the sidebar sets the comparison set (see above); communes outside it stay drawn but faded and unclickable, so a small intercommunalité is still placeable on the region. One slider per criterion (0 to `MAX_WEIGHT` in `sliders.js`, where 0 drops the criterion out of the average rather than scoring it zero) recolors the map and rebuilds the ranking live; clicking a commune or a ranking row opens a popup breaking the score down against its raw values. The rent and transport rows expand — rent into all four ANIL typologies (with the two that feed the score marked), transport into the commune's stations and every line reachable within 3 km. They behave as an accordion: eight criteria plus two open sections is taller than MapLibre has room for on either side of the click point.

Two implementation notes: the source uses `promoteId: "code_insee"` so the composite lives in MapLibre feature state and the formula stays in one place in `app.js`, and updates are coalesced to one pass per animation frame — dragging a slider would otherwise queue 1285 feature-state writes per input event. Everything on the page reads from a single colour scale (`RAMP` in `app.js`), so the map, the per-commune "spine" bars in the ranking and the popup bars all mean the same thing and share one legend.

## Data sources & licenses

All datasets are French open data, mostly under Licence Ouverte / Etalab 2.0 or ODbL. Full source list and access method: `PROJECT_PLAN.md` section 3.

Wired in so far:

| Data | Source | License |
|---|---|---|
| Commune boundaries + population + intercommunalités | IGN — ADMIN EXPRESS COG, via the Géoplateforme WFS (`data.geopf.fr`) | Licence Ouverte / Etalab 2.0 |
| Rent (€/m²) | ANIL — Carte des loyers 2025, via data.gouv.fr | Licence Ouverte / Etalab 2.0 |
| Equipment counts | INSEE — Base permanente des équipements 2025 | Licence Ouverte / Etalab 2.0 |
| Rail stations and lines | Île-de-France Mobilités — Gares et stations du réseau ferré d'Île-de-France (par ligne) | Licence Ouverte v2.0 (Etalab) |

Attribution for these is surfaced behind the map's (i) button — MapLibre's attribution control, fed by `SOURCE_ATTRIBUTION` in `web/app.js` and shown alongside the basemap's own credits. Add a row here and an entry there as each remaining source lands.

## Non-goals (v1)

See `PROJECT_PLAN.md` section 8 — no scraping of sites that disallow it, no live rental listings, no user accounts/backend, no commute-time scoring yet, Île-de-France only.
