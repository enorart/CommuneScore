import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { initialWeights, renderSliders } from "./sliders.js";

// Île-de-France center, chosen to frame the whole region at this zoom.
const IDF_CENTER = [2.5, 48.7];
const IDF_ZOOM = 8;

const map = new MapLibreMap({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: IDF_CENTER,
  zoom: IDF_ZOOM,
});

map.addControl(new NavigationControl());

const weights = initialWeights();

// TODO: once data/processed/communes_scores.geojson exists, fetch it here,
// add it as a source + choropleth fill layer, wire up renderSliders(...)
// to recompute the composite score and repaint on every change, and
// populate #ranking-list / #legend.
