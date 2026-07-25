import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    // MapLibre GL JS (WebGL renderer + vector tile parser) is inherently
    // ~250KB gzipped and loads eagerly since the map is the app's core UI —
    // nothing to code-split here, so raise the limit past Vite's 500KB
    // default instead of chasing a warning with no real fix.
    chunkSizeWarningLimit: 1000,
  },
  // maplibre-gl ships its renderer worker as a separate .mjs entry that
  // Vite's esbuild-based dep pre-bundler doesn't resolve correctly,
  // producing "file does not exist ... maplibre-gl-worker.mjs" and a blank
  // map. Excluding it from pre-bundling makes Vite load it as-is instead.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
