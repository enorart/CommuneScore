// Travel time from one commune to every other one: the map recoloured by
// minutes instead of by score.
//
// The data is a dense 1285 x 1285 matrix of uint8 minutes per mode, not
// isochrone polygons. That is why a time-limit slider costs nothing here --
// it is a threshold on one row, not a different file. See etl/isochrone/.
//
// Same lazy-loading contract as network.js: this module exports a catalogue
// and pure functions, app.js owns the state, and nothing is fetched until the
// user asks for it.

export const INDEX_URL = "./data/temps_index.json";

// Keys match MODES in etl/isochrone/__init__.py. No car: R5 and OSRM both compute
// free-flow times from OSM speed limits and no open source publishes
// congestion for Ile-de-France, so a car layer would claim the A86 runs at
// 110 km/h at 08:00. Left out rather than shipped behind a caveat.
export const MODES = [
  { key: "transit", label: "Transports", url: "./data/temps_transit.bin.gz" },
  { key: "velo", label: "Vélo", url: "./data/temps_velo.bin.gz" },
  { key: "marche", label: "Marche", url: "./data/temps_marche.bin.gz" },
];

// Matches UNREACHABLE in etl/isochrone/__init__.py.
export const UNREACHABLE = 255;

export const LIMITS = [15, 30, 45, 60, 90, 120];
export const DEFAULT_LIMIT = 45;

/**
 * Fetch and inflate one mode's matrix.
 *
 * The files are gzipped by the ETL rather than by the server: GitHub Pages
 * does compress what it serves, but on a content-type allowlist that
 * application/octet-stream is not on.
 *
 * Whether the body still needs inflating on arrival is decided by **looking at
 * it**, not by trusting a header. Vite's dev server sends these with
 * `Content-Encoding: gzip`, so the browser has already inflated the body by
 * the time we see it; a plain static host sends the bytes untouched. The gzip
 * magic number tells the two apart with no guessing, and costs one buffer copy
 * of at most 1.6 MB.
 */
export async function loadMatrix(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);

  const body = new Uint8Array(await response.arrayBuffer());
  if (body[0] !== 0x1f || body[1] !== 0x8b) return body;

  const inflated = new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(inflated).arrayBuffer());
}

/** The row of travel times out of commune `index`. A view, not a copy. */
export function rowFor(matrix, index, count) {
  return matrix.subarray(index * count, (index + 1) * count);
}

const NOTE = `
  Temps <strong>de porte à porte depuis le chef-lieu</strong> de la commune, un
  mardi à 08:00, médiane sur une heure de départ possible. Une commune dont les
  habitants vivent loin de son bourg est donc mesurée depuis un endroit où ils
  n’habitent pas. <strong>Pas de voiture</strong> : aucune source ouverte ne
  publie la congestion francilienne, et un temps à vitesse libre serait faux du
  simple au double aux heures de pointe. Au-delà de 2 h, rien n’est calculé.
  À pied et à vélo, l’essentiel de ce qu’on atteint est dans sa propre commune,
  que la carte ne découpe pas.`;

export function renderTravelControl(container, state, { onMode, onLimit, onExit }) {
  // The control is re-rendered whenever the origin or the mode changes, so an
  // opened note has to survive that: it explains the whole measurement, and
  // having it snap shut on every click is how a reader loses their place.
  const noteWasOpen = container.querySelector("#travel-note")?.hidden === false;

  container.innerHTML = `
    <p class="legend-title">
      Depuis ${state.originName}
      <button type="button" class="criterion-info" id="travel-info" aria-expanded="false"
              aria-controls="travel-note" aria-label="Comment ces temps sont calculés"
              title="Comment ces temps sont calculés">i</button>
    </p>
    <div class="travel-modes">
      ${MODES.map(
        ({ key, label }) =>
          `<button type="button" class="travel-toggle" data-mode="${key}"
                   aria-pressed="${state.mode === key}">${label}</button>`
      ).join("")}
    </div>
    <label class="travel-limit">
      <span>Moins de <output>${state.limit}</output> min</span>
      <input type="range" min="0" max="${LIMITS.length - 1}" step="1"
             value="${LIMITS.indexOf(state.limit)}" aria-label="Limite de temps" />
    </label>
    <button type="button" class="travel-exit">Retour aux scores</button>
    <p class="travel-note" id="travel-note" ${noteWasOpen ? "" : "hidden"}>${NOTE}</p>
  `;

  const info = container.querySelector("#travel-info");
  const note = container.querySelector("#travel-note");
  info.setAttribute("aria-expanded", String(noteWasOpen));
  info.addEventListener("click", () => {
    note.hidden = !note.hidden;
    info.setAttribute("aria-expanded", String(!note.hidden));
  });

  container.querySelector(".travel-exit").addEventListener("click", onExit);

  // `input`, not `change`: the map recolours as the slider is dragged, the way
  // the weight sliders already do.
  const slider = container.querySelector(".travel-limit input");
  const output = container.querySelector(".travel-limit output");
  slider.addEventListener("input", () => {
    const limit = LIMITS[Number(slider.value)];
    output.textContent = limit;
    onLimit(limit);
  });

  for (const button of container.querySelectorAll(".travel-toggle")) {
    button.addEventListener("click", () => {
      if (button.dataset.mode === state.mode) return;
      onMode(button.dataset.mode);
    });
  }
}
