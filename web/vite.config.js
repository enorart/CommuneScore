import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
  },
  // maplibre-gl ships its renderer worker as a separate .mjs entry that
  // Vite's esbuild-based dep pre-bundler doesn't resolve correctly,
  // producing "file does not exist ... maplibre-gl-worker.mjs" and a blank
  // map. Excluding it from pre-bundling makes Vite load it as-is instead.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
