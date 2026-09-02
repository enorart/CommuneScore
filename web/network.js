// The transport network drawn over the choropleth: line traces for the rail
// modes, and every stop in the region, bus included.
//
// This is a basemap overlay, not a criterion. Nothing here feeds a score : the
// transport slider reads nb_lignes_1km out of communes_scores.geojson and
// knows nothing about these two files. They are fetched only when the user
// switches a mode on, because 5 MB has no business on the critical path of a
// map whose point is the colour of the communes.
//
// Built by `uv run python -m etl.network` (etl/network/), which is a separate
// entry point from the pipeline for the same reason.

import { REGION_SCOPE_ID } from "./scopes.js";

export const TRACE_URL = "./data/reseau_traces.geojson";
export const STOP_URL = "./data/reseau_arrets.geojson";

// The five modes the ETL groups IDFM's nine into, in the order a rider ranks
// them for getting out of their commune. `color` tints the toggle and the
// popup's line pills; the traces themselves carry IDFM's own per-line colour.
export const MODES = [
  { key: "rer", label: "RER", color: "#e3051c" },
  { key: "train", label: "Train", color: "#5e6e84" },
  { key: "metro", label: "Métro", color: "#0064b0" },
  { key: "tram", label: "Tram", color: "#83c491" },
  { key: "bus", label: "Bus", color: "#a0006e" },
];

const TRACE_LAYER = "reseau-traces";
const STOP_LAYER = "reseau-arrets";
const LABEL_LAYER = "reseau-noms";

export const NETWORK_LAYERS = [TRACE_LAYER, STOP_LAYER, LABEL_LAYER];

// Bus is 18 870 of the 19 505 stops. Drawn at region zoom they are a grey wash
// over the whole map that tells nobody anything, so they wait until the map is
// close enough for one dot to mean one street corner.
const BUS_STOP_MINZOOM = 12;

// Faded rather than hidden, matching what communes-fill already does with a
// commune outside the comparison set : a métro line that stopped dead at the
// zone boundary would read as a network that ends there.
const OUT_OF_SCOPE_OPACITY = 0.18;

/**
 * A MapLibre boolean expression for "this feature is inside `scope`".
 *
 * Mirrors scope.matches() in scopes.js and has to be kept in step with it.
 * The ETL tags every feature with the département and intercommunalité it
 * belongs to for exactly this reason: those are the two fields a scope is
 * defined over, so the test is one comparison per feature. Tagging with
 * commune codes instead would mean testing against a list of up to 1285 of
 * them, on 19505 points, on every frame.
 *
 * Stops carry scalars (`dep`, `epci`); a trace segment crosses several zones
 * and carries arrays (`deps`, `epcis`), hence the two shapes.
 */
export function scopeFilter(scope, { arrays }) {
  if (scope.id === REGION_SCOPE_ID) return true;

  const has = (field, wanted) =>
    arrays ? ["in", wanted, ["get", `${field}s`]] : ["==", ["get", field], wanted];

  const [kind, value] = scope.id.split(":");
  if (kind === "dep") return has("dep", value);
  if (kind === "epci") return has("epci", value);

  // A couronne is a handful of départements, which scopes.js names on the scope.
  return ["any", ...(scope.departments ?? []).map((code) => has("dep", code))];
}

function opacity(scope, arrays) {
  return ["case", scopeFilter(scope, { arrays }), 1, OUT_OF_SCOPE_OPACITY];
}

// `modes` is an array on a stop (39 places serve more than one) and `mode` a
// scalar on a trace segment.
function modeFilter(active, { arrays }) {
  return [
    "any",
    ...[...active].map((key) =>
      arrays ? ["in", key, ["get", "modes"]] : ["==", ["get", "mode"], key]
    ),
  ];
}

export function addNetworkLayers(map, traces, stops, scope) {
  map.addSource(TRACE_LAYER, { type: "geojson", data: traces, promoteId: "id" });
  map.addSource(STOP_LAYER, { type: "geojson", data: stops, promoteId: "id" });

  // Under communes-selected, so the red outline of the chosen commune still
  // reads through the network drawn across it.
  map.addLayer(
    {
      id: TRACE_LAYER,
      type: "line",
      source: TRACE_LAYER,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "couleur"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 14, 4],
        "line-opacity": opacity(scope, true),
      },
    },
    "communes-selected"
  );

  map.addLayer({
    id: STOP_LAYER,
    type: "circle",
    source: STOP_LAYER,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 5],
      "circle-color": "#ffffff",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 1.6],
      "circle-stroke-color": "#14171c",
      "circle-opacity": opacity(scope, false),
      "circle-stroke-opacity": opacity(scope, false),
    },
  });

  map.addLayer({
    id: LABEL_LAYER,
    type: "symbol",
    source: STOP_LAYER,
    minzoom: 13.5,
    layout: {
      "text-field": ["get", "nom"],
      "text-size": 11,
      "text-offset": [0, 0.9],
      "text-anchor": "top",
      "text-max-width": 9,
    },
    paint: {
      "text-color": "#14171c",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.4,
      "text-opacity": opacity(scope, false),
    },
  });
}

/** Redraw the overlay for the modes currently switched on. */
export function applyModes(map, active) {
  if (!map.getLayer(TRACE_LAYER)) return;

  const visible = active.size > 0 ? "visible" : "none";
  for (const layer of NETWORK_LAYERS) map.setLayoutProperty(layer, "visibility", visible);
  if (active.size === 0) return;

  map.setFilter(TRACE_LAYER, modeFilter(active, { arrays: false }));

  // Bus stops alone wait for the zoom. With bus on beside a rail mode the
  // layer has to draw anyway, so the zoom floor moves onto the bus term.
  const stops = [...active].map((key) => {
    const term = ["in", key, ["get", "modes"]];
    return key === "bus" ? ["all", [">=", ["zoom"], BUS_STOP_MINZOOM], term] : term;
  });
  map.setFilter(STOP_LAYER, ["any", ...stops]);
  map.setFilter(LABEL_LAYER, ["any", ...stops]);
}

/** Re-fade the overlay after the comparison zone changed. */
export function applyScope(map, scope) {
  if (!map.getLayer(TRACE_LAYER)) return;

  map.setPaintProperty(TRACE_LAYER, "line-opacity", opacity(scope, true));
  for (const property of ["circle-opacity", "circle-stroke-opacity"]) {
    map.setPaintProperty(STOP_LAYER, property, opacity(scope, false));
  }
  map.setPaintProperty(LABEL_LAYER, "text-opacity", opacity(scope, false));
}

/**
 * IDFM's own colour per line, keyed "mode:shortName" to match what a stop
 * carries, read out of the traces file rather than duplicated here.
 *
 * The two datasets name a line differently : a trace says "METRO 4" where a
 * stop says "metro:4", so the family word is dropped and the rest kept. Bus
 * lines have no trace and fall back to the mode colour above.
 */
export function lineColors(traces) {
  const colors = new Map();
  for (const { properties } of traces.features) {
    const short = properties.ligne.split(" ").slice(1).join(" ");
    if (short) colors.set(`${properties.mode}:${short}`, properties.couleur);
  }
  return colors;
}

export function renderNetworkToggles(container, active, onToggle) {
  container.innerHTML = `
    <p class="legend-title">Réseau</p>
    <div class="network-modes">
      ${MODES.map(
        ({ key, label, color }) =>
          `<button type="button" class="network-toggle" data-mode="${key}"
                   aria-pressed="${active.has(key)}" style="--mode-color:${color}">${label}</button>`
      ).join("")}
    </div>
  `;

  container.addEventListener("click", (event) => {
    const button = event.target.closest(".network-toggle");
    if (!button) return;

    const { mode } = button.dataset;
    if (active.has(mode)) active.delete(mode);
    else active.add(mode);

    button.setAttribute("aria-pressed", String(active.has(mode)));
    onToggle();
  });
}
