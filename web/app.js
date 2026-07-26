// Map, application state and event wiring. Scoring lives in scoring.js and
// every HTML string in render.js, so this file only decides what happens when.

import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { NEARBY_RADIUS_KM, initialWeights, renderSliders } from "./sliders.js";
import { REGION_SCOPE_ID, buildScopes, renderScopeSelect, siblingZone } from "./scopes.js";
import { applyScores, compositeScore } from "./scoring.js";
import { fillColorExpression, renderLegend } from "./colors.js";
import { formatCount, popupHtml, rankingHtml } from "./render.js";
import { bounds, centroid } from "./geometry.js";

// Vite's production bundler (Rolldown) emits maplibre-gl's worker file verbatim
// with a plain `?url` import, dropping its sibling chunk. The worker then fails
// silently on first import and no tiles ever render : blank map, no console
// error. `?worker&url` routes it through Vite's worker pipeline instead.
setWorkerUrl(maplibreWorkerUrl);

// Frames the whole region at this zoom.
const IDF_CENTER = [2.5, 48.7];
const IDF_ZOOM = 8;

const DATA_URL = "./data/communes_scores.geojson";

const RANKING_LENGTH = 40;

const SOURCE_ATTRIBUTION = [
  'Loyers : <a href="https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/" target="_blank" rel="noopener">ANIL 2025</a>',
  'Équipements : <a href="https://www.insee.fr/fr/statistiques/8217527" target="_blank" rel="noopener">INSEE BPE 2025</a>',
  'Réseau ferré : <a href="https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf/" target="_blank" rel="noopener">Île-de-France Mobilités</a>',
  'Contours et population : <a href="https://geoservices.ign.fr/adminexpress" target="_blank" rel="noopener">IGN ADMIN EXPRESS COG</a>',
  // The one source not under Licence Ouverte, so it carries its own licence.
  'Délinquance : <a href="https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales" target="_blank" rel="noopener">SSMSI 2025</a> (ODbL v2)',
  "Licence Ouverte / Etalab 2.0",
];

function createMap() {
  const map = new MapLibreMap({
    container: "map",
    // OpenFreeMap : free, no API key, no rate limits. "positron" is light and
    // muted so the choropleth on top reads clearly.
    style: "https://tiles.openfreemap.org/styles/positron",
    center: IDF_CENTER,
    zoom: IDF_ZOOM,
    attributionControl: { compact: true, customAttribution: SOURCE_ATTRIBUTION },
  });

  map.addControl(new NavigationControl(), "top-right");
  return map;
}

function addCommuneLayers(map, communes) {
  map.addSource("communes", {
    type: "geojson",
    data: communes,
    // Lets setFeatureState address a commune by its INSEE code, so the
    // composite lives in feature state and the formula stays in one place.
    promoteId: "code_insee",
  });

  map.addLayer({
    id: "communes-fill",
    type: "fill",
    source: "communes",
    paint: {
      "fill-color": fillColorExpression(),
      // Out of scope communes stay on the map, greyed out.
      "fill-opacity": ["case", ["boolean", ["feature-state", "inScope"], true], 0.78, 0.5],
    },
  });

  map.addLayer({
    id: "communes-outline",
    type: "line",
    source: "communes",
    paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.7 },
  });

  map.addLayer({
    id: "communes-selected",
    type: "line",
    source: "communes",
    filter: ["==", ["get", "code_insee"], ""],
    paint: { "line-color": "#e5533d", "line-width": 2.5 },
  });
}

// Choices the ETL made, written into the GeoJSON by etl/pipeline.py so the UI
// states them back rather than keeping its own copy.
function readMetadata(communes) {
  const meta = communes.metadata;
  if (!meta) throw new Error("communes_scores.geojson has no metadata: re-run `uv run python -m etl.pipeline`");

  // The radius is baked into the column names CRITERIA reads, so unlike the
  // rest it cannot simply be taken at runtime. Say so instead of drifting.
  if (meta.neighbourhood_radius_km !== NEARBY_RADIUS_KM) {
    console.warn(
      `ETL neighbourhood radius is ${meta.neighbourhood_radius_km} km but sliders.js expects ${NEARBY_RADIUS_KM} km`
    );
  }
  return meta;
}

function start(map, communes) {
  const meta = readMetadata(communes);
  const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "340px" });
  const rankingList = document.getElementById("ranking-list");
  const rankingCount = document.getElementById("ranking-count");

  // MapLibre hands click events its own copy of the properties, taken when the
  // source was added, so it never sees the scores applyScores() writes.
  // Everything downstream of a click reads from here instead.
  const byCode = new Map(communes.features.map((f) => [f.properties.code_insee, f]));

  const scopes = buildScopes(communes.features);
  const weights = initialWeights();

  let scope = scopes[0];
  let inScope = communes.features;
  let selected = null;

  // What render.js needs to draw the popup and the ranking.
  const view = () => ({ weights, scope, scopeCount: inScope.length, selected, meta });

  function select(props, lngLat) {
    selected = props.code_insee;
    map.setFilter("communes-selected", ["==", ["get", "code_insee"], selected]);
    popup.setLngLat(lngLat).setHTML(popupHtml(props, view())).addTo(map);
    wirePopup(popup);
    renderRanking();
  }

  // setHTML replaces the popup's contents wholesale, so listeners have to be
  // reattached every time rather than bound once.
  function wirePopup(instance) {
    const element = instance.getElement();

    for (const link of element.querySelectorAll(".zone-link:not(.is-active)")) {
      link.addEventListener("click", () => {
        selectScope(scopes.find((candidate) => candidate.id === link.dataset.scope));
      });
    }

    const toggles = [...element.querySelectorAll(".detail-toggle")];

    for (const toggle of toggles) {
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";

        // One section at a time : with every criterion already listed, two open
        // sections make the popup taller than the map has room for.
        for (const other of toggles) {
          const show = other === toggle && !open;
          other.setAttribute("aria-expanded", String(show));
          for (const row of element.querySelectorAll(`.row-detail[data-group="${other.dataset.group}"]`)) {
            row.hidden = !show;
          }
        }

        // MapLibre picks which side of the point to hang the popup from when it
        // opens and never re-picks, so a grown popup runs off the top of the
        // map. Re-setting the location forces the anchor to be recomputed.
        instance.setLngLat(instance.getLngLat());
      });
    }
  }

  function renderRanking() {
    const ranked = inScope
      .map((feature) => ({ props: feature.properties, score: compositeScore(feature.properties, weights) }))
      .filter((entry) => entry.score != null)
      .sort((a, b) => b.score - a.score);

    const shown = Math.min(RANKING_LENGTH, ranked.length);
    rankingCount.textContent = `${shown} sur ${formatCount(ranked.length)}`;
    rankingList.innerHTML = rankingHtml(ranked.slice(0, RANKING_LENGTH), view());
  }

  // Repainting 1285 feature states on every `input` event would fire far more
  // often than the compositor can draw, so coalesce to one pass per frame.
  let pending = null;
  function refresh() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      for (const feature of communes.features) {
        const score = compositeScore(feature.properties, weights);
        map.setFeatureState(
          { source: "communes", id: feature.properties.code_insee },
          { composite: score == null ? -1 : score }
        );
      }
      renderRanking();
    });
  }

  // Rescoring touches every criterion on every commune, so it runs on a scope
  // change only, not on every slider move (which merely reweights scores that
  // are already there).
  function rescope(next) {
    scope = next;
    inScope = communes.features.filter((feature) => scope.matches(feature.properties));

    applyScores(communes.features, inScope);

    for (const feature of communes.features) {
      map.setFeatureState(
        { source: "communes", id: feature.properties.code_insee },
        { inScope: scope.matches(feature.properties) }
      );
    }

    // An open popup is now showing scores from the previous comparison set.
    // Redraw it where the commune survived the change, drop it where it did not.
    const survivor = selected && byCode.get(selected);
    if (survivor && scope.matches(survivor.properties)) {
      popup.setHTML(popupHtml(survivor.properties, view()));
      wirePopup(popup);
    } else if (selected) {
      selected = null;
      map.setFilter("communes-selected", ["==", ["get", "code_insee"], ""]);
      popup.remove();
    }

    refresh();
  }

  // The one way in : the picker, the popup's zone links and clicking a faded
  // commune all land here, so the select stays in step with the map.
  function selectScope(next) {
    rescope(next);
    scopeSelect.value = next.id;

    if (next.id === REGION_SCOPE_ID) map.easeTo({ center: IDF_CENTER, zoom: IDF_ZOOM });
    else map.fitBounds(bounds(inScope), { padding: 40 });
  }

  function openFromRanking(code) {
    const feature = byCode.get(code);
    if (!feature) return;
    const [lng, lat] = centroid(feature.geometry);
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10) });
    select(feature.properties, [lng, lat]);
  }

  const scopeSelect = renderScopeSelect(document.getElementById("scope"), scopes, selectScope);
  renderSliders(document.getElementById("sliders"), weights, refresh);
  renderLegend(document.getElementById("legend"));
  rescope(scope);

  map.on("click", "communes-fill", (event) => {
    const feature = byCode.get(event.features[0].properties.code_insee);
    if (!feature) return;

    // Clicking outside the comparison set moves it rather than opening a popup
    // full of blanks : the zone jumps to the one the click landed in, at the
    // granularity already in use. That makes the map a way of walking from one
    // intercommunalité to the next.
    if (scope.matches(feature.properties)) {
      select(feature.properties, event.lngLat);
      return;
    }

    const zone = siblingZone(scope, feature.properties);
    if (zone) selectScope(scopes.find((candidate) => candidate.id === zone.id));
  });

  // mousemove rather than mouseenter : the cursor has to answer "what does
  // clicking *this* commune do", and moving between two communes never re-fires
  // mouseenter.
  map.on("mousemove", "communes-fill", (event) => {
    const feature = byCode.get(event.features[0].properties.code_insee);
    const inside = feature && scope.matches(feature.properties);
    map.getCanvas().style.cursor = feature && (inside || siblingZone(scope, feature.properties)) ? "pointer" : "";
  });

  map.on("mouseleave", "communes-fill", () => {
    map.getCanvas().style.cursor = "";
  });

  rankingList.addEventListener("click", (event) => {
    const row = event.target.closest(".rank-row");
    if (row) openFromRanking(row.dataset.code);
  });

  rankingList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".rank-row");
    if (!row) return;
    event.preventDefault();
    openFromRanking(row.dataset.code);
  });
}

const map = createMap();

map.on("load", async () => {
  const communes = await (await fetch(DATA_URL)).json();
  addCommuneLayers(map, communes);
  start(map, communes);
});
