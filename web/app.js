import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { CRITERIA, initialWeights, renderSliders } from "./sliders.js";

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

const RANKING_LENGTH = 40;

// The one colour scale on the page. The map, the ranking spines and the
// popup bars all read from it, so a shade means the same thing everywhere
// and a single legend explains all three. Sand through to deep marine —
// monotonically darkening, so it survives being read as pure lightness.
const RAMP = [
  [0, [244, 238, 226]],
  [25, [202, 220, 210]],
  [50, [143, 189, 187]],
  [75, [75, 138, 155]],
  [100, [23, 73, 95]],
];

const NO_DATA_COLOR = "#e6e3dd";

function rgb([r, g, b]) {
  return `rgb(${r} ${g} ${b})`;
}

// Linear interpolation through RAMP, matching MapLibre's own `interpolate`
// so JS-rendered bars and GPU-rendered polygons agree exactly.
function rampColor(score) {
  if (score == null) return NO_DATA_COLOR;
  const clamped = Math.max(0, Math.min(100, score));

  for (let i = 1; i < RAMP.length; i += 1) {
    const [stop, color] = RAMP[i];
    if (clamped > stop) continue;

    const [prevStop, prevColor] = RAMP[i - 1];
    const t = stop === prevStop ? 0 : (clamped - prevStop) / (stop - prevStop);
    return rgb(prevColor.map((c, j) => Math.round(c + (color[j] - c) * t)));
  }
  return rgb(RAMP[RAMP.length - 1][1]);
}

const numberFormat = new Intl.NumberFormat("fr-FR");
const scoreFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const rawFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const weights = initialWeights();

// Weighted average of the enabled criteria, on the same 0-100 scale as its
// parts. Criteria set to 0 drop out entirely rather than pulling the result
// toward zero, so muting one is genuinely "don't care", not "score badly".
function compositeScore(props) {
  let weighted = 0;
  let total = 0;

  for (const criterion of CRITERIA) {
    const weight = weights[criterion.key];
    const score = props[criterion.property];
    if (!weight || score == null) continue;
    weighted += weight * score;
    total += weight;
  }

  return total === 0 ? null : weighted / total;
}

function compositeExpression() {
  // -1 marks "no composite yet / every weight at zero", which the paint
  // expression turns into the no-data grey.
  return ["coalesce", ["feature-state", "composite"], -1];
}

function fillColorExpression() {
  const score = compositeExpression();
  const stops = RAMP.flatMap(([stop, color]) => [stop, rgb(color)]);
  return ["case", ["<", score, 0], NO_DATA_COLOR, ["interpolate", ["linear"], score, ...stops]];
}

function formatRaw(criterion, props) {
  const value = props[criterion.raw];
  if (value == null) return "—";
  // Equipment counts are whole things; rent is a price.
  const formatted = Number.isInteger(value) ? numberFormat.format(value) : rawFormat.format(value);
  return `${formatted} ${criterion.unit}`;
}

// The signature element: eight bars, one per criterion, each coloured by the
// page's single scale. Same grammar in the ranking and in the popup, so a
// commune's profile is recognisable at a glance before you read a number.
function spineHtml(props) {
  return CRITERIA.map((criterion) => {
    const score = props[criterion.property] ?? 0;
    const muted = weights[criterion.key] === 0 ? " is-muted" : "";
    return `<i class="spine-bar${muted}" style="height:${Math.max(8, score)}%;background:${rampColor(score)}" title="${criterion.label} : ${scoreFormat.format(score)}"></i>`;
  }).join("");
}

function popupHtml(props) {
  const composite = compositeScore(props);

  const rows = CRITERIA.map((criterion) => {
    const score = props[criterion.property];
    const muted = weights[criterion.key] === 0 ? ' class="is-muted"' : "";
    return `
      <tr${muted}>
        <th>${criterion.label}</th>
        <td class="num">${formatRaw(criterion, props)}</td>
        <td class="bar">
          <span style="width:${score ?? 0}%;background:${rampColor(score)}"></span>
        </td>
        <td class="num score">${score == null ? "—" : scoreFormat.format(score)}</td>
      </tr>`;
  }).join("");

  return `
    <div class="commune-popup">
      <header>
        <h3>${props.name}</h3>
        <p class="popup-meta">
          ${props.code_insee} · ${numberFormat.format(props.population)} hab.
        </p>
      </header>

      <div class="popup-score" style="border-color:${rampColor(composite)}">
        <span class="popup-score-value">${composite == null ? "—" : scoreFormat.format(composite)}</span>
        <span class="popup-score-label">score composite</span>
      </div>

      <table>${rows}</table>

      <p class="popup-footnote">
        Loyer moyen appartement et maison, en €/m². Équipements accessibles dans
        un rayon de 5 km, soit ${numberFormat.format(props.population_5km)} habitants.
        Les scores suivent une échelle logarithmique : passer de 1 à 10 équipements
        pèse plus que de 300 à 3 000.
      </p>
    </div>
  `;
}

function renderLegend(container) {
  const gradient = RAMP.map(([stop, color]) => `${rgb(color)} ${stop}%`).join(", ");
  container.innerHTML = `
    <p class="legend-title">Score composite</p>
    <div class="legend-scale" style="background:linear-gradient(90deg, ${gradient})"></div>
    <div class="legend-ticks"><span>0</span><span>50</span><span>100</span></div>
  `;
}

map_init();

function map_init() {
  const map = new MapLibreMap({
    container: "map",
    // OpenFreeMap: free, no API key, no rate limits, open-source basemap
    // tiles. "positron" is light and muted so the choropleth drawn on top
    // reads clearly instead of competing with a busy street map.
    style: "https://tiles.openfreemap.org/styles/positron",
    center: IDF_CENTER,
    zoom: IDF_ZOOM,
  });

  map.addControl(new NavigationControl(), "top-right");

  map.on("load", async () => {
    const response = await fetch(DATA_URL);
    const communes = await response.json();

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
      paint: { "fill-color": fillColorExpression(), "fill-opacity": 0.78 },
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

    const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "340px" });
    const rankingList = document.getElementById("ranking-list");
    const rankingCount = document.getElementById("ranking-count");

    let selected = null;

    function select(props, lngLat) {
      selected = props.code_insee;
      map.setFilter("communes-selected", ["==", ["get", "code_insee"], selected]);
      popup.setLngLat(lngLat).setHTML(popupHtml(props)).addTo(map);
      renderRanking();
    }

    function renderRanking() {
      const ranked = communes.features
        .map((feature) => ({ props: feature.properties, score: compositeScore(feature.properties) }))
        .filter((entry) => entry.score != null)
        .sort((a, b) => b.score - a.score);

      rankingCount.textContent = `${RANKING_LENGTH} sur ${numberFormat.format(ranked.length)}`;

      rankingList.innerHTML = ranked
        .slice(0, RANKING_LENGTH)
        .map(({ props, score }, index) => {
          const active = props.code_insee === selected ? " is-selected" : "";
          return `
            <li class="rank-row${active}" data-code="${props.code_insee}" tabindex="0">
              <span class="rank-position">${String(index + 1).padStart(2, "0")}</span>
              <span class="rank-name">${props.name}</span>
              <span class="spine">${spineHtml(props)}</span>
              <span class="rank-score" style="color:${rampColor(score)}">${scoreFormat.format(score)}</span>
            </li>`;
        })
        .join("");
    }

    // Repainting 1285 feature states on every `input` event would fire far
    // more often than the compositor can draw, so coalesce to one pass per
    // frame.
    let pending = null;
    function refresh() {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        for (const feature of communes.features) {
          const score = compositeScore(feature.properties);
          map.setFeatureState(
            { source: "communes", id: feature.properties.code_insee },
            { composite: score == null ? -1 : score }
          );
        }
        renderRanking();
      });
    }

    renderSliders(document.getElementById("sliders"), weights, refresh);
    renderLegend(document.getElementById("legend"));
    refresh();

    map.on("click", "communes-fill", (event) => {
      select(event.features[0].properties, event.lngLat);
    });

    map.on("mouseenter", "communes-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "communes-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    function openFromRanking(code) {
      const feature = communes.features.find((f) => f.properties.code_insee === code);
      if (!feature) return;
      const [lng, lat] = centroid(feature.geometry);
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10) });
      select(feature.properties, [lng, lat]);
    }

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
  });
}

// Average of the outer-ring vertices — close enough to place a popup and a
// map centre, and far cheaper than a true centroid on 1285 polygons.
function centroid(geometry) {
  const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  let x = 0;
  let y = 0;
  let n = 0;

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      x += lng;
      y += lat;
      n += 1;
    }
  }
  return [x / n, y / n];
}
