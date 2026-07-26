# CommuneScore

**Where should I look for a flat?** CommuneScore answers that question for the 1 285 communes of Île-de-France, on one interactive map, from open data only.

You set how much you care about rent, transport, security, shops, schools and the rest; the map recolours live and a ranking tells you which communes fit. Then you take those names to a listing site. **It is not a listing search engine** : it is the step before one.

🗺️ **[Try it](https://enorart.github.io/CommuneScore/)**

---

## Objectives

### What this is for

Rental-listing tools (Jinka, SeLoger, Leboncoin…) are good at answering *"what is available in Montreuil?"* and useless at answering *"should I be looking in Montreuil at all?"*. Choosing the commune comes first, and it is the decision people make with the least information : usually a vague reputation, and whatever they can afford.

That information exists. INSEE, ANIL, Île-de-France Mobilités and the Ministry of the Interior all publish it, per commune, for free. It is just scattered across a dozen datasets in formats nobody wants to open on a Sunday evening. CommuneScore joins them onto one map and lets you weigh them yourself, because there is no universal ranking of communes : a couple with a toddler and a car and a night-shift nurse without one are not looking for the same place.

### What this is deliberately not

- **Not a listing search engine.** No live rental listings, no prices of actual flats, no alerts. That is Jinka's job and it does it well.
- **Not a scraper.** Nothing here scrapes a site whose terms disallow it. For example, reviews from forum like `ville-ideale.fr` are not used... And they are pretty subjective as well...
- **Not a commute planner.** The transport criterion measures *how much network you can reach* in the city and his 1km neighborhood , not the door-to-door time to your office. A real commute needs a destination and a timetable; that is a different tool.
- **Not real-time.** Every indicator is an annual figure, on purpose. The question is not "is the air bad today" or "was there a burglary last week" : it is what a place is *usually* like, over a year, because you often sign a lease for at least that long. Sources are refreshed roughly yearly and the site follows them.
- **Not an oracle.** Scores are relative, coarse and built from recorded data with known biases. Every number the map colours a commune by is shown next to it in raw form, so you can disagree with the score and keep the fact.
- **No accounts, no backend, no tracking.** One static data file, one static site.

Île-de-France only for now. Nothing in the design is region-specific except one source (Île-de-France Mobilités, for rail) : extending the scope is mostly a matter of finding a national equivalent for transport.

### How to use it

1. **Pick a comparison zone.** Top of the sidebar. All of Île-de-France, the petite or grande couronne, one of the 8 départements, or one of the 63 intercommunalités. This matters more than it looks : see [Scope](#scope-what-a-score-is-relative-to).
2. **Set your priorities.** One slider per criterion. Sliding to **0 removes the criterion entirely** rather than scoring it zero, so "I don't have children and I don't care about schools" is possible.
3. **Read the map.** Darker = better fit for *your* weights. The ranking beneath the sliders lists the best communes, each with a small "spine" of bars showing its profile at a glance : a commune strong everywhere and one strong in two things can share the same composite score.
4. **Click a commune.** The popup breaks the score down criterion by criterion, showing the raw value next to each score. Rent, transport and security rows expand for detail.
5. **Zoom in on a zone.** In the popup, the commune's département and intercommunalité are clickable : comparing 30 neighbouring communes tells you far more than comparing 1 285.

---

## Data sources & licenses

All sources are French open data, published per commune.

| Criterion | Source | Year | Licence |
|---|---|---|---|
| Boundaries, population, intercommunalités | IGN — ADMIN EXPRESS COG, via the Géoplateforme WFS | 2025 | Licence Ouverte / Etalab 2.0 |
| Rent (€/m²) | ANIL — Carte des loyers, via data.gouv.fr | 2025 | Licence Ouverte / Etalab 2.0 |
| Shops, health, schools, childcare, sport, culture | INSEE — Base permanente des équipements (BPE) | 2025 | Licence Ouverte / Etalab 2.0 |
| Rail stations and lines | Île-de-France Mobilités — Gares et stations du réseau ferré | 2025 | Licence Ouverte v2.0 (Etalab) |
| Recorded crime | SSMSI — Base statistique communale de la délinquance | 2025 | **ODbL v2** |
| *Green space, air quality* | *CORINE Land Cover, Airparif* | — | *planned, not yet wired in* |

Attribution is surfaced in the app behind the map's ℹ️ button, alongside the basemap's own credits (OpenFreeMap / OpenStreetMap).

### How each criterion is computed

The guiding rule everywhere below: **the ETL produces raw values, the browser turns them into scores.** Nothing is pre-scored, for the reason explained under [Scope](#scope-what-a-score-is-relative-to).

#### Facilities : shops, health, schools, childcare, sport, culture

Counted, then scored in two steps.

**1. Count over a 1 km neighbourhood, not the commune.** Administrative borders are invisible to a resident: for example, a bakery 500 m away in the next commune still counts. Each criterion is re-counted over the commune plus everything within 1 km, giving `nb_commerces_1km`, `nb_sante_1km` and so on (`etl/common/neighbourhood.py`).

**2. Scale logarithmically.** `log1p(count)`, min-max scaled to 0–100. The log is the whole point: going from 1 reachable bakery to 10 changes your daily life; going from 300 to 3 000 does not.

The 7 BPE *domaines* are too coarse to score on directly, so the criteria are cut from its 28 *sous-domaines* instead. Excluded on purpose: domaine A (86 % of it is builders and hairdressers), tourism, outdoor sports sites, universities and adult education, and social services (which are not medical access). Full reasoning at the top of `etl/sources/bpe.py`.

#### Transport

Same two steps, with two differences.

It counts **distinct lines reachable, not stations**. Three stops on the same RER get you to the same places; three different lines do not. It measures distance **to the stations themselves**, not to neighbouring communes, because Île-de-France Mobilités publishes real coordinates. 

> **Why not BPE?** BPE has a transport domain, and it is unusable. 54 895 of its 55 328 Île-de-France rows are taxi-VTC company registrations, and the stations it does carry are SNCF/RER only, no métro, no tram. IDFM's network has 996 stations across 50 lines, every mode, with their names.

#### Rent

Not a count, so no log and no neighbourhood: `score_loyer` is the **inverted percentile rank** of `loyer_m2_moyen`, so cheaper scores higher. That figure is the mean of ANIL's apartment and house indicators, in €/m².

ANIL also publishes `t1_t2` and `t3_plus`. Both are shown in the popup but neither is scored (they are subsets of the apartment indicator, so including them would weight apartments 3× against houses).

#### Security

The one criterion measured as a **rate**: `taux_delinquance`, faits recorded per 1 000 inhabitants, scored as an inverted percentile rank so a quieter commune scores higher.

A rate rather than a count because 400 burglaries in Paris 15e and 400 in a village are not the same fact, and unlike facilities there is no saturation argument to lean on instead. A *rank* rather than min-max because the tail would flatten everything else against it.
Note : Roissy-en-France reads 347 facts per 1000 habitants, but an airport is absorbing offences against people who live nowhere near it.

Only **9 of SSMSI's 15 indicators** feed it, in two families shown separately in the popup (`taux_atteintes_personnes`, `taux_atteintes_biens`). Left out, each for a reason:

| Excluded | Why                                                                                                                                                                            |
|---|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Usage / trafic de stupéfiants (3 indicators) | Count *mis en cause* on elucidated cases : they measure police activity, not risk. The same person is also counted once per commune, so they do not add up across territories. |
| Escroqueries et fraudes | Counted at the **victim's residence**, not where it happened, and mostly online. No local geography at all.                                                                    |
| Vols sans violence contre des personnes | Highest-volume class, and the one whose denominator is most wrong: it hits the daytime population. Paris 1er reads 312 ‰ on 15 114 residents.                                  |
| Violences physiques intrafamiliales | Happen within the household : not a risk the neighbourhood confers on someone moving there.                                                                                    |

Two caveats worth knowing when reading this layer:

- **Place of commission, not of residence.** A commune with a station, a mall or an office district absorbs offences against people who do not live there, and reads worse than a resident experiences.
- **Statistical secrecy, and it is not rare.** SSMSI withholds any count below 5 faits over 3 successive years, publishing the mean over its département's withheld communes instead. The median Île-de-France commune has **5 of the 9 indicators** filled that way. `nb_indicateurs_estimes` records how many, and the popup says so.
- **Small communes are noisy.** Because the rate is computed over the commune alone — unlike every other criterion, which is smoothed over 1 km — a village of 100 inhabitants swings between the extremes of the scale on a handful of faits. Eight communes of 32–155 inhabitants score a perfect 100 on genuinely published zeros, and the same arithmetic puts Charmont (32 hab.) near the bottom at 250 ‰. The département medians are sound (Paris 35.8 ‰, Seine-Saint-Denis 30.0 ‰, Yvelines 17.7 ‰); it is the rural fringe that speckles. Smoothing security over 1 km like everything else is the obvious fix and an open question.

### Scoring: how criteria become one score

Each criterion is scaled to 0–100 over the communes currently in scope. The **composite** is then a plain weighted average of those scores, using the slider weights, rebuilt on every slider move. Criteria at weight 0 drop out of the average rather than contributing a zero.

### Scope: what a score is relative to

A 0–100 score only means something relative to a set of communes, and **which set that is belongs to the user**: all of Île-de-France, the petite couronne (92, 93, 94 — 122 communes) or the grande couronne (77, 78, 91, 95 — 1 143 communes), one of the 8 départements, or one of the 63 intercommunalités.

The two couronnes are there because the ring immediately around Paris and the ring beyond it are different housing markets, and either is a fairer yardstick than the whole region without being as narrow as a single département. Paris belongs to neither, being what they are rings around.

This is not cosmetic. Île-de-France is the wrong yardstick once a search has been narrowed: inside a single intercommunalité every commune lands in the same narrow band of the regional scale and the ranking stops discriminating at all. Changing the scope re-runs the entire normalisation over the selected communes only, from the raw columns the GeoJSON carries.

**This is why scoring lives in the browser and not in the ETL**

Note: a small scope *forces* a 0 and a 100 by construction. In a 4-commune intercommunalité, the best and worst are pinned to the ends of the scale however close together they really are.

A zone can be reached two ways. The dropdown works if you already know the name, but this is a lot of names to know, so the map is the other route: every commune popup names its couronne, its département and its intercommunalité as buttons, and clicking one compares within it. Once a zone is selected, clicking any *faded* commune moves the zone to the one that click landed in, at the same granularity : so leaving Est Ensemble by clicking west lands you in Plaine Commune, not in a département, and leaving the petite couronne by clicking east lands you in the grande couronne. Clicking Paris from either couronne selects the Paris département, since Paris has no couronne of its own to offer.

The grouping comes from IGN's data. 

---

## Technical details

### Repository layout

```
etl/
  common/                 # shared business logic and utilities, no source knows any other
    cache.py              # cached_download(): fetch each source file once into data/raw/
    insee.py              # INSEE codes, the Île-de-France filter, polars -> pandas by commune
    communes_ref.py       # reference table every source joins onto (geometry, population, EPCI)
    neighbourhood.py      # re-count a metric over a commune + everything within N km
    logs.py               # setup python logger for etl 
  sources/                # one module per data source, all the same shape (see its __init__.py)
    rent.py  bpe.py  idfm_gares.py  ssmsi.py
    corine.py  airparif.py  ips_schools.py     # stubs, not yet implemented
  pipeline.py             # orchestration only: ref + every source -> communes_scores.geojson

web/
  index.html  style.css
  app.js                # map, application state, event wiring
  sliders.js            # the criteria list, THE place to extend when a source lands
  scoring.js            # all scoring: per criterion 0-100, and the composite
  scopes.js             # the scope comparison sets
  render.js             # every HTML string (popup, ranking rows, spine bars)
  colors.js             # the single colour scale, shared by map, bars and legend
  geometry.js           # bounds and centroid, for framing and placing popups
  scripts/sync-data.mjs # copies the GeoJSON into web/public/ before dev/build

data/
  raw/                  # downloaded source files (gitignored, re-fetchable)
  processed/            # communes_scores.geojson — the one file the frontend loads

.github/workflows/
  deploy.yml            # build web/ + deploy to GitHub Pages on push to main
  refresh-data.yml      # monthly re-run of the ETL
```

### Tech stack

**ETL — Python 3.13, managed with [uv](https://docs.astral.sh/uv/).** `polars` for the tabular sources (BPE is a large national CSV, SSMSI a 5.2-million-row Parquet), `geopandas` + `shapely` for the spatial work (buffering communes, point-in-polygon counts, geometry simplification), `requests` for downloads. No database: the pipeline's only output is a static file.

**Frontend — Vite + vanilla JS + [MapLibre GL JS](https://maplibre.org/).** No framework. MapLibre and basemap tiles from OpenFreeMap.

**Hosting — GitHub Pages.** The whole site is static: one HTML page, one JS bundle, one cleaned GeoJSON. There is no server, and adding one would only be justified by live commute queries, neither of which is in scope.

### ETL pipeline

```bash
uv sync
uv run python -m etl.pipeline
```

Output: `data/processed/communes_scores.geojson` — **1 285 features, 60 properties, ~4 MB**, committed to the repo so the frontend works without running the ETL. The first run downloads ~90 MB into `data/raw/`.

Three conventions hold the pipeline together:

1. **The reference table comes first.** `etl/common/communes_ref.py` builds one GeoDataFrame indexed by `code_insee` (name, population, geometry, département, intercommunalité) from IGN's AdminExpress. Every other source left-joins onto it, so the row count never drifts.
2. **Every source module has the same shape.** No source imports another, and `pipeline.py` knows nothing about any source's data: it builds the reference table, asks each source for its columns and joins them. Adding a source is writing one module and adding it to `SOURCES`.
3. **Raw values only.** The pipeline never scores anything.

The contract, documented in `etl/sources/__init__.py`:

| | |
|---|---|
| `fetch()` | The source's own data, in the source's own shape, downloaded once through `common.cache` and parsed. Nothing project specific. |
| `build(ref)` | The columns this source contributes, indexed by `code_insee`. `ref` is the reference table, for sources needing its geometry (neighbourhood reach) or its population (rates). All source specific curation and derivation lives here. |
| `metadata()` | Optional. Choices the frontend has to state back to the user, merged into the GeoJSON's `metadata` member. |


Every module logs through `logging.getLogger(__name__)`; only the entry point configures handlers, in `etl/common/logs.py`. Set the level without touching code:

```bash
LOG_LEVEL=WARNING uv run python -m etl.pipeline   # silent unless something is wrong
LOG_LEVEL=DEBUG   uv run python -m etl.pipeline
```

Every download goes through `cached_download(url, filename)` in `etl/common/cache.py`, which fetches into `data/raw/` once and never again. **Delete one file in `data/raw/` to force a re-fetch of just that source.**

**Note on Paris:** commune `75056` is replaced by its 20 arrondissements (`75101`–`75120`) everywhere. Every Île-de-France source codes Paris by arrondissement, and IGN publishes matching geometry *and* population. Sources that carry both `75056` and the arrondissements have `75056` dropped, or everything in Paris would count twice.

### Frontend

```bash
cd web
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # -> web/dist, what the GitHub Action deploys
npm run preview  # serve the built site locally
```

`dev` and `build` both run a hook that copies the GeoJSON into `web/public/data/`. Re-run the ETL any time you want fresher data, then restart the dev server.

**Adding a criterion** is deliberately cheap: add one entry to `CRITERIA` in `web/sliders.js` (key, label, the `score_*` property, the raw column it reads, a unit, a default weight). The map, the sliders, the ranking, the spine bars, the popup and the scope re-scoring all iterate that list and pick it up for free. The only extra step is a `SCORERS` entry in `web/scoring.js`, and only if the default (log min-max, higher is better) is wrong for it — as it is for rent and security, which are both inverted percentile ranks.

Three implementation notes that are load-bearing:

- The map source uses `promoteId: "code_insee"`, so the composite score lives in MapLibre **feature state** and the formula stays in one place (`compositeScore` in `scoring.js`).
- Feature-state updates are **coalesced to one pass per animation frame**. Dragging a slider would otherwise queue 1 285 writes per input event.
- Everything on the page reads from a **single colour scale** (`RAMP` in `colors.js`): the map, the ranking spines and the popup bars all mean the same thing, and one legend explains all three.

---

## Side notes

### Licence

Code: **MIT**. Do what you like with it.

Data: the generated `communes_scores.geojson` is a derived database of SSMSI's crime statistics, which are **ODbL v2**. ODbL is share-alike, so that file and anything derived from it must be redistributed under ODbL with attribution to the sources listed above. .

### What's next ?

Possible improvments:

1. **The environment criterion** : `etl/sources/corine.py` (green-space share from CORINE Land Cover) and `etl/sources/airparif.py` (yearly average NO₂ / PM2.5).
2. **School quality** via the IPS index, as an enrichment on top of raw school counts.
3. **Extending beyond Île-de-France** : replacing the IDFM rail source with a national equivalent and/or local equivalent for cities like Lyon, Marseille, Toulouse...
4. Dynamic door-to-door commute time from the centroid of a commune to a chosen place. Need dynamic API call and a web server, not a static website anymore.
5. Adding qualitative review from locals / Fetching with authorisation some website about quality of life in a commune or district.

### On AI assistance

Parts of this project, code, data exploration and documentation, were written with the help of Claude. The techstack, architecture, design decisions, the source curation and the review are the author's.

### Author
Enora SICRE - https://github.com/enorart
