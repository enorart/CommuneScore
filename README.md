# CommuneScore

**Where should I look for a flat?** CommuneScore answers that question for all the communes of Île-de-France, on one interactive map, from open data.

You set how much you care about rent, transport, security, shops, schools and the rest; the map recolours live and a ranking tells you which communes fit. Then you take those names to a listing site. **It is not a listing search engine** : it is the step before one.

🗺️ **[Try it](https://enorart.github.io/CommuneScore/)**

---

## Objectives

### What this is for

Rental-listing tools (Jinka, SeLoger, Leboncoin…) are good at answering *"what is available in this city?"* and useless at answering *"should I be looking in this city at all?"*. Choosing the commune comes first, and it is the decision people make with the least information : usually a vague reputation, and whatever they can afford.

That information exists. It is just scattered across public datasets in formats nobody wants to open on a Sunday evening. CommuneScore joins them onto one map and lets you weigh them yourself, because there is no universal ranking of communes.

### What this is deliberately not

- **Not a listing search engine.** No live rental listings, no prices of actual flats, no alerts. That is Jinka's job and it does it well.
- **Not a scraper.** For example, reviews from forum like `ville-ideale.fr` are not used... And they are pretty subjective as well...
- **Not a commute planner.** The transport criterion measures *how much network you can reach* in the city and his 1km neighborhood , not the door-to-door time to your office.
- **Not real-time.** Every indicator is an annual figure : it is what a place is *usually* like, over a year.
- **Not an oracle.** Scores are relative, coarse and built from recorded data with known biases.

Île-de-France only for now.   
⚠️ Several sources are region-specific : Île-de-France Mobilités for rail, Bruitparif for noise...  
⚠️ Isochrone is using Île-de-France Mobilités GTFS file.

### How to use it

1. **Pick a comparison zone.** All of Île-de-France, the petite, grande couronne, one of the 8 départements, or one of the intercommunalités.
2. **Set YOUR priorities.** One slider per criterion, grouped into foldable families. Sliding to 0 removes the criterion entirely.
3. **Read the map.** Darker = better fit for *YOUR* weights. The ranking beneath the sliders lists the best communes.
4. **Click a commune.** The popup breaks the score down criterion by criterion, showing the raw value next to each score. Each criterion carries an explanation what its number measures and where it misleads.
5. **See the public transport network.** Five toggles draw the RER, trains, métro, trams and buses* (*only stops)
6. **Ask what a commune reaches.** In its popup, *Temps de trajet depuis ici* recolours the whole map by minutes from that commune (public transport, bike or on foot) with a slider for how long you are willing to travel.

---

## Data sources & licenses

All sources are French open data, published per commune.

| Criterion | Source                                                                                                   | Year | Licence |
|---|----------------------------------------------------------------------------------------------------------|---|---|
| Boundaries, population, intercommunalités, chefs-lieux | IGN — ADMIN EXPRESS COG, via the Géoplateforme WFS (Web Feature Service, vectorial datas)                | 2025 | Licence Ouverte / Etalab 2.0 |
| Rent (€/m²) | ANIL — Carte des loyers, via data.gouv.fr                                                                | 2025 | Licence Ouverte / Etalab 2.0 |
| Shops, health, schools, childcare, sport, culture | INSEE — Base permanente des équipements (BPE) via data.gouv.fr                                           | 2025 | Licence Ouverte / Etalab 2.0 |
| Social composition of schools (IPS) | Ministère de l'Éducation nationale (DEPP) — Indices de position sociale des écoles, collèges et lycées, via data.education.gouv.fr | 2024-2025 | Licence Ouverte / Etalab 2.0 |
| Rail stations and lines | Île-de-France Mobilités — Gares et stations du réseau ferré via data.gouve.fr                            | 2025 | Licence Ouverte v2.0 (Etalab) |
| Line traces (map overlay) | Île-de-France Mobilités — Tracés du réseau de transport ferré d'Île-de-France, via data.gouv.fr | 2026 | Licence Ouverte v2.0 (Etalab) |
| Stops (map overlay) | Île-de-France Mobilités — Arrêts et lignes associées, via data.gouv.fr | 2026 | **ODbL** |
| Street network (travel time) | OpenStreetMap — Île-de-France extract, via Geofabrik | daily | **ODbL** |
| Timetables (travel time) | Île-de-France Mobilités — Horaires GTFS, via data.gouv.fr | daily | **ODbL** |
| Recorded crime | SSMSI — Base statistique communale de la délinquance via data.gouv.fr                                    | 2025 | **ODbL v2** |
| Air quality | Airparif — Concentrations moyennes annuelles modélisées, via its WCS (Web Coverage Service, raster datas | 2025 | **ODbL** |
| Noise | Airparif & Bruitparif — Cartographie air-bruit, via bruitparif.fr                                        | 2024 | Licence Ouverte / Etalab 2.0 |
| Green space | L'Institut Paris Region — Mode d'occupation du sol (MOS), 79 postes, via data.iledefrance.fr             | 2025 | Licence Ouverte / Etalab 2.0 |
| Night sky | Cerema — Cartographie de la radiance nocturne du satellite LuoJia 1-01, via data.gouv.fr                  | 2018 | Licence Ouverte / Etalab 2.0 |
| Public lighting practice | Cerema, DarkSkyLab & OFB — Cartographie nationale des pratiques d'éclairage nocturne, via data.gouv.fr | 2014-2025 | **ODbL** |

Attribution is surfaced in the app behind the map's ℹ️ button, alongside the basemap's own credits (OpenFreeMap / OpenStreetMap).

### How each criterion is computed

The ETL produces raw values, the browser turns them into scores.

#### Facilities : shops, health, schools, childcare, sport, culture

Counted **inside the commune**, then scaled logarithmically: `log1p(count)`, min-max to 0–100. Sport and Culture name what they count: both criteria expand in the popup into their five most numerous equipment types. Enseignement contains maternelles, primaires, collèges and lycées général, professionnel, agricole, not post-bac. 
> **BPE names types, never facilities.** There is no cinema name, no gym name: it publishes how many equipments of each a commune has.

#### Social composition of schools (IPS)

The **IPS** is the Ministry's index of the socio-professional composition of an establishment's pupils: DEPP scores each PCS and averages it over the pupils. `ips_moyen` is a **flat unweighted mean over every école, collège and lycée in the commune**, scored on a plain min-max.
The popup lists each establishment with its own IPS, best first.
It is not a measure of quality. It describes who is in the classroom, not what happens in it, not results, not teaching, not buildings.
Also, where an establishment sits is not where its pupils live, and less so the older they are: a commune is the authority for its écoles, a collège serves a sector, a lycée recruits across a basin.

#### Transport

Log scale and measured beyond the commune's border (within 1km). It counts **distinct lines reachable, not stations**.  

#### Rent

Inverted percentile rank of `loyer_m2_moyen`: cheaper scores higher. That figure is the mean of ANIL's apartment and house indicators, in €/m².
ANIL also publishes `t1_t2` and `t3_plus`. Both are shown in the popup but neither is scored (they are subsets of the apartment indicator, so including them would weight apartments 3× against houses).

#### Security

The one criterion measured as a **rate**: `taux_delinquance`, faits recorded per 1 000 inhabitants, scored as an inverted percentile rank so a quieter commune scores higher.

Note : Roissy-en-France reads 347 facts per 1000 habitants, but an airport is absorbing offences against people who live nowhere near it.

Only **9 of SSMSI's 15 indicators** feed it.

| Excluded | Why                                                                                                                                                                          |
|---|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Usage / trafic de stupéfiants (3 indicators) | Count *mis en cause* on elucidated cases : they measure police activity, not risk. |
| Escroqueries et fraudes | Counted at the **victim's residence**, not where it happened, and mostly online. No local geography at all.                                                                  |
| Vols sans violence contre des personnes | Highest-volume class, and the one whose denominator is most wrong: it hits the daytime population.                                 |
| Violences physiques intrafamiliales | Happen within the household : not a risk the neighbourhood confers on someone moving there.                                                                                  | 

#### Air quality

The index is a **ratio to a health guideline, not a concentration**: the mean of NO₂ / 10 and PM2.5 / 5, the WHO 2021 annual guideline values. So 1 means "at the level the WHO recommends". Airparif publishes four pollutants and all four are in the popup, but only two are scored. PM10 is the same particles as PM2.5 with a wider cutoff, so scoring both would weight particles twice against NO₂. O₃ is not scored and is **not a concentration**: Airparif publishes ozone as the number of days above 120 µg/m³ over 8 hours.
Area-weighted, not population-weighted. 

#### Noise

`pct_pop_bruit_oms` is the **share of a commune's residents living above the WHO noise recommendation**, road, rail and air traffic pooled, as an Lden annual average. A bounded share, so a plain min-max like green space, **inverted**, quieter scores higher. 

**What Lden is.** *Level day-evening-night*, the indicator European noise mapping has to use under Directive 2002/49/CE. An A-weighted sound level averaged over a year from three periods — in France day 06–18 h, evening 18–22 h, night 22–06 h — with the evening penalised **+5 dB** and the night **+10 dB**:

```
Lden = 10·log₁₀[ (12·10^(Ld/10) + 4·10^((Le+5)/10) + 8·10^((Ln+10)/10)) / 24 ]
```

| Source | WHO Lden | WHO Lnight | French limit |
|---|---|---|---|
| Road | **53 dB** | 45 dB | 68 dB |
| Rail | **54 dB** | 44 dB | 73 dB (68 for LGV) |
| Air | **45 dB** | 40 dB | 55 dB |


The file arrives already classified and the ETL only sums the classes above the recommendation, so `WHO_THRESHOLDS_LDEN` in `etl/sources/bruit.py` is carried into the GeoJSON `metadata` purely so the popup can state it: editing that constant changes what the app *says*, never what it computes.
Bruitparif publishes this crossed with Airparif's air classes, as a 3×3 grid — each axis collapsed to *meets the WHO recommendation* / *above it but within the French regulatory limit* / *above the limit*. Only the noise axis is read. Which axis is which is not stated in the file and was established two ways: every column on the air axis's first level is zero across the whole region, matching Airparif's finding that nowhere in Île-de-France meets the WHO air guideline; and the top of the noise axis is Iverny, Juilly, Cuisy, Mauregard and Le Mesnil-Amelot, villages under the CDG approach with among the *cleanest* air in the region. Only noise orders them that way.

#### Night sky

`radiance_nocturne` is the **light the commune sends upwards**, averaged over its own surface, in nW/cm²/sr. Scored as an **inverted percentile rank**, like rent, security and air: darker scores higher.
The source is the LuoJia 1-01 satellite, that mapped France once, in 2018, at 130 m, finer than the VIIRS composites most light-pollution maps are built on, which matters when the smallest commune here is 9.6 ha and a Paris arrondissement is under 2 km².
It is an emission map, not a sky brightness map.** It measures light leaving the ground, not the glow a resident looks up at.
**2018**: LuoJia 1-01 was a demonstration satellite and the campaign was never repeated.

The popup also names the commune's lighting policy: states the commune's most recent detected change. It carries no weight in the score.

#### Green space

`pct_espaces_verts` is the **share of the commune's own surface** under woods, natural land, parks and public gardens. Scored on a plain min-max.
Split into the two families shown separately in the popup: `pct_foret` (bois ou forêts, espaces ouverts à végétation arbustive ou herbacée, berges) and `pct_parcs` (parcs ou jardins publics, autres espaces verts, jardins familiaux). Left out:

| Excluded | Why |
|---|---|
| Terres labourées, prairies, vergers, maraîchage (5 886 km²) | Green on a map, not amenity: private, fenced, no path through it. Counting them would turn the criterion into *how rural is this commune* and let the grande couronne sweep the ranking on arable land alone. Shown in the popup as `pct_agricole`, unscored — Beauce communes read 0.2 % green against 96 % agricole. |
| Jardins de l'habitat (186 km²) | Private. It also tracks detached housing almost exactly, so counting it would only re-score the pavillonnaire. Shown as `pct_jardins_prives`, unscored. |
| Surfaces engazonnées (272 km²) | The largest judgement call here, hence stating it: roadside and housing-estate lawn is visible green, but not somewhere anyone goes. |
| Terrains de sport, tennis, golfs, hippodromes, camping | Ticketed or members-only, and the BPE *sport* criterion already counts the public ones. |
| Cimetières | Genuinely green and genuinely open. Nobody chooses a commune for its cemetery. |
| Eau fermée, cours d'eau | Water is amenity but it is not green space, and *berges* already carries the walkable edge of it. |


**Presence, never right of access.** The MOS maps what the ground is, not who may walk on it.

### Scoring

Each criterion is scaled to 0–100 over the communes currently in scope. The **composite** is then a plain weighted average of those scores, using the slider weights, rebuilt on every slider move. Criteria at weight 0 drop out of the average.

### Scope

A 0–100 score only means something relative to a set of communes, and **which set that is belongs to the user**: all of Île-de-France, the petite couronne (92, 93, 94) or the grande couronne (77, 78, 91, 95), one of the 8 départements, or one of the intercommunalités.

A zone can be reached two ways. The dropdown works if you already know the name, but this is a lot of names to know, so the map is the other route: every commune popup names its couronne, its département and its intercommunalité as buttons, and clicking one compares within it. Once a zone is selected, clicking any *faded* commune moves the zone to the one that click landed in, at the same granularity.
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
    neighbourhood.py      # reach past a commune's border, for sources with coordinates
    logs.py               # setup python logger for etl 
  sources/                # one module per data source, all the same shape (see its __init__.py)
    rent.py  bpe.py  idfm_gares.py  ssmsi.py  airparif.py  mos.py
    ips_schools.py  bruit.py  radiance.py  extinctions.py
  pipeline.py             # orchestration only: ref + every source -> the output files
  isochrone/              # travel-time matrices: own command, own workflow, needs a JDK
    network.py            # the R5 network, and picking the day to travel on
    matrix.py             # one mode -> a 1285x1285 uint8 square
  network/                # the map overlay: no scores, its own contract, no command
    traces.py  arrets.py  # rail line geometry, and every stop in the region
    __init__.py           # write(ref) -> reseau_traces + reseau_arrets, called by pipeline

web/
  index.html  style.css
  app.js                # map, application state, event wiring
  sliders.js            # the criteria list, THE place to extend when a source lands
  scoring.js            # all scoring: per criterion 0-100, and the composite
  scopes.js             # the scope comparison sets
  render.js             # every HTML string (popup, ranking rows, spine bars)
  colors.js             # the single colour scale, shared by map, bars and legend
  network.js            # the transport overlay: mode toggles, layers, zone fading
  isochrone.js          # the travel-time matrices: loading, slicing, the control
  geometry.js           # bounds and centroid, for framing and placing popups
  scripts/sync-data.mjs # copies the GeoJSON into web/public/ before dev/build

data/
  raw/                  # downloaded source files (gitignored, re-fetchable)
  processed/            # communes_scores.geojson — the one file the frontend loads

.github/workflows/
  deploy.yml            # build web/ + deploy to GitHub Pages on push to main
  refresh-data.yml      # monthly re-run of the ETL
  isochrone.yml         # re-run ETL to get GTFS file for isochrone calculation 
```

### Tech stack

**ETL: Python 3.13, managed with [uv](https://docs.astral.sh/uv/).** `polars` for the tabular sources (BPE is a large national CSV, SSMSI a 5.2-million-row Parquet, Bruitparif an xlsx via `fastexcel`), `geopandas` + `shapely` for the spatial work (buffering communes, point-in-polygon counts, geometry simplification), `rasterio` for the one raster source, `requests` for downloads. No database: the pipeline's only output is a static file.

**Frontend: Vite + vanilla JS + [MapLibre GL JS](https://maplibre.org/).** No framework. MapLibre and basemap tiles from OpenFreeMap.

**Hosting: GitHub Pages.** The whole site is static: one HTML page, one JS bundle, one cleaned GeoJSON. There is no server, and adding one would only be justified by live commute queries, neither of which is in scope.

### ETL pipeline

```bash
uv sync
uv run python -m etl.pipeline
```

| Output | Features |
|---|---|
| `data/processed/communes_scores.geojson` | 1 285 communes, 73 properties |
| `data/processed/reseau_traces.geojson` | 1 673 line segments |
| `data/processed/reseau_arrets.geojson` | 19 505 stops |

The first run downloads into `data/raw/`. The two `reseau_*` files are the [transport network overlay](#the-transport-network-overlay); they carry no scores, and `pipeline.main()` builds them after the scores rather than from a command of their own.

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

Every download goes through `cached_download(url, filename)` in `etl/common/cache.py`, which fetches into `data/raw/` once and never again. Delete one file in `data/raw/` to force a re-fetch of just that source.

### Transport network overlay

Five toggles at the bottom left of the map draw the network: **RER, Train, Métro, Tram, Bus**. Line traces in Île-de-France Mobilités' own colours, every stop in the region, and a popup on each stop naming the lines that call there.
**It is an overlay, not a criterion.** Nothing here is scored.

Output: `data/processed/reseau_traces.geojson` and `reseau_arrets.geojson`. Both are fetched by the browser **only when a mode is first switched on**.
Bus traces are not available, since it will not be readable enough and contains a lot of datas.
Bus stops draw from zoom 12 and stop names from zoom 13.5.

### Isochrone (travel time) from a commune : router R5, driven from Python by r5py

Click a commune, press **Temps de trajet depuis ici**, and the whole map recolours by how many minutes it takes to reach every other commune (public transport, bike or on foot), with a slider for the time you are willing to spend. Dark still means better, quicker.
Every travel time is precomputed in CI and shipped as a static file. The result is **a matrix, not isochrone polygons => what makes it affordable.**

The router is [R5](https://github.com/conveyal/r5) via [r5py](https://r5py.readthedocs.io/), run locally over an OpenStreetMap extract and Île-de-France Mobilités' GTFS. 
No routing API is involved, mostly because IDFM's own isochrone endpoint allows 10 requests a month. 

```bash
uv sync --group isochrone
uv run python -m etl.isochrone      # needs a JDK 21; not part of etl.pipeline : example : JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.1.12-hotspot'
```

Its own command and its own workflow (`.github/workflows/isochrone.yml`, monthly), unlike the network overlay which `etl.pipeline` builds: this one needs a JVM and downloads datas. 

| Output | | |
|---|---|---|
| `temps_transit.bin.gz` | 1 285² uint8 minutes, row-major | 0.30 MB |
| `temps_velo.bin.gz` | same | 0.12 MB |
| `temps_marche.bin.gz` | same | 0.05 MB |
| `temps_index.json` | the 1 285 codes **in matrix order**, and the profile below | 16 KB |

The matrix is **not symmetric** :leaving a commune at 08:00 is not the reverse of arriving in it, so the whole square ships. `255` means "not reachable within two hours".
It routes on the **raw GTFS timetable**, with a RAPTOR-family algorithm that walks the feed round by round. 

Measured from the commune's **chef-lieu**, the point AdminExpress publishes for where the town is. R5 then snaps that to the nearest street
IDFM's GTFS covers about 30 days from the moment it is generated and is regenerated three times a day, so a fixed date stops being valid within the month. `etl/isochrone/network.py` picks the **Tuesday inside the feed's validity with the most trips running**, which is what keeps the result out of a school-holiday week.

### Frontend

```bash
cd web
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # -> web/dist, what the GitHub Action deploys
npm run preview  # serve the built site locally
```

`dev` and `build` both run a hook that copies `data/processed/` into `web/public/data/`. Re-run the ETL any time you want fresher data, then restart the dev server.

---

## Side notes

### Licence

Code: **MIT**. Do what you like with it.

Data: the generated `communes_scores.geojson` is a derived database of SSMSI's crime statistics (**ODbL v2**), of Airparif's modelled concentrations (**ODbL**) and of Cerema's national mapping of night lighting practice (**ODbL**). `reseau_arrets.geojson` is derived from IDFM's *Arrêts et lignes associées* (**ODbL**); `reseau_traces.geojson` is Licence Ouverte and carries no share-alike. The `temps_*` matrices are derived from OpenStreetMap and IDFM's GTFS, both **ODbL**. ODbL is share-alike, so those files and anything derived from them must be redistributed under ODbL with attribution to the sources listed above.

### What's next ?

Possible improvments:

1. **Extending beyond Île-de-France** : replacing the IDFM rail source with a national equivalent and/or local equivalent for cities like Lyon, Marseille, Toulouse... The IPS, BPE and the two light sources are already national — Cerema publishes the LuoJia radiance for 80 départements, and the lighting-practice file covers all 22 773 communes as it is.
2. **Dynamic door-to-door commute time** : improving isochrone with and API to have a more precise calculation, about door to door travel and different dates, days, times.
3. Adding **qualitative review** from locals / Fetching some website about quality of life in a commune or district.

### On AI assistance

Parts of this project, code, data exploration and documentation, were written with the help of Claude. The techstack, architecture, design decisions, the source curation and the review are the author's.

### Author
Enora SICRE - https://github.com/enorart
