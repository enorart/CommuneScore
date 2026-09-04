// Map, application state and event wiring. Scoring lives in scoring.js and
// every HTML string in render.js, so this file only decides what happens when.

import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { NEARBY_RADIUS_KM, initialWeights, renderSliders } from "./sliders.js";
import { REGION_SCOPE_ID, buildScopes, renderScopeSelect, siblingZone } from "./scopes.js";
import { applyScores, compositeScore } from "./scoring.js";
import { fillColorExpression, renderLegend, renderTravelLegend, travelColorExpression } from "./colors.js";
import { formatCount, popupHtml, rankingHtml, stopPopupHtml } from "./render.js";
import {
  STOP_URL,
  TRACE_URL,
  addNetworkLayers,
  applyModes,
  applyScope,
  lineColors,
  renderNetworkToggles,
} from "./network.js";
import {
  DEFAULT_LIMIT,
  INDEX_URL,
  MODES as TRAVEL_MODES,
  UNREACHABLE,
  loadMatrix,
  renderTravelControl,
  rowFor,
} from "./traveltime.js";
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
  'Tracés des lignes : <a href="https://www.data.gouv.fr/datasets/traces-du-reseau-de-transport-ferre-dile-de-france/" target="_blank" rel="noopener">Île-de-France Mobilités 2026</a>',
  'Contours et population : <a href="https://geoservices.ign.fr/adminexpress" target="_blank" rel="noopener">IGN ADMIN EXPRESS COG</a>',
  'Espaces verts : <a href="https://data.iledefrance.fr/explore/dataset/mos-occupation-du-sol-2025-and-2021-en-79-postes-de-la-region-ile-de-france/" target="_blank" rel="noopener">L\'Institut Paris Region — MOS 2025</a>',
  'IPS des établissements : <a href="https://data.education.gouv.fr/explore/dataset/fr-en-ips-ecoles-ap2022/" target="_blank" rel="noopener">Ministère de l\'Éducation nationale 2024-2025</a>',
  'Bruit : <a href="https://www.bruitparif.fr/opendata-air-bruit/" target="_blank" rel="noopener">Cartographie air-bruit établie par Airparif et Bruitparif, 2024</a>',
  'Radiance nocturne : <a href="https://www.data.gouv.fr/datasets/cartographies-departementales-de-la-radiance-nocturne-du-satellite-luojia-2018" target="_blank" rel="noopener">Cerema — LuoJia 1-01, 2018</a>',
  'Éclairage nocturne : <a href="https://www.data.gouv.fr/datasets/cartographie-nationale-des-pratiques-declairage-nocturne" target="_blank" rel="noopener">Cerema, DarkSkyLab et OFB, 2026</a> (ODbL)',
  'Délinquance : <a href="https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales" target="_blank" rel="noopener">SSMSI 2025</a> (ODbL v2)',
  `Qualité de l'air : <a href="https://www.data.gouv.fr/datasets/concentrations-moyennes-annuelles-des-polluants-reglementes-en-ile-de-france" target="_blank" rel="noopener">Airparif 2025</a> (ODbL)`,
  'Arrêts et lignes : <a href="https://www.data.gouv.fr/datasets/arrets-et-lignes-associees" target="_blank" rel="noopener">Île-de-France Mobilités 2026</a> (ODbL)',
  `Temps de trajet : calculés avec <a href="https://r5py.readthedocs.io/" target="_blank" rel="noopener">R5</a> sur <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> et les horaires GTFS d'Île-de-France Mobilités (ODbL)`,
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

  const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "min(720px, 96vw)" });

  // Its own instance, not the commune one: clicking a stop must not evict the
  // score breakdown the user opened it to compare against.
  const stopPopup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "min(320px, 90vw)" });
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

  // The transport overlay: which modes are switched on, and the two files
  // behind them once they have been fetched. Both start empty, and the fetch
  // happens on the first toggle rather than at startup : 5 MB of network has
  // no business delaying the choropleth, which is what the page is for.
  const modes = new Set();
  let lineColor = new Map();
  let networkLoading = null;

  // Travel-time mode. `travel` is null whenever the map is showing scores,
  // which is what every branch below tests. The matrices are 1.6 MB each and
  // are fetched on demand, one per mode, and kept once fetched.
  let travel = null;
  let travelIndex = null;
  const travelMatrices = new Map();
  const travelLoading = new Map();
  let travelMinutes = new Map();

  // What render.js needs to draw the popup and the ranking.
  const view = () => ({ weights, scope, scopeCount: inScope.length, selected, meta, travel, travelMinutes });

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

    // MapLibre appends its close button to the popup content, which is also
    // the scroll container, so it scrolled out of reach as soon as a detail
    // section made the popup taller than the map. Rehomed into the sticky
    // header, it stays put alongside the commune name. Moving the node keeps
    // MapLibre's own click handler on it.
    const closeButton = element.querySelector(".maplibregl-popup-close-button");
    const header = element.querySelector(".commune-popup header");
    if (closeButton && header) header.append(closeButton);

    const travelLink = element.querySelector(".travel-link");
    if (travelLink) travelLink.addEventListener("click", () => enterTravel(travelLink.dataset.code));

    for (const link of element.querySelectorAll(".zone-link:not(.is-active)")) {
      link.addEventListener("click", () => {
        selectScope(scopes.find((candidate) => candidate.id === link.dataset.scope));
      });
    }

    const toggles = [...element.querySelectorAll(".detail-toggle, .criterion-info")];

    for (const toggle of toggles) {
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";

        // One section at a time : with every criterion already listed, two open
        // sections make the popup taller than the map has room for.
        for (const other of toggles) {
          const show = other === toggle && !open;
          other.setAttribute("aria-expanded", String(show));
          for (const row of element.querySelectorAll(`tr[data-group="${other.dataset.group}"]`)) {
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

  // Fetched once, on the first toggle. Guarded by the promise itself, since a
  // second click during a 5 MB download would otherwise add the layers twice.
  async function loadNetwork() {
    if (networkLoading) return networkLoading;

    networkLoading = (async () => {
      const [traces, stops] = await Promise.all(
        [TRACE_URL, STOP_URL].map(async (url) => (await fetch(url)).json())
      );
      lineColor = lineColors(traces);
      addNetworkLayers(map, traces, stops, scope);
    })();

    return networkLoading;
  }

  async function toggleModes() {
    if (modes.size > 0) await loadNetwork();
    applyModes(map, modes);

    // The zone may have moved while the files were in flight, and the layers
    // were built with whatever scope was current when the fetch started.
    applyScope(map, scope);
  }

  function selectStop(props, lngLat) {
    const commune = byCode.get(props.code_insee);
    stopPopup
      .setLngLat(lngLat)
      .setHTML(stopPopupHtml(props, { communeName: commune?.properties.name, colors: lineColor }))
      .addTo(map);

    // Same rehoming the commune popup needs: MapLibre appends its close button
    // to the scroll container, where a long line list scrolls it out of reach.
    const element = stopPopup.getElement();
    const closeButton = element.querySelector(".maplibregl-popup-close-button");
    const header = element.querySelector(".commune-popup header");
    if (closeButton && header) header.append(closeButton);
  }

  // Closing the popup ends the selection: the red outline used to linger over
  // a commune whose panel was no longer on screen.
  popup.on("close", () => {
    if (!selected) return;
    selected = null;
    map.setFilter("communes-selected", ["==", ["get", "code_insee"], ""]);
    renderRanking();
  });

  // An open popup carries the travel state in its own markup -- the reach
  // line, and whether this commune is the origin -- so entering or leaving
  // travel mode has to redraw it.
  function redrawPopup() {
    const feature = selected && byCode.get(selected);
    if (!feature || !popup.isOpen()) return;

    popup.setHTML(popupHtml(feature.properties, view()));
    wirePopup(popup);
  }

  // Fetched on demand: the index once, then one matrix per mode the user
  // actually asks for. Guarded by a stored promise, like loadNetwork().
  async function loadTravel(mode) {
    if (travelMatrices.has(mode)) return;

    // Keyed by mode, not one shared promise: clicking two modes quickly would
    // otherwise let the second overwrite the first and add nothing twice.
    if (!travelLoading.has(mode)) {
      const { url } = TRAVEL_MODES.find((entry) => entry.key === mode);

      travelLoading.set(
        mode,
        (async () => {
          const [index, matrix] = await Promise.all([
            travelIndex ?? fetch(INDEX_URL).then((response) => response.json()),
            loadMatrix(url),
          ]);
          travelIndex = index;

          // A matrix read against the wrong index is wrong silently and
          // everywhere, so the one thing that can catch it is checked here.
          const expected = index.communes.length ** 2;
          if (matrix.length !== expected) {
            throw new Error(`${url}: ${matrix.length} bytes, expected ${expected}`);
          }
          travelMatrices.set(mode, matrix);
        })()
      );
    }

    await travelLoading.get(mode);
  }

  // One pass over the origin's row, so refresh() can stay a lookup per frame.
  function readRow() {
    const codes = travelIndex.communes;
    const origin = codes.indexOf(travel.origin);

    travelMinutes = new Map();
    if (origin < 0) {
      // The matrices are rebuilt on their own schedule, so a commune can exist
      // in the scores and not yet in the index. Empty rather than wrong.
      console.warn(`${travel.origin} is not in ${INDEX_URL}; travel times unavailable`);
      return;
    }

    const row = rowFor(travelMatrices.get(travel.mode), origin, codes.length);
    for (let i = 0; i < codes.length; i += 1) {
      if (row[i] !== UNREACHABLE) travelMinutes.set(codes[i], row[i]);
    }
  }

  function paintTravel() {
    map.setPaintProperty("communes-fill", "fill-color", travelColorExpression(travel.limit));
    renderTravelLegend(document.getElementById("legend"), travel.limit);

    const container = document.getElementById("travel");
    container.hidden = false;
    renderTravelControl(
      container,
      { ...travel, originName: byCode.get(travel.origin)?.properties.name ?? travel.origin },
      { onMode: setTravelMode, onLimit: setTravelLimit, onExit: exitTravel }
    );
    redrawPopup();
    refresh();
  }

  async function enterTravel(code) {
    const mode = travel?.mode ?? TRAVEL_MODES[0].key;
    await loadTravel(mode);

    travel = {
      mode,
      limit: travel?.limit ?? DEFAULT_LIMIT,
      origin: code,
      max: travelIndex.profil.max_min,
    };
    readRow();
    paintTravel();
  }

  async function setTravelMode(mode) {
    await loadTravel(mode);
    travel = { ...travel, mode };
    readRow();
    paintTravel();
  }

  function setTravelLimit(limit) {
    travel = { ...travel, limit };
    map.setPaintProperty("communes-fill", "fill-color", travelColorExpression(limit));
    renderTravelLegend(document.getElementById("legend"), limit);
  }

  function exitTravel() {
    travel = null;
    travelMinutes = new Map();

    map.setPaintProperty("communes-fill", "fill-color", fillColorExpression());
    renderLegend(document.getElementById("legend"));
    document.getElementById("travel").hidden = true;
    redrawPopup();
    refresh();
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
        const code = feature.properties.code_insee;

        // Out-of-scope fading is suppressed in travel mode: "what can I
        // reach" is a region-wide question, and dimming three quarters of the
        // answer would be wrong. Done through feature state rather than by
        // swapping fill-opacity between an expression and a constant --
        // changing a data-driven paint property's *kind* while the GeoJSON
        // source is still creating tiles throws inside MapLibre's paint
        // binder ("this.expression.evaluate is not a function").
        //
        // Feature state merges on write, so both keys coexist and switching
        // back to scores needs no second pass.
        const state = { inScope: travel ? true : scope.matches(feature.properties) };
        if (travel) {
          state.minutes = travelMinutes.get(code) ?? -1;
        } else {
          const score = compositeScore(feature.properties, weights);
          state.composite = score == null ? -1 : score;
        }
        map.setFeatureState({ source: "communes", id: code }, state);
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

    // `inScope` feature state is written by refresh(), which this ends with:
    // travel mode needs it forced true, so it cannot be decided in two places.

    // An open popup is now showing scores from the previous comparison set.
    // Redraw it where the commune survived the change, drop it where it did not.
    // `isOpen` is load-bearing: wirePopup reads getElement(), which is
    // undefined once MapLibre has removed the popup's container, so closing a
    // popup and then changing the zone used to throw.
    const survivor = selected && byCode.get(selected);
    if (survivor && scope.matches(survivor.properties)) {
      if (popup.isOpen()) {
        popup.setHTML(popupHtml(survivor.properties, view()));
        wirePopup(popup);
      }
    } else if (selected) {
      selected = null;
      map.setFilter("communes-selected", ["==", ["get", "code_insee"], ""]);
      popup.remove();
    }

    applyScope(map, scope);
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
  renderNetworkToggles(document.getElementById("network"), modes, toggleModes);
  rescope(scope);

  map.on("click", "reseau-arrets", (event) => {
    // The commune layer is underneath and gets the same click. Stopping it
    // here keeps a stop from also moving the comparison zone, which is what
    // clicking a faded commune does.
    event.preventDefault();
    selectStop(event.features[0].properties, event.lngLat);
  });

  map.on("click", "communes-fill", (event) => {
    if (event.defaultPrevented) return;

    const feature = byCode.get(event.features[0].properties.code_insee);
    if (!feature) return;

    // In travel mode the comparison zone is not what the map is showing, so
    // moving it on a click would be answering a question nobody asked.
    if (travel) {
      select(feature.properties, event.lngLat);
      return;
    }

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
    // The stop layer's own mouseenter would be overwritten by this handler on
    // the very next mousemove, so the stop is asked about here instead.
    if (map.getLayer("reseau-arrets") && map.queryRenderedFeatures(event.point, { layers: ["reseau-arrets"] }).length) {
      map.getCanvas().style.cursor = "pointer";
      return;
    }

    const feature = byCode.get(event.features[0].properties.code_insee);
    const inside = feature && (travel || scope.matches(feature.properties));
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
