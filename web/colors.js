// The one colour scale on the page. The map, the ranking spines, the popup
// bars and the legend all read from it, so a shade means the same thing
// everywhere and a single legend explains all of them.
//
// Sand through to deep marine, monotonically darkening, so it survives being
// read as pure lightness.
//
// Travel time is the one exception, and it gets its own ramp below: it is not
// a score, it answers a different question on a different unit, and reusing
// the blues made a 25-minute commune look like a well-scoring one. Reds keep
// the two readings apart at a glance.

const RAMP = [
  [0, [244, 238, 226]],
  [25, [202, 220, 210]],
  [50, [143, 189, 187]],
  [75, [75, 138, 155]],
  [100, [23, 73, 95]],
];

// The travel-time ramp. Same construction as RAMP -- five stops, monotonically
// darkening, so lightness alone still carries the ordering -- but on reds, and
// walked backwards by the two functions below so the darkest end lands on zero
// minutes. Anchored on #e5533d at the 75 stop.
const TRAVEL_RAMP = [
  [0, [253, 240, 233]],
  [25, [250, 208, 190]],
  [50, [242, 152, 126]],
  [75, [229, 83, 61]],
  [100, [138, 32, 26]],
];

const NO_DATA_COLOR = "#DDDDCA";

function rgb([r, g, b]) {
  return `rgb(${r} ${g} ${b})`;
}

// Linear interpolation through RAMP, matching MapLibre's own `interpolate`
// so JS rendered bars and GPU rendered polygons agree exactly.
export function rampColor(score) {
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

// The same ramp as a MapLibre paint expression, reading the composite out of
// feature state. (-1 means "no composite yet, or every weight at zero".)
export function fillColorExpression() {
  const score = ["coalesce", ["feature-state", "composite"], -1];
  const stops = RAMP.flatMap(([stop, color]) => [stop, rgb(color)]);
  return ["case", ["<", score, 0], NO_DATA_COLOR, ["interpolate", ["linear"], score, ...stops]];
}

export function renderLegend(container) {
  const gradient = RAMP.map(([stop, color]) => `${rgb(color)} ${stop}%`).join(", ");
  container.innerHTML = `
    <p class="legend-title">Score composite</p>
    <div class="legend-scale" style="background:linear-gradient(90deg, ${gradient})"></div>
    <div class="legend-ticks"><span>0</span><span>50</span><span>100</span></div>
  `;
}

/**
 * TRAVEL_RAMP over minutes, reversed: 0 minutes is the dark end. Reads a
 * `minutes` feature state, which app.js writes in place of `composite`;
 * UNREACHABLE and anything past the limit come through as the no-data colour.
 *
 * `limit` is the user's time cut-off, not the ETL's 120-minute cap: colouring
 * over the visible range rather than the full one is what makes a 30-minute
 * view legible instead of five shades of the same dark.
 */
export function travelColorExpression(limit) {
  const minutes = ["coalesce", ["feature-state", "minutes"], -1];

  // TRAVEL_RAMP walked backwards, so its dark end lands on 0 minutes. MapLibre
  // needs the stops ascending.
  const stops = [];
  for (const [stop, color] of [...TRAVEL_RAMP].reverse()) {
    stops.push(((100 - stop) / 100) * limit, rgb(color));
  }

  return [
    "case",
    ["any", ["<", minutes, 0], [">", minutes, limit]],
    NO_DATA_COLOR,
    ["interpolate", ["linear"], minutes, ...stops],
  ];
}

export function renderTravelLegend(container, limit) {
  // Reversed before mapping, not after: linear-gradient needs its stops in
  // ascending order and silently clamps each one to the previous maximum
  // otherwise, which collapses the whole bar to its lightest colour.
  const gradient = [...TRAVEL_RAMP]
    .reverse()
    .map(([stop, color]) => `${rgb(color)} ${100 - stop}%`)
    .join(", ");
  container.innerHTML = `
    <p class="legend-title">Temps de trajet</p>
    <div class="legend-scale" style="background:linear-gradient(90deg, ${gradient})"></div>
    <div class="legend-ticks"><span>0</span><span>${Math.round(limit / 2)}</span><span>${limit} min</span></div>
  `;
}
