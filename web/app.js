import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { initialWeights } from "./sliders.js";

// Vite's production bundler (Rolldown) emits maplibre-gl's worker file
// verbatim with a plain `?url` import, dropping its sibling chunk — the
// worker then fails silently on first import and no tiles ever render
// (blank map, no console error). `?worker&url` routes it through Vite's
// worker pipeline instead, producing a self-contained chunk. Needed for
// production builds only, but harmless in dev too.
setWorkerUrl(maplibreWorkerUrl);

// Île-de-France center, chosen to frame the whole region at this zoom.
const IDF_CENTER = [2.5, 48.7];
const IDF_ZOOM = 8;

const DATA_URL = "./data/communes_scores.geojson";

const map = new MapLibreMap({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: IDF_CENTER,
  zoom: IDF_ZOOM,
});

map.addControl(new NavigationControl());

const weights = initialWeights();

const numberFormat = new Intl.NumberFormat("fr-FR");
const rentFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function popupHtml(props) {
  const rent =
    props.loyer_m2_appartement != null
      ? `${rentFormat.format(props.loyer_m2_appartement)} €/m²`
      : "n/a";
  return `
    <div class="commune-popup">
      <h3>${props.name}</h3>
      <table>
        <tr><th>Code INSEE</th><td>${props.code_insee}</td></tr>
        <tr><th>Population</th><td>${numberFormat.format(props.population)}</td></tr>
        <tr><th>Loyer moyen (appt.)</th><td>${rent}</td></tr>
      </table>
    </div>
  `;
}

map.on("load", async () => {
  const response = await fetch(DATA_URL);
  const communesGeojson = await response.json();

  map.addSource("communes", {
    type: "geojson",
    data: communesGeojson,
  });

  map.addLayer({
    id: "communes-fill",
    type: "fill",
    source: "communes",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "loyer_m2_appartement"], 0],
        15,
        "#ffffb2",
        25,
        "#fd8d3c",
        40,
        "#bd0026",
      ],
      "fill-opacity": 0.6,
    },
  });

  map.addLayer({
    id: "communes-outline",
    type: "line",
    source: "communes",
    paint: {
      "line-color": "#555",
      "line-width": 0.5,
    },
  });

  const popup = new Popup({ closeButton: true, closeOnClick: true });

  map.on("click", "communes-fill", (event) => {
    const feature = event.features[0];
    popup.setLngLat(event.lngLat).setHTML(popupHtml(feature.properties)).addTo(map);
  });

  map.on("mouseenter", "communes-fill", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "communes-fill", () => {
    map.getCanvas().style.cursor = "";
  });
});

// TODO: wire up renderSliders(weights) to recompute the composite score
// and repaint communes-fill on every change, and populate #ranking-list.
