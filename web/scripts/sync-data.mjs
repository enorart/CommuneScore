// Copies the ETL pipeline's output into web/public so Vite serves it.
// data/processed/communes_scores.geojson is the single source of truth
// (committed by .github/workflows/refresh-data.yml); this script just
// mirrors it into the frontend's static assets before dev/build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "..", "data", "processed", "communes_scores.geojson");
const destDir = join(__dirname, "..", "public", "data");
const dest = join(destDir, "communes_scores.geojson");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Synced ${src} -> ${dest}`);