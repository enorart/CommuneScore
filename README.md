# Ville Idéale IDF

A public website that helps someone choose **which commune to search for housing in**, across Île-de-France — before using a rental-listing tool (Jinka, SeLoger, etc.). It is not a listing search engine.

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

Outputs `data/processed/communes_scores.geojson`. Each source module in `etl/sources/` is currently a stub — see `PROJECT_PLAN.md` section 7 for build order.

## Frontend

```bash
cd web
npm install
npm run dev      # local dev server
npm run build     # outputs to web/dist, deployed by the GitHub Action
```

## Data sources & licenses

All datasets are French open data, mostly under Licence Ouverte / Etalab 2.0 or ODbL. Full source list and access method: `PROJECT_PLAN.md` section 3. Attribution is surfaced in the site footer (`#attribution` in `web/index.html`) — **TODO: fill in per-source attribution text once real data is wired in.**

## Non-goals (v1)

See `PROJECT_PLAN.md` section 8 — no scraping of sites that disallow it, no live rental listings, no user accounts/backend, no commute-time scoring yet, Île-de-France only.
