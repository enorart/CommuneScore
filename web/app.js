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

// OpenFreeMap: free, no API key, no rate limits, open-source basemap tiles.
// "positron" is a light/muted style so the rent choropleth (drawn on top,
// at 50% opacity) reads clearly instead of competing with a busy street map.
const map = new MapLibreMap({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: IDF_CENTER,
  zoom: IDF_ZOOM,
});

map.addControl(new NavigationControl());

const weights = initialWeights();

const numberFormat = new Intl.NumberFormat("fr-FR");
const rentFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// The four rent typology indicators produced by etl/sources/rent.py. The map
// colors by the average of whichever subset is enabled via the sidebar
// checkboxes (all four by default), so a user can e.g. isolate T1-T2 only.
const RENT_METRICS = [
  { key: "loyer_m2_appartement", label: "Appartement (général)" },
  { key: "loyer_m2_t1_t2", label: "T1-T2" },
  { key: "loyer_m2_t3_plus", label: "T3 et plus" },
  { key: "loyer_m2_maison", label: "Maison" },
];

// MapLibre expression: average of the given property keys, treating a
// missing value as 0 (matches previous single-metric behavior).
function averageExpression(keys) {
  const terms = keys.map((key) => ["coalesce", ["get", key], 0]);
  return ["/", ["+", ...terms], keys.length];
}

function rentFillColorExpression(keys) {
  return [
    "interpolate",
    ["linear"],
    averageExpression(keys),
    15,
    "#ffffb2",
    25,
    "#fd8d3c",
    40,
    "#bd0026",
  ];
}

// Plain-JS equivalent of averageExpression, for the popup (skips nulls
// rather than treating them as 0, since a popup showing "n/a" per-row
// already communicates missing data — no need to drag the average down).
function averageValue(props, keys) {
  const values = keys.map((key) => props[key]).filter((v) => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatRent(value) {
  return value != null ? `${rentFormat.format(value)} €/m²` : "n/a";
}

function popupHtml(props, selectedKeys) {
  const rows = RENT_METRICS.map(
    (metric) => `<tr><th>${metric.label}</th><td>${formatRent(props[metric.key])}</td></tr>`
  ).join("");
  return `
    <div class="commune-popup">
      <h3>${props.name}</h3>
      <table>
        <tr><th>Code INSEE</th><td>${props.code_insee}</td></tr>
        <tr><th>Population</th><td>${numberFormat.format(props.population)}</td></tr>
        <tr class="popup-highlight"><th>Loyer moyen (sélection)</th><td>${formatRent(averageValue(props, selectedKeys))}</td></tr>
        ${rows}
      </table>
    </div>
  `;
}

// Renders one checkbox per rent metric into `container`. `selected` is a
// mutable Set the caller owns; at least one metric must stay checked, so
// unchecking the last remaining one is rejected. Calls onChange(selected)
// after every valid toggle.
function renderRentMetricToggles(container, selected, onChange) {
  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = "Loyer (€/m²)";
  container.appendChild(heading);

  const list = document.createElement("div");
  list.className = "metric-toggles";

  for (const metric of RENT_METRICS) {
    const label = document.createElement("label");
    label.className = "metric-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(metric.key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selected.add(metric.key);
      } else if (selected.size > 1) {
        selected.delete(metric.key);
      } else {
        checkbox.checked = true; // keep at least one metric selected
        return;
      }
      onChange(selected);
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(metric.label));
    list.appendChild(label);
  }

  container.appendChild(list);
}

map.on("load", async () => {
  const response = await fetch(DATA_URL);
  const communesGeojson = await response.json();

  map.addSource("communes", {
    type: "geojson",
    data: communesGeojson,
  });

  const selectedRentMetrics = new Set(RENT_METRICS.map((metric) => metric.key));

  map.addLayer({
    id: "communes-fill",
    type: "fill",
    source: "communes",
    paint: {
      "fill-color": rentFillColorExpression([...selectedRentMetrics]),
      "fill-opacity": 0.5,
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

  renderRentMetricToggles(document.getElementById("rent-metrics"), selectedRentMetrics, (selected) => {
    map.setPaintProperty("communes-fill", "fill-color", rentFillColorExpression([...selected]));
  });

  const popup = new Popup({ closeButton: true, closeOnClick: true });

  map.on("click", "communes-fill", (event) => {
    const feature = event.features[0];
    popup
      .setLngLat(event.lngLat)
      .setHTML(popupHtml(feature.properties, [...selectedRentMetrics]))
      .addTo(map);
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
