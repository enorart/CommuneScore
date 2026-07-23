# Ville Idéale IDF — Project Plan

## 1. Goal

A public website that helps someone choose **which commune to search for housing in**, before using a rental-listing tool (Jinka, SeLoger, etc.). It is NOT a listing search engine.

For each commune in Île-de-France, compute and display:
- Average rent (€/m²)
- Sports & leisure, culture, education, health, amenities, transport-infrastructure scores (from INSEE BPE)
- Security score (SSMSI crime rate per 1,000 inhabitants)
- Environment score (green space % + air quality PM2.5/NO2)
- (Phase 2, not now) commute time to a user-specified destination

Output: an interactive choropleth map of IDF communes, colored by a **composite score**, with **adjustable weight sliders** per criterion, and a ranked sidebar list. All computation of the composite score happens **client-side** in the browser — the backend/ETL only needs to produce one clean static data file.

Scope for v1: **Île-de-France only.** No commute/transport integration yet. No live listing scraping (explicitly out of scope — that's Jinka's job).

---

## 2. Tech Stack

### ETL / data pipeline (Python)
- `pandas` — tabular data wrangling
- `geopandas` + `shapely` — spatial joins (e.g. counting BPE equipment points inside commune polygons), reading commune boundary shapefiles/geojson
- `requests` — API calls to data.gouv.fr, SSMSI, Airparif, IPS écoles APIs
- `pyarrow` — optional, for efficient intermediate Parquet storage of large raw files (BPE is a big national CSV)
- No database required for v1 — the pipeline outputs static GeoJSON. (PostGIS is a later option only if this becomes multi-user with live queries.)

### Frontend (static site, no backend needed for v1)
- **MapLibre GL JS** (open-source, no API key/token needed, vector-tile capable) for the choropleth map — preferred over Leaflet here because it handles styling/re-coloring hundreds of polygons on slider change much more smoothly
- Plain **HTML/CSS/JS** or a lightweight framework (Vue or vanilla JS is enough — no need for React/build complexity for a v1 static data-viz site)
- No charting library needed beyond the map itself; a simple sidebar list is plain HTML

### Hosting
- Static site: **Netlify**, **Vercel**, or **GitHub Pages** (all free tier, all sufficient — this is a static site with one data file, no server logic)
- ETL pipeline: run locally or as a scheduled **GitHub Action** (e.g. monthly/quarterly cron) that regenerates the data file and commits/deploys it — no server needed since sources update at most yearly

### Why no backend/API server for v1
All composite scoring is a weighted sum over already-normalized (0–100) values — cheap to compute in-browser. The ETL's only job is to produce **one clean file**: geometry + raw metrics + normalized per-criterion scores, keyed by `code_insee`. Reintroduce a backend only if/when: live commute queries are added, user accounts/saved searches are added, or national scale makes one static file too large to load comfortably.

---

## 3. Data Sources (v1, Île-de-France)

| Criterion | Source | Access | Notes |
|---|---|---|---|
| Rent (€/m²) | ["Carte des loyers" — data.gouv.fr](https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/) | API | Direct per-commune indicator, already clean |
| Sports & leisure | INSEE BPE, domain "sports-loisirs-culture" | Bulk download only (no API) | Gyms, pools, sports fields |
| Culture | INSEE BPE, same domain | Bulk download | Cinemas, theatres, libraries, museums |
| Education | INSEE BPE, domain "enseignement" | Bulk download | Crèches, collèges, lycées, counts |
| Education (quality) | [IPS géolocalisé écoles/collèges](https://www.data.gouv.fr/datasets/indices-de-position-sociale-geolocalises-des-ecoles-et-colleges-de-france-metropolitaine-et-des-drom-2/) | API (data.gouv.fr tabular API) | Optional enrichment beyond raw counts |
| Health | INSEE BPE, domain "santé-social" | Bulk download | Doctors, pharmacies, hospitals |
| Amenities | INSEE BPE, domain "commerces" | Bulk download | Supermarkets, bakeries, shops |
| Transport infra (presence only, not commute time) | INSEE BPE, domain "transports-déplacements" | Bulk download | Not used for scoring in v1 if commute is deferred — optional |
| Security | [SSMSI communal crime stats](https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales) | API | Rate per 1,000 inhabitants |
| Environment — green space | [CORINE Land Cover](https://www.data.gouv.fr/datasets/corine-land-cover-occupation-des-sols-en-france) | API | % forest/parks/agricultural land per commune (spatial calc needed) |
| Environment — air quality (IDF) | [Airparif NO2/PM2.5/PM10/O3](https://www.data.gouv.fr/datasets/qualite-de-lair-concentration-moyenne-no2-pm2-5-pm10-o3-a-partir-de-2015) | API (Explore API v2, opendata.paris.fr) | Yearly rolling average |
| Reference geometry + population | INSEE commune boundaries + population (COG / IGN) | Bulk download | Needed to join everything + turn BPE counts into per-capita rates |

**Deferred to Phase 2:** commute time (IDFM PRIM Navitia API for IDF, precomputed batch job; national scale later via self-hosted OpenTripPlanner + transport.data.gouv.fr GTFS, or Google Directions API as a paid fallback).

**Explicitly out of scope:** scraping ville-ideale.fr (their robots.txt disallows all non-search-engine bots — see conversation notes; ask permission or use manual collection only if their qualitative scores are ever wanted as a supplement). No live rental-listing integration.

---

## 4. Repository Structure

```
ville-ideale-idf/
├── etl/
│   ├── sources/
│   │   ├── rent.py              # loyers - fetch + parse
│   │   ├── bpe.py               # BPE bulk download - aggregate counts per commune per domain
│   │   ├── ips_schools.py       # IPS écoles/collèges - API pull (optional enrichment)
│   │   ├── ssmsi.py             # sécurité - API pull, compute rate/1000 inhabitants
│   │   ├── corine.py            # % espaces naturels - API/download + spatial calc via geopandas
│   │   └── airparif.py          # PM2.5/NO2 moyennes - API pull
│   ├── common/
│   │   ├── communes_ref.py      # reference table: code_insee, name, geometry, population
│   │   └── normalize.py         # shared min-max / z-score helpers (0-100 scale)
│   └── pipeline.py              # orchestrates all sources -> joins on code_insee -> one output file
│
├── data/
│   ├── raw/                     # gitignored, large, re-downloadable from source
│   └── processed/
│       └── communes_scores.geojson   # FINAL output: geometry + raw values + normalized scores per commune
│
├── web/
│   ├── index.html
│   ├── style.css
│   ├── app.js                   # loads geojson, renders MapLibre choropleth, wires up sliders
│   └── sliders.js               # weight state + client-side recompute of composite score
│
├── .github/workflows/
│   └── refresh-data.yml         # scheduled GitHub Action: re-run etl/pipeline.py, redeploy
│
├── requirements.txt
└── README.md
```

---

## 5. ETL Design Rules

1. **One function per source module**, each returning a DataFrame keyed by `code_insee` with clearly named raw columns (e.g. `bpe.py` → `code_insee, nb_sports, nb_culture, nb_sante, nb_commerces`). This keeps sources swappable/addable (commute time later = just one more module with the same interface).
2. **Reference table first.** Build `communes_ref` (code_insee, name, geometry, population) once from INSEE/IGN boundary + population files — every other source joins onto this.
3. **Counts → rates.** Convert raw BPE equipment counts to per-capita or per-1000-inhabitants rates using the reference population, not raw counts (a commune with 5 gyms means nothing without knowing if it has 3,000 or 50,000 residents).
4. **Keep raw values alongside normalized scores** in the final output — don't discard the actual crime rate / €/m² / equipment count, since showing real numbers in map tooltips matters more than an abstract 0–100 score for a real housing decision.
5. **Normalization:** min-max scale each criterion to 0–100 across all IDF communes (or z-score if you prefer to preserve outlier spread) — done once in the ETL, not in the browser, so the frontend only ever deals with clean numbers.
6. **Spatial joins** (CORINE land cover % per commune, BPE point-in-polygon counts) run once in the ETL via geopandas, output already-aggregated per-commune numbers — the frontend never does GIS math, only rendering.
7. **License/attribution tracking**: record each source's license (Licence Ouverte/Etalab 2.0, ODbL, etc.) in the README and surface an attribution footer on the site — required for public reuse of most of these datasets.

---

## 6. Frontend Requirements

- Choropleth map of IDF communes, color = current composite score
- Sidebar: one slider per criterion (rent, sports/leisure, culture, education, health, amenities, security, environment), live-updating the map color and a ranked list of top communes as sliders move
- Click/hover a commune → popup/tooltip with raw values per criterion (not just the composite score)
- Simple legend explaining the color scale
- Attribution/sources footer (required for open data reuse compliance)
- Mobile-responsive layout (map full-width, sidebar collapsible)

---

## 7. Build Order / Milestones

1. **Reference layer**: commune boundaries + population for IDF, loaded and rendered as a plain map (no colors yet) — validates the geometry pipeline works end-to-end.
2. **Rent layer**: join rent data onto reference, render first real choropleth (single criterion, no compositing yet) — validates the full ETL→GeoJSON→MapLibre pipeline.
3. **BPE layer**: download bulk BPE, aggregate the 5 domains per commune, convert to per-capita rates, join in.
4. **Security + Environment layers**: SSMSI, CORINE, Airparif — join in.
5. **Normalization + composite scoring**: implement 0–100 scaling per criterion in the ETL.
6. **Frontend sliders**: implement client-side weighted recompute + map re-coloring on slider change.
7. **Polish**: tooltips with raw values, ranked sidebar list, legend, attribution footer, mobile layout.
8. **Deploy**: static hosting + GitHub Action for scheduled data refresh.
9. **(Phase 2, later)**: commute-time integration via IDFM PRIM API, precomputed batch job to a fixed destination (or user-selectable destination).

---

## 8. Explicit Non-Goals for v1

- No scraping of ville-ideale.fr or any other site whose terms disallow it
- No live rental listing search/integration (Jinka's job, not this tool's)
- No user accounts, saved searches, or backend database
- No commute-time scoring yet
- No coverage outside Île-de-France yet
