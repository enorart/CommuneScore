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

Île-de-France only for now. 
⚠️ Two sources are region-specific : Île-de-France Mobilités for rail, and Bruitparif for noise. The first has national equivalents to be assembled ; the second does not exist, because France only maps noise around large agglomerations and major infrastructure.

### How to use it

1. **Pick a comparison zone.** Top of the sidebar. All of Île-de-France, the petite or grande couronne, one of the 8 départements, or one of the 63 intercommunalités. This matters more than it looks : see [Scope](#scope-what-a-score-is-relative-to).
2. **Set your priorities.** One slider per criterion, grouped into four foldable families — *Habitat*, *Environnement*, *Famille*, *Loisirs* — each showing how many of its criteria you have weighted. Sliding to **0 removes the criterion entirely** rather than scoring it zero, so "I don't have children and I don't care about schools" is possible: that is why *Famille* starts folded away.
3. **Read the map.** Darker = better fit for *your* weights. The ranking beneath the sliders lists the best communes, each with a small "spine" of bars showing its profile at a glance : a commune strong everywhere and one strong in two things can share the same composite score.
4. **Click a commune.** The popup breaks the score down criterion by criterion, showing the raw value next to each score. Each criterion carries an **ⓘ** explaining what its number measures and where it misleads, and nine of them also expand — via the chevron on the label — into the detail behind the figure: rent's four typologies, the lines reachable, the crime families, the four pollutants, and so on. One panel is open at a time, so the popup never outgrows the map.
5. **Zoom in on a zone.** In the popup, the commune's département and intercommunalité are clickable : comparing 30 neighbouring communes tells you far more than comparing 1 285.

---

## Data sources & licenses

All sources are French open data, published per commune.

| Criterion | Source                                                                                                   | Year | Licence |
|---|----------------------------------------------------------------------------------------------------------|---|---|
| Boundaries, population, intercommunalités | IGN — ADMIN EXPRESS COG, via the Géoplateforme WFS (Web Feature Service, vectorial datas)                | 2025 | Licence Ouverte / Etalab 2.0 |
| Rent (€/m²) | ANIL — Carte des loyers, via data.gouv.fr                                                                | 2025 | Licence Ouverte / Etalab 2.0 |
| Shops, health, schools, childcare, sport, culture | INSEE — Base permanente des équipements (BPE) via data.gouv.fr                                           | 2025 | Licence Ouverte / Etalab 2.0 |
| Social composition of schools (IPS) | Ministère de l'Éducation nationale (DEPP) — Indices de position sociale des écoles, collèges et lycées, via data.education.gouv.fr | 2024-2025 | Licence Ouverte / Etalab 2.0 |
| Rail stations and lines | Île-de-France Mobilités — Gares et stations du réseau ferré via data.gouve.fr                            | 2025 | Licence Ouverte v2.0 (Etalab) |
| Recorded crime | SSMSI — Base statistique communale de la délinquance via data.gouv.fr                                    | 2025 | **ODbL v2** |
| Air quality | Airparif — Concentrations moyennes annuelles modélisées, via its WCS (Web Coverage Service, raster datas | 2025 | **ODbL** |
| Noise | Airparif & Bruitparif — Cartographie air-bruit, via bruitparif.fr                                        | 2024 | Licence Ouverte / Etalab 2.0 |
| Green space | L'Institut Paris Region — Mode d'occupation du sol (MOS), 79 postes, via data.iledefrance.fr             | 2025 | Licence Ouverte / Etalab 2.0 |
| Night sky | Cerema — Cartographie de la radiance nocturne du satellite LuoJia 1-01, via data.gouv.fr                  | 2018 | Licence Ouverte / Etalab 2.0 |
| Public lighting practice | Cerema, DarkSkyLab & OFB — Cartographie nationale des pratiques d'éclairage nocturne, via data.gouv.fr | 2014-2025 | **ODbL** |

Attribution is surfaced in the app behind the map's ℹ️ button, alongside the basemap's own credits (OpenFreeMap / OpenStreetMap).

### How each criterion is computed

The guiding rule everywhere below: **the ETL produces raw values, the browser turns them into scores.** Nothing is pre-scored, for the reason explained under [Scope](#scope-what-a-score-is-relative-to).

#### Facilities : shops, health, schools, childcare, sport, culture

Counted **inside the commune**, then scaled logarithmically: `log1p(count)`, min-max to 0–100. The log is the whole point: going from 1 bakery to 10 changes your daily life; going from 300 to 3 000 does not.

The 7 BPE *domaines* are too coarse to score on directly, so the criteria are cut from its 28 *sous-domaines* instead. Excluded on purpose: domaine A (86 % of it is builders and hairdressers), tourism, outdoor sports sites, universities and adult education, and social services (which are not medical access). Full reasoning at the top of `etl/sources/bpe.py`.

**Sport and Culture name what they count.** A count alone says a commune has X sports equipments and not whether they are gyms or boules pitches, so both criteria expand in the popup into their **five most numerous equipment types**, with a `+ N autres types` line for the rest. *.

> **BPE names types, never facilities.** There is no cinema name, no gym name and no address anywhere in it, in this file or in the geolocated variant: it publishes how many equipments of each a commune has. 

**Enseignement** is the three school-age sous-domaines and no more: C1 *premier degré* (maternelles, primaires, élémentaires), C2 *second degré premier cycle* (collèges) and C3 *second degré second cycle* (lycées général, professionnel and agricole), not post-bac. Everything above the lycée is left out, C4 supérieur non-universitaire, C5 universitaire, C6 formation continue, C7 résidences and restaurants universitaires.

#### Social composition of schools (IPS)

The count above says how many schools a commune has and nothing about them. The **IPS** is the Ministry's index of the socio-professional composition of an establishment's pupils: DEPP scores each PCS and averages it over the pupils. `ips_moyen` is a **flat unweighted mean over every école, collège and lycée in the commune**, scored on a plain min-max like green space — it is an index rather than a count, so saturation has nothing to say about it, and it is near symmetric across the region (74.7 to 154.0, skew 0.01), so there is no tail for a rank to protect the rest of the scale from.

Three datasets, one per level, all pinned to rentrée **2024-2025**. The popup lists each establishment with its own IPS, best first, capped at ten per level — the level's summary line carries the count and the mean over *all* of them, so the cap hides names, never the figure the score is built from.

> **Why not the geolocated file on data.gouv?** [That dataset](https://www.data.gouv.fr/datasets/indices-de-position-sociale-geolocalises-des-ecoles-et-colleges-de-france-metropolitaine-et-des-drom-2) exists to attach coordinates to the UAI, and coordinates would only matter if schools were counted past the commune border, which only transport does here. It is also frozen at 2021-2022 and ODbL, where the Ministry's own three are refreshed yearly under Licence Ouverte and **already carry the code INSEE, Paris split by arrondissement**. For lycées the obvious `fr-en-ips-lycees-ap2022` is frozen at 2022-2023; `donnees-ips-lycees` carries the same figures through 2024-2025.

Note:

- **It is not a measure of quality.** It describes who is in the classroom, not what happens in it — not results, not teaching, not buildings. DEPP says so itself. Read as "whose children go here", which is a real thing to know and a different thing.
- **Where an establishment sits is not where its pupils live**, and less so the older they are: a commune is the authority for its écoles, a collège serves a sector, a lycée recruits across a basin. Pooling the three accepts that.
- **Unweighted by size.** Neither the écoles nor the collèges dataset publishes effectifs, so a 60-pupil école counts the same as a 600-pupil one.
- **It lists fewer establishments than the *Enseignement* count above, and should.** The popup shows both, and Paris 20e reads 114 against 47 + 17 + 6 = 70. The two measure different things. Most of the gap is **maternelles**: BPE counts them (2 772 region-wide, 36 in the 20e) and the IPS structurally cannot, being computed on CM2 pupils. Then BPE counts *sites* where the IPS counts *establishments with a UAI*, and it counts the SEP and SGT sections inside a lycée separately (187 region-wide). Region-wide the reconciliation is 9 217 − 2 772 maternelles − 187 sections = 6 258 comparable, against 5 536 listed; the rest is the 97 `NS` écoles and the private *hors contrat* schools BPE counts but the IPS does not cover.
- **309 of the 1 285 communes have no IPS at all.** An école needs 25 CM2 pupils over five years to be given one, so maternelles have none and the smallest communes have nothing; DEPP publishes the ones below the threshold as `NS`, and 97 Île-de-France écoles read that way. Null in, null out: the criterion drops out of those communes' composite rather than scoring them badly.
- **It is not a second way of saying "expensive".** The correlation with rent is only **+0.32**, which was the number that decided whether this criterion earned its own slider. The Yvelines villages at the top of it (Les Loges-en-Josas 154.0, Châteaufort 152.0) rent for less than half what Paris 6e does at 147.4, and the bottom of it — Grigny 74.7, Villetaneuse 76.4, Garges-lès-Gonesse 77.0 — is not the cheapest part of the region either.

#### Transport

Same log scale, and **the one criterion measured beyond the commune's border** — because it is the one source that publishes coordinates, so "within 1 km" can mean what it says.

It counts **distinct lines reachable, not stations**. Three stops on the same RER get you to the same places; three different lines do not. It measures distance **to the stations themselves** (`neighbourhood.points_within`).

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

Note:

- **Place of commission, not of residence.** A commune with a station, a mall or an office district absorbs offences against people who do not live there, and reads worse than a resident experiences.
- **Statistical secrecy, and it is not rare.** SSMSI withholds any count below 5 faits over 3 successive years, publishing the mean over its département's withheld communes instead. The median Île-de-France commune has **5 of the 9 indicators** filled that way. `nb_indicateurs_estimes` records how many, and the popup says so.
- **Small communes are noisy.** A village of 100 inhabitants swings between the extremes of the scale on a handful of faits. 

#### Air quality

Airparif models Île-de-France as a continuous surface at 6.25 m, so unlike every other source this one knows nothing about communes: `indice_oms` is the **mean of that surface over the commune's own polygon**, and the criterion is its inverted percentile rank, like rent and security.

The index is a **ratio to a health guideline, not a concentration**: the mean of NO₂ / 10 and PM2.5 / 5, the WHO 2021 annual guideline values. So 1 means "at the level the WHO recommends" and Île-de-France runs from 0.98 in the Montois to 2.38 in the 17e. Raw µg/m³ could not be combined at all — 10 of NO₂ and 10 of PM2.5 are not the same news.

Airparif publishes four pollutants and all four are in the popup, but only two are scored. PM10 is the same particles as PM2.5 with a wider cutoff, so scoring both would weight particles twice against NO₂. O₃ is not scored and is **not a concentration**: Airparif publishes ozone as the number of days above 120 µg/m³ over 8 hours.

Note:

- **Area-weighted, not population-weighted.** Nothing publishes population on a grid, so a commune's parkland counts as much as its town centre. Large rural communes are flattered, and a commune with a dense core on the A86 and a forest behind it reads better than its residents experience.
- **One number for a territory the gradient cuts across.** A commune's périphérique edge can read twice its parkland edge. The criterion answers *how polluted is this commune*, not *how polluted is this street*.

#### Noise

`pct_pop_bruit_oms` is the **share of a commune's residents living above the WHO noise recommendation**, road, rail and air traffic pooled, as an Lden annual average. A bounded share, so a plain min-max like green space, **inverted**, quieter scores higher. 

**What Lden is.** *Level day-evening-night*, the indicator European noise mapping has to use under Directive 2002/49/CE. An A-weighted sound level averaged over a year from three periods — in France day 06–18 h, evening 18–22 h, night 22–06 h — with the evening penalised **+5 dB** and the night **+10 dB**:

```
Lden = 10·log₁₀[ (12·10^(Ld/10) + 4·10^((Le+5)/10) + 8·10^((Ln+10)/10)) / 24 ]
```

The penalties are the point: the same physical noise is worse when you are trying to sleep, so **Lden measures annoyance, not sound**. A motorway that runs all night scores far above one with identical daytime traffic that goes quiet. Being logarithmic, +10 dB is ten times the acoustic energy and roughly "twice as loud" — the gap between the two columns below is not the small thing it looks.

**There is no single WHO threshold**, which is why the criterion pools three sources rather than applying one number. WHO *Environmental Noise Guidelines for the European Region* (2018), strong recommendations, against France's own limits from the *arrêté du 4 avril 2006*:

| Source | WHO Lden | WHO Lnight | French limit |
|---|---|---|---|
| Road | **53 dB** | 45 dB | 68 dB |
| Rail | **54 dB** | 44 dB | 73 dB (68 for LGV) |
| Air | **45 dB** | 40 dB | 55 dB |

Two things follow. The French limits are **15–20 dB laxer than WHO**, which is why the regulatory threshold was rejected as the scored figure — half the region reads exactly 0 against it. And **aircraft has by far the strictest guideline, 45 dB**, with the widest footprint: that is the mechanism behind villages under the Roissy approach reading 100 % while central Paris reads 75–93 %.

The thresholds are Bruitparif's to apply, not this project's. The file arrives already classified and the ETL only sums the classes above the recommendation, so `WHO_THRESHOLDS_LDEN` in `etl/sources/bruit.py` is carried into the GeoJSON `metadata` purely so the popup can state it: editing that constant changes what the app *says*, never what it computes.

Bruitparif publishes this crossed with Airparif's air classes, as a 3×3 grid — each axis collapsed to *meets the WHO recommendation* / *above it but within the French regulatory limit* / *above the limit*. Only the noise axis is read. Which axis is which is not stated in the file and was established two ways: every column on the air axis's first level is zero across the whole region, matching Airparif's finding that nowhere in Île-de-France meets the WHO air guideline; and the top of the noise axis is Iverny, Juilly, Cuisy, Mauregard and Le Mesnil-Amelot, villages under the CDG approach with among the *cleanest* air in the region. Only noise orders them that way.

Note:

- **It overlaps with air quality more than any other pair of criteria here**: correlation +0.74 with `indice_oms`, and +0.62 with rent. Both are mostly traffic, so a good part of what this says, the air criterion already said. It stays a separate criterion because the overlap is not total.
- **"Above the WHO recommendation" is easily reached** : 53 dB for road, 54 for rail, 45 for air.
- **The share is of the *modelled* population**, which is whoever lives where a noise map exists. 
- **An annual average, and one number for a whole commune.** The evening and night penalties above are Lden's only concession to *when* the noise happens; beyond them nothing here distinguishes a night flight path from a permanent motorway hum, or a quiet street from the boulevard one block away.

#### Night sky

`radiance_nocturne` is the **light the commune sends upwards**, averaged over its own surface, in nW/cm²/sr. Scored as an **inverted percentile rank**, like rent, security and air: darker scores higher.
The source is the LuoJia 1-01 satellite, that mapped France once, in 2018, at 130 m, finer than the VIIRS composites most light-pollution maps are built on, which matters when the smallest commune here is 9.6 ha and a Paris arrondissement is under 2 km².

The popup also names the commune's lighting policy: states the commune's most recent detected change. It carries no weight in the score.

Note:

- **It is an emission map, not a sky brightness map.** It measures light leaving the ground, not the glow a resident looks up at.
- **2018**: LuoJia 1-01 was a demonstration satellite and the campaign was never repeated.
- **Area-weighted, not population-weighted**: a commune with a lit centre and a dark forest behind it reads better than its residents experience.
- **It overlaps with urbanity**: +0.84 against the transport line count, +0.76 against rent, +0.74 against `indice_oms`, and a Spearman of +0.85 against population. It keeps its own slider because it is not reducible to any one of them.
- **The two light sources are not redundant, but not in the way you would guess.** Communes flagged *extinction en cœur de nuit* have a median radiance of 2.6 and 491 of the 501 are in the grande couronne; *extinction partielle ou rénovation* sits at 38.5 and is the urban practice. The policy column separates communes the brightness figure cannot.
- **Detected from space, not declared.** VIIRS passes around 1h30, so an extinction beginning after that is invisible and the commune reads as changing nothing: suspected changes, not a municipal record.
- **It is a record of change, not of state.** A commune that has always left its lights on and one that has switched them off since before 2014 both read "aucun changement".

#### Green space

`pct_espaces_verts` is the **share of the commune's own surface** under woods, natural land, parks and public gardens. Not a count, not a rate against population; it is scored on a plain min-max: it is already a bounded 0–100 figure.

**6 of the MOS's 79 postes are counted**, split into the two families shown separately in the popup: `pct_foret` (bois ou forêts, espaces ouverts à végétation arbustive ou herbacée, berges) and `pct_parcs` (parcs ou jardins publics, autres espaces verts, jardins familiaux). Left out, each for a reason:

| Excluded | Why |
|---|---|
| Terres labourées, prairies, vergers, maraîchage (5 886 km²) | Green on a map, not amenity: private, fenced, no path through it. Counting them would turn the criterion into *how rural is this commune* and let the grande couronne sweep the ranking on arable land alone. Shown in the popup as `pct_agricole`, unscored — Beauce communes read 0.2 % green against 96 % agricole. |
| Jardins de l'habitat (186 km²) | Private. It also tracks detached housing almost exactly, so counting it would only re-score the pavillonnaire. Shown as `pct_jardins_prives`, unscored. |
| Surfaces engazonnées (272 km²) | The largest judgement call here, hence stating it: roadside and housing-estate lawn is visible green, but not somewhere anyone goes. |
| Terrains de sport, tennis, golfs, hippodromes, camping | Ticketed or members-only, and the BPE *sport* criterion already counts the public ones. |
| Cimetières | Genuinely green and genuinely open. Nobody chooses a commune for its cemetery. |
| Eau fermée, cours d'eau | Water is amenity but it is not green space, and *berges* already carries the walkable edge of it. |

Note:

- **Presence, never right of access.** The MOS maps what the ground is, not who may walk on it.
- **The commune alone**.
- **Where the green sits inside the commune is not measured.** One block of forest at the far edge reads like the same area spread over ten squares.

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
    neighbourhood.py      # reach past a commune's border, for sources with coordinates
    logs.py               # setup python logger for etl 
  sources/                # one module per data source, all the same shape (see its __init__.py)
    rent.py  bpe.py  idfm_gares.py  ssmsi.py  airparif.py  mos.py
    ips_schools.py  bruit.py  radiance.py  extinctions.py
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

**ETL — Python 3.13, managed with [uv](https://docs.astral.sh/uv/).** `polars` for the tabular sources (BPE is a large national CSV, SSMSI a 5.2-million-row Parquet, Bruitparif an xlsx via `fastexcel`), `geopandas` + `shapely` for the spatial work (buffering communes, point-in-polygon counts, geometry simplification), `rasterio` for the one raster source, `requests` for downloads. No database: the pipeline's only output is a static file.

**Frontend — Vite + vanilla JS + [MapLibre GL JS](https://maplibre.org/).** No framework. MapLibre and basemap tiles from OpenFreeMap.

**Hosting — GitHub Pages.** The whole site is static: one HTML page, one JS bundle, one cleaned GeoJSON. There is no server, and adding one would only be justified by live commute queries, neither of which is in scope.

### ETL pipeline

```bash
uv sync
uv run python -m etl.pipeline
```

Output: `data/processed/communes_scores.geojson` — **1 285 features, 73 properties, ~5.1 MB**, committed to the repo so the frontend works without running the ETL. The first run downloads ~277 MB into `data/raw/`.

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

**Adding a criterion** is deliberately cheap: add one entry to `CRITERIA` in `web/sliders.js` (key, family, label, the `score_*` property, the raw column it reads, a unit, a default weight). The map, the sliders, the ranking, the spine bars, the popup and the scope re-scoring all iterate that list and pick it up for free. The only extra step is a `SCORERS` entry in `web/scoring.js`, and only if the default (log min-max, higher is better) is wrong for it — as it is for rent and security, which are both inverted percentile ranks.

Three implementation notes that are load-bearing:

- The map source uses `promoteId: "code_insee"`, so the composite score lives in MapLibre **feature state** and the formula stays in one place (`compositeScore` in `scoring.js`).
- Feature-state updates are **coalesced to one pass per animation frame**. Dragging a slider would otherwise queue 1 285 writes per input event.
- Everything on the page reads from a **single colour scale** (`RAMP` in `colors.js`): the map, the ranking spines and the popup bars all mean the same thing, and one legend explains all three.

---

## Side notes

### Licence

Code: **MIT**. Do what you like with it.

Data: the generated `communes_scores.geojson` is a derived database of SSMSI's crime statistics (**ODbL v2**), of Airparif's modelled concentrations (**ODbL**) and of Cerema's national mapping of night lighting practice (**ODbL**). ODbL is share-alike, so that file and anything derived from it must be redistributed under ODbL with attribution to the sources listed above.

### What's next ?

Possible improvments:

1. **Extending beyond Île-de-France** : replacing the IDFM rail source with a national equivalent and/or local equivalent for cities like Lyon, Marseille, Toulouse... The IPS, BPE and the two light sources are already national — Cerema publishes the LuoJia radiance for 80 départements, and the lighting-practice file covers all 22 773 communes as it is.
2. Dynamic door-to-door commute time from the centroid of a commune to a chosen place. Need dynamic API call and a web server, not a static website anymore.
3. Adding qualitative review from locals / Fetching with authorisation some website about quality of life in a commune or district.

### On AI assistance

Parts of this project, code, data exploration and documentation, were written with the help of Claude. The techstack, architecture, design decisions, the source curation and the review are the author's.

### Author
Enora SICRE - https://github.com/enorart
