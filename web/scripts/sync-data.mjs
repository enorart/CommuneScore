// Copies the ETL's output into web/public so Vite serves it.
// data/processed/ is the single source of truth (committed by
// .github/workflows/refresh-data.yml); this script just mirrors it into the
// frontend's static assets before dev/build.
//
// communes_scores.geojson and the two reseau_* files come from
// `python -m etl.pipeline`; the temps_* files from `python -m etl.isochrone`,
// which runs on its own schedule (see .github/workflows/isochrone.yml).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILES = [
  "communes_scores.geojson",
  "reseau_traces.geojson",
  "reseau_arrets.geojson",
  "temps_index.json",
  "temps_transit.bin.gz",
  "temps_velo.bin.gz",
  "temps_marche.bin.gz",
];

const srcDir = join(__dirname, "..", "..", "data", "processed");
const destDir = join(__dirname, "..", "public", "data");

mkdirSync(destDir, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(srcDir, file), join(destDir, file));
  console.log(`Synced ${file} -> ${destDir}`);
}