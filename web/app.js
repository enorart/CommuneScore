import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { CRITERIA, NEARBY_RADIUS_KM, initialWeights, renderSliders } from "./sliders.js";
import { buildScopes, renderScopeSelect, siblingZone, zonesOf } from "./scopes.js";
import { applyScores } from "./scoring.js";

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

// Source credits live in MapLibre's attribution control
const SOURCE_ATTRIBUTION = [
  'Loyers : <a href="https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/" target="_blank" rel="noopener">ANIL 2025</a>',
  'Équipements : <a href="https://www.insee.fr/fr/statistiques/8217527" target="_blank" rel="noopener">INSEE BPE 2025</a>',
  'Réseau ferré : <a href="https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf/" target="_blank" rel="noopener">Île-de-France Mobilités</a>',
  'Contours et population : <a href="https://geoservices.ign.fr/adminexpress" target="_blank" rel="noopener">IGN ADMIN EXPRESS COG</a>',
  "Licence Ouverte / Etalab 2.0",
];

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

// The comparison set the scores are measured against. Replaced wholesale by
// the scope picker; scoring.js rewrites every score_* when it changes.
let scope = null;
let scopeCount = 0;

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

// ANIL publishes four rent indicators. Only appartement and maison feed the
// score (t1_t2 and t3_plus are subsets of appartement — see RENT_COLUMNS in
// etl/pipeline.py), but all four are worth seeing: which one matters depends
// entirely on what you are looking for.
const RENT_TYPOLOGIES = [
  { key: "loyer_m2_appartement", label: "Appartement", scored: true },
  { key: "loyer_m2_t1_t2", label: "T1–T2" },
  { key: "loyer_m2_t3_plus", label: "T3 et plus" },
  { key: "loyer_m2_maison", label: "Maison", scored: true },
];

// Criteria whose single number hides something worth naming. `scored` marks
// the part the score is actually built from; `wrap` is for values too long
// to sit in a right-aligned column.
const DETAILS = {
  loyer: (props) =>
    RENT_TYPOLOGIES.map(({ key, label, scored }) => ({
      label,
      scored,
      value: props[key] == null ? "—" : `${rawFormat.format(props[key])} €/m²`,
    })),

  transport: (props) => [
    { label: "Gares dans la commune", value: shorten(props.gares), wrap: true },
    {
      label: `Lignes à ${NEARBY_RADIUS_KM} km`,
      value: props[`lignes_${NEARBY_RADIUS_KM}km`] || "aucune",
      wrap: true,
      scored: true,
    },
  ],
};

// Most communes have nought to three stations, but a Paris arrondissement
// has twenty-odd — enough to bury the rest of the popup. The line list below
// is left whole: that one is the answer to "where can I get to from here".
const MAX_LISTED = 6;

function shorten(list) {
  if (!list) return "aucune";

  const items = list.split(", ");
  if (items.length <= MAX_LISTED) return list;
  return `${items.slice(0, MAX_LISTED).join(", ")} + ${items.length - MAX_LISTED} autres`;
}

function detailRows(key, props) {
  const build = DETAILS[key];
  if (!build) return "";

  return build(props)
    .map(({ label, value, scored, wrap }) => {
      const classes = `row-detail${scored ? " is-scored" : ""}`;
      return wrap
        ? `<tr class="${classes}" data-group="${key}" hidden>
             <td colspan="4"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></td>
           </tr>`
        : `<tr class="${classes}" data-group="${key}" hidden>
             <th>${label}</th><td class="num" colspan="3">${value}</td>
           </tr>`;
    })
    .join("");
}

// Where the commune sits, and — since the scope picker speaks the same ids —
// a way to compare it against either zone. Reaching an intercommunalité by
// clicking a commune inside it beats finding its name among 63 in a list.
function zoneLinks(props) {
  return zonesOf(props)
    .map(({ id, label }) => {
      const active = id === scope.id ? " is-active" : "";
      const title = active ? "Sélection actuelle" : `Comparer dans ${label}`;
      return `<button type="button" class="zone-link${active}" data-scope="${id}" title="${title}">${label}</button>`;
    })
    .join("");
}

function popupHtml(props) {
  const composite = compositeScore(props);

  const rows = CRITERIA.map((criterion) => {
    const score = props[criterion.property];
    const muted = weights[criterion.key] === 0 ? " is-muted" : "";

    // Rows with a DETAILS entry get a toggle; the rest are a single number
    // and have nothing to expand.
    const label = DETAILS[criterion.key]
      ? `<button type="button" class="detail-toggle" data-group="${criterion.key}" aria-expanded="false">${criterion.label}</button>`
      : criterion.label;

    return `
      <tr class="criterion-row${muted}">
        <th>${label}</th>
        <td class="num">${formatRaw(criterion, props)}</td>
        <td class="bar">
          <span style="width:${score ?? 0}%;background:${rampColor(score)}"></span>
        </td>
        <td class="num score">${score == null ? "—" : scoreFormat.format(score)}</td>
      </tr>
      ${detailRows(criterion.key, props)}`;
  }).join("");

  return `
    <div class="commune-popup">
      <header>
        <h3>${props.name}</h3>
        <p class="popup-meta">
          ${props.code_insee} · ${numberFormat.format(props.population)} hab.
        </p>
        <p class="popup-zones">${zoneLinks(props)}</p>
      </header>

      <div class="popup-score" style="border-color:${rampColor(composite)}">
        <span class="popup-score-value">${composite == null ? "—" : scoreFormat.format(composite)}</span>
        <span class="popup-score-label">score composite</span>
      </div>

      <table>${rows}</table>

      <p class="popup-footnote">
        Loyer : moyenne appartement et maison, en €/m². Équipements accessibles
        dans un rayon de ${NEARBY_RADIUS_KM} km, soit
        ${numberFormat.format(props[`population_${NEARBY_RADIUS_KM}km`])} habitants.
        Les scores suivent une échelle logarithmique : passer de 1 à 10 équipements
        pèse plus que de 300 à 3 000. Ils sont relatifs aux
        ${numberFormat.format(scopeCount)} communes de « ${scope.label} » : un 100 est le meilleur de cette sélection, pas de la région.
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
    attributionControl: { compact: true, customAttribution: SOURCE_ATTRIBUTION },
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
      paint: {
        "fill-color": fillColorExpression(),
        // Out-of-scope communes stay on the map, faded: a small
        // intercommunalité floating on the basemap with nothing around it is
        // impossible to place. Their composite is null, so they are already
        // painted the no-data grey.
        "fill-opacity": ["case", ["boolean", ["feature-state", "inScope"], true], 0.78, 0.22],
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

    const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "340px" });
    const rankingList = document.getElementById("ranking-list");
    const rankingCount = document.getElementById("ranking-count");

    // MapLibre hands click events its own copy of the properties, taken when
    // the source was added — it never sees the scores applyScores() writes.
    // Everything downstream of a click reads from here instead.
    const byCode = new Map(communes.features.map((f) => [f.properties.code_insee, f]));

    const scopes = buildScopes(communes.features);
    scope = scopes[0];
    let inScope = communes.features;

    let selected = null;

    function select(props, lngLat) {
      selected = props.code_insee;
      map.setFilter("communes-selected", ["==", ["get", "code_insee"], selected]);
      popup.setLngLat(lngLat).setHTML(popupHtml(props)).addTo(map);
      wirePopup(popup);
      renderRanking();
    }

    // setHTML replaces the popup's contents wholesale, so listeners have to
    // be reattached every time rather than bound once.
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

          // One section at a time: with eight criteria already listed, two
          // open sections make the popup taller than the map has room for
          // on either side of the point.
          for (const other of toggles) {
            const show = other === toggle && !open;
            other.setAttribute("aria-expanded", String(show));
            for (const row of element.querySelectorAll(`.row-detail[data-group="${other.dataset.group}"]`)) {
              row.hidden = !show;
            }
          }

          // MapLibre chooses which side of the point to hang the popup from
          // when it opens, using the height at that moment. Expanding a
          // section changes that height, and nothing re-picks on its own —
          // so a grown popup runs off the top of the map. Re-setting the
          // location forces the anchor to be recomputed.
          instance.setLngLat(instance.getLngLat());
        });
      }
    }

    function renderRanking() {
      const ranked = inScope
        .map((feature) => ({ props: feature.properties, score: compositeScore(feature.properties) }))
        .filter((entry) => entry.score != null)
        .sort((a, b) => b.score - a.score);

      const shown = Math.min(RANKING_LENGTH, ranked.length);
      rankingCount.textContent = `${shown} sur ${numberFormat.format(ranked.length)}`;

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

    // Rescoring touches every criterion on every commune, so it runs on a
    // scope change only — not on every slider move, which merely reweights
    // scores that are already there.
    function rescope(next) {
      scope = next;
      inScope = communes.features.filter((feature) => scope.matches(feature.properties));
      scopeCount = inScope.length;

      applyScores(communes.features, inScope);

      for (const feature of communes.features) {
        map.setFeatureState(
          { source: "communes", id: feature.properties.code_insee },
          { inScope: scope.matches(feature.properties) }
        );
      }

      // An open popup is now showing scores from the previous comparison set.
      // Redraw it where the commune survived the change, drop it where it did
      // not — watching one commune's numbers move as you narrow the scope is
      // the clearest demonstration of what this control does.
      if (selected && scope.matches(byCode.get(selected).properties)) {
        popup.setHTML(popupHtml(byCode.get(selected).properties));
        wirePopup(popup);
      } else if (selected) {
        selected = null;
        map.setFilter("communes-selected", ["==", ["get", "code_insee"], ""]);
        popup.remove();
      }

      refresh();
    }

    // The one way in: the picker, the popup's zone links and clicking a faded
    // commune all land here, so the select stays in step with choices made on
    // the map.
    function selectScope(next) {
      rescope(next);
      scopeSelect.value = next.id;

      if (next.id === scopes[0].id) map.easeTo({ center: IDF_CENTER, zoom: IDF_ZOOM });
      else map.fitBounds(bounds(inScope), { padding: 40 });
    }

    const scopeSelect = renderScopeSelect(document.getElementById("scope"), scopes, selectScope);

    renderSliders(document.getElementById("sliders"), weights, refresh);
    renderLegend(document.getElementById("legend"));
    rescope(scope);

    map.on("click", "communes-fill", (event) => {
      const feature = byCode.get(event.features[0].properties.code_insee);
      if (!feature) return;

      // Clicking outside the comparison set moves it rather than opening a
      // popup full of blanks: the zone jumps to the one the click landed in,
      // at the granularity already in use. That makes the map a way of
      // walking from one intercommunalité to the next.
      if (scope.matches(feature.properties)) {
        select(feature.properties, event.lngLat);
        return;
      }

      const zone = siblingZone(scope, feature.properties);
      if (zone) selectScope(scopes.find((candidate) => candidate.id === zone.id));
    });

    // mousemove rather than mouseenter: the cursor has to answer "what does
    // clicking *this* commune do", and moving between two communes never
    // re-fires mouseenter.
    map.on("mousemove", "communes-fill", (event) => {
      const feature = byCode.get(event.features[0].properties.code_insee);
      const inside = feature && scope.matches(feature.properties);
      map.getCanvas().style.cursor = feature && (inside || siblingZone(scope, feature.properties)) ? "pointer" : "";
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

function outerRings(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
}

// [[west, south], [east, north]] over a set of features, for fitBounds.
function bounds(features) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const feature of features) {
    for (const ring of outerRings(feature.geometry)) {
      for (const [lng, lat] of ring) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
  }
  return [
    [west, south],
    [east, north],
  ];
}

// Average of the outer-ring vertices — close enough to place a popup and a
// map centre, and far cheaper than a true centroid on 1285 polygons.
function centroid(geometry) {
  const rings = outerRings(geometry);
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
