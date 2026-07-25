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

Outputs `data/processed/communes_scores.geojson` (commune boundaries + population + rent, keyed by `code_insee`). Raw source files are cached under `data/raw/` on first fetch — delete a specific cache file to force a re-fetch of just that source.

Currently wired in: `communes_ref` (reference geometry/population, Paris split into its 20 arrondissements) and `rent`. The other source modules in `etl/sources/` (`bpe.py`, `ssmsi.py`, `corine.py`, `airparif.py`, `ips_schools.py`) are still stubs — see `PROJECT_PLAN.md` section 7 for build order.

## Frontend

```bash
cd web
npm install
npm run dev      # local dev server at http://localhost:5173
npm run build    # outputs to web/dist, deployed by the GitHub Action
```

`npm run dev` and `npm run build` both run a `predev`/`prebuild` hook (`web/scripts/sync-data.mjs`) that copies `data/processed/communes_scores.geojson` into `web/public/data/` so Vite can serve it. Re-run `uv run python -m etl.pipeline` any time you want the map to reflect fresher data, then restart `npm run dev` (or just re-run `npm run build`) to pick it up.

The map currently renders every IDF commune (+ Paris arrondissements) as a clickable choropleth colored by average apartment rent; clicking a commune opens a popup with its INSEE code, population, and rent. Sliders/composite scoring land once the remaining ETL sources are implemented.

## Data sources & licenses

All datasets are French open data, mostly under Licence Ouverte / Etalab 2.0 or ODbL. Full source list and access method: `PROJECT_PLAN.md` section 3. Attribution is surfaced in the site footer (`#attribution` in `web/index.html`) — **TODO: fill in per-source attribution text once real data is wired in.**

## Non-goals (v1)

See `PROJECT_PLAN.md` section 8 — no scraping of sites that disallow it, no live rental listings, no user accounts/backend, no commute-time scoring yet, Île-de-France only.
